package controller

import (
	"html"
	"math"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/service/sitepage"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

// currentSitePage collects what the site shows a visitor who is not signed in.
func currentSitePage() sitepage.Site {
	settings := system_setting.GetSitePageSettings()
	site := sitepage.Site{
		BaseURL:         strings.TrimRight(system_setting.ServerAddress, "/"),
		Language:        settings.DefaultLanguage,
		HomeTitle:       settings.HomeTitle,
		HomeDescription: settings.HomeDescription,
		PricingPublic:   middleware.HeaderNavModuleOpen("pricing"),
		RankingsPublic:  middleware.HeaderNavModuleOpen("rankings"),
		GuidePublic:     middleware.HeaderNavModuleOpen("guide"),
		PreviewImage:    "/logo.png",
		// The build's own date is the date its content was made, and a
		// development build gives none, so the sitemap states no date at all.
		LastModified: sitepage.BuildDate(common.Version),
		Models:       publicSitePageModels,
	}

	common.OptionMapRWMutex.RLock()
	site.Name = common.SystemName
	site.Logo = common.Logo
	site.HomeContent = common.OptionMap["HomePageContent"]
	site.AboutContent = common.OptionMap["About"]
	common.OptionMapRWMutex.RUnlock()
	return site
}

// sitePageModelsCache holds the model list the public pages show. Every HTML
// request and the sitemap ask for it, and reading a price means running a
// billing expression, so the list is kept for a moment instead of being built
// again for each request. A price change shows up within the TTL. The list is
// shared, so a caller that reorders it must copy it first.
var (
	sitePageModelsCache     []sitepage.Model
	sitePageModelsCachedAt  time.Time
	sitePageModelsCacheLock sync.Mutex
)

// sitePageModelsCacheTTL is how long the public model list stays valid.
const sitePageModelsCacheTTL = time.Minute

// publicSitePageModels lists the models the model page shows a visitor who is
// not signed in, in name order, with the price of each one.
func publicSitePageModels() []sitepage.Model {
	sitePageModelsCacheLock.Lock()
	defer sitePageModelsCacheLock.Unlock()
	if sitePageModelsCache != nil && time.Since(sitePageModelsCachedAt) < sitePageModelsCacheTTL {
		return sitePageModelsCache
	}

	vendors := map[int]string{}
	for _, vendor := range model.GetVendors() {
		vendors[vendor.ID] = vendor.Name
	}
	pricing := filterPricingByUsableGroups(model.GetPricing(), service.GetUserUsableGroups(""))
	models := make([]sitepage.Model, 0, len(pricing))
	for _, item := range pricing {
		// A row without a name has no page to link to: the sitemap would carry
		// the bare /pricing/ twice and a model page would be an empty link.
		if strings.TrimSpace(item.ModelName) == "" {
			continue
		}
		entry := sitepage.Model{
			Name:        item.ModelName,
			Description: item.Description,
			Vendor:      vendors[item.VendorID],
			Series:      item.Series,
		}
		if item.BillingMode == billing_setting.BillingModeTieredExpr && strings.TrimSpace(item.BillingExpr) != "" {
			entry.InputPrice, entry.OutputPrice = sitePageTokenPrice(item.BillingExpr)
		}
		models = append(models, entry)
	}
	sort.Slice(models, func(i, j int) bool { return models[i].Name < models[j].Name })

	sitePageModelsCache = models
	sitePageModelsCachedAt = time.Now()
	return models
}

// sitePageTokenPrice reads a billing expression as dollars per million tokens.
// An expression's coefficients are those prices and its output is tokens times
// the coefficient, so one token gives the price itself. Leaving the context
// length at zero selects the base tier. A model priced per request or image,
// or one whose expression cannot be read, has no token price: both are 0.
func sitePageTokenPrice(expression string) (input, output float64) {
	input, inputTrace, err := billingexpr.RunExpr(expression, billingexpr.TokenParams{P: 1})
	if err != nil || inputTrace.BillingUnit != billingexpr.BillingUnitToken || !usablePrice(input) {
		return 0, 0
	}
	output, outputTrace, err := billingexpr.RunExpr(expression, billingexpr.TokenParams{C: 1})
	if err != nil || outputTrace.BillingUnit != billingexpr.BillingUnitToken || !usablePrice(output) {
		return 0, 0
	}
	return input, output
}

// usablePrice reports whether a price read from an expression can be shown.
func usablePrice(price float64) bool {
	return price > 0 && !math.IsNaN(price) && !math.IsInf(price, 0)
}

// SitePage returns the front end's shell as it is served for this request:
// with the page's own title, description and text.
func SitePage(c *gin.Context, shell []byte) []byte {
	environment := "production"
	if value, ok := c.Get(service.EnvironmentConfigContextKey); ok {
		if config, ok := value.(*service.EnvironmentConfig); ok && config.Role == "staging" {
			environment = "staging"
		}
	}
	page := currentSitePage().Render(shell, c.Request.URL.EscapedPath())
	metadata := `<meta name="new-api-environment" content="` + environment + `"><meta name="new-api-environment-version" content="` + html.EscapeString(common.Version) + `">`
	return []byte(strings.Replace(string(page), "</head>", metadata+"</head>", 1))
}

func GetRobotsTxt(c *gin.Context) {
	c.Header("Cache-Control", "public, max-age=3600")
	c.String(http.StatusOK, currentSitePage().Robots())
}

func GetSitemap(c *gin.Context) {
	sitemap := currentSitePage().Sitemap()
	if sitemap == nil {
		c.Status(http.StatusNotFound)
		return
	}
	c.Header("Cache-Control", "public, max-age=3600")
	c.Data(http.StatusOK, "application/xml; charset=utf-8", sitemap)
}
