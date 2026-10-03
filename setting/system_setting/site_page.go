package system_setting

import (
	"fmt"
	"slices"

	"github.com/QuantumNous/new-api/setting/config"
)

// SitePageLanguages are the interface languages a site can make its default,
// as BCP 47 tags.
var SitePageLanguages = []string{"en", "zh-CN", "zh-TW", "fr", "ru", "ja", "vi"}

// SitePageSettings is managed by config.GlobalConfig.Register.
// DB keys: site_page.default_language, site_page.home_title,
// site_page.home_description
type SitePageSettings struct {
	// DefaultLanguage is the language a visitor gets before choosing one. Empty
	// follows the browser, which shows a crawler the English interface whatever
	// language the site is written in.
	DefaultLanguage string `json:"default_language"`
	// HomeTitle and HomeDescription are the home page's title and summary in
	// search results. Empty derives them from the stored home page.
	HomeTitle       string `json:"home_title"`
	HomeDescription string `json:"home_description"`
}

var sitePageSettings = SitePageSettings{}

func init() {
	config.GlobalConfig.Register("site_page", &sitePageSettings)
}

func GetSitePageSettings() *SitePageSettings {
	return &sitePageSettings
}

// CheckSitePageLanguage validates the default language before it is saved.
func CheckSitePageLanguage(language string) error {
	if language == "" || slices.Contains(SitePageLanguages, language) {
		return nil
	}
	return fmt.Errorf("default language %q is not one of %v", language, SitePageLanguages)
}
