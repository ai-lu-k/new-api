package controller

import (
	"net/http"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/service/sitepage"
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
		Models:          publicSitePageModels,
	}

	common.OptionMapRWMutex.RLock()
	site.Name = common.SystemName
	site.Logo = common.Logo
	site.HomeContent = common.OptionMap["HomePageContent"]
	site.AboutContent = common.OptionMap["About"]
	common.OptionMapRWMutex.RUnlock()
	return site
}

// publicSitePageModels lists the models the model page shows a visitor who is
// not signed in, in name order.
func publicSitePageModels() []sitepage.Model {
	vendors := map[int]string{}
	for _, vendor := range model.GetVendors() {
		vendors[vendor.ID] = vendor.Name
	}
	pricing := filterPricingByUsableGroups(model.GetPricing(), service.GetUserUsableGroups(""))
	models := make([]sitepage.Model, 0, len(pricing))
	for _, item := range pricing {
		models = append(models, sitepage.Model{
			Name:        item.ModelName,
			Description: item.Description,
			Vendor:      vendors[item.VendorID],
		})
	}
	sort.Slice(models, func(i, j int) bool { return models[i].Name < models[j].Name })
	return models
}

// SitePage returns the front end's shell as it is served for this request:
// with the page's own title, description and text.
func SitePage(c *gin.Context, shell []byte) []byte {
	return currentSitePage().Render(shell, c.Request.URL.EscapedPath())
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
