package sitepage

import (
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/i18n"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// shell is the front end's built index page.
const shell = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>New API</title>
    <meta name="title" content="New API" />
    <meta
      name="description"
      content="Unified AI API gateway and admin dashboard."
    />
  <link rel="icon" href="/favicon.ico"><script defer src="/static/js/index.js"></script></head>

  <body>
    <div id="root" translate="no" class="notranslate"></div>
  </body>
</html>
`

const storedHome = `<style>.luk { color: red } h1 { display: none }</style>
<div class="luk" onclick="steal()">
  <h1 class="luk-h1">统一 API 网关<br><span>成本透明，</span><span>代码开源</span></h1>
  <p class="luk-sub">
    一个兼容 OpenAI 协议的接口地址，即可调用<a href="/pricing">全部可用模型</a>。<br>
    代码放在 <a href="https://github.com/example/gateway" target="_blank">GitHub</a> 上。
  </p>
  <a class="luk-btn" href="javascript:alert(1)">查看模型</a>
  <script>alert('x')</script>
  <iframe src="https://example.org/"></iframe>
  <img src="x" onerror="alert(1)">
</div>`

func TestMain(m *testing.M) {
	if err := i18n.Init(); err != nil {
		panic(err)
	}
	os.Exit(m.Run())
}

func site() Site {
	return Site{
		Name:           "LUK",
		BaseURL:        "https://ai.example.com",
		Language:       "zh-CN",
		Logo:           "/logo.png",
		HomeContent:    storedHome,
		AboutContent:   "# 成本\n\n每一项成本都列在这里。",
		PricingPublic:  true,
		RankingsPublic: true,
		Models: func() []Model {
			return []Model{
				{Name: "deepseek-v4.1-flash-x0.25", Description: "DeepSeek 的通用模型", Vendor: "DeepSeek"},
				{Name: "z-ai/glm-5.3"},
			}
		},
	}
}

// root returns what the shell holds where the front end renders.
func root(t *testing.T, page string) string {
	t.Helper()
	_, after, found := strings.Cut(page, `<div id="root" translate="no" class="notranslate">`)
	require.True(t, found, "the root element is still there")
	inside, _, found := strings.Cut(after, "</div>\n  </body>")
	require.True(t, found, "the root element is still closed")
	return inside
}

func TestHomePageCarriesItsStoredText(t *testing.T) {
	page := string(site().Render([]byte(shell), "/"))

	assert.Contains(t, page, `<html lang="zh-CN" data-default-lang="zh-CN">`)
	assert.Contains(t, page, "<title>LUK · 统一 API 网关 成本透明，代码开源</title>")
	assert.Contains(t, page, `<meta name="title" content="LUK · 统一 API 网关 成本透明，代码开源" />`)
	assert.Contains(t, page,
		`<meta name="description" content="一个兼容 OpenAI 协议的接口地址，即可调用全部可用模型。 代码放在 GitHub 上。" />`)
	assert.Contains(t, page, `<link rel="canonical" href="https://ai.example.com/">`)
	assert.Contains(t, page, `<meta property="og:image" content="https://ai.example.com/logo.png">`)
	assert.NotContains(t, page, "noindex")
	assert.NotContains(t, page, "Unified AI API gateway", "the shell's own description is replaced")

	text := root(t, page)
	assert.True(t, strings.HasPrefix(text, "<div data-prerender>"), "the text is marked for the front end to replace")
	assert.Contains(t, text, "<h1>统一 API 网关<br>成本透明，代码开源</h1>")
	assert.Contains(t, text, `<a href="/pricing">全部可用模型</a>`)
	assert.Contains(t, text, `<a href="https://github.com/example/gateway">GitHub</a>`)
	assert.Contains(t, text, "查看模型", "a link that is not an address keeps its text")
	assert.Contains(t, text, `<nav><a href="/">首页</a> · <a href="/pricing">模型广场</a> · <a href="/rankings">排行榜</a> · <a href="/about">关于</a></nav>`)

	for _, unsafe := range []string{"<style", "<script", "<iframe", "<img", "onclick", "onerror", "javascript:", "class=", "alert", "steal"} {
		assert.NotContains(t, text, unsafe, "stored content cannot run or restyle the page")
	}
}

func TestHomePageTitleAndDescriptionCanBeSet(t *testing.T) {
	s := site()
	s.HomeTitle = `DeepSeek 中转 "低价" <LUK>`
	s.HomeDescription = "兼容 OpenAI 协议 & 人民币结算"
	page := string(s.Render([]byte(shell), "/"))

	assert.Contains(t, page, "<title>DeepSeek 中转 &#34;低价&#34; &lt;LUK&gt;</title>")
	assert.Contains(t, page, `<meta name="description" content="兼容 OpenAI 协议 &amp; 人民币结算" />`)
}

func TestHomePageWithoutStoredTextKeepsTheShell(t *testing.T) {
	for name, stored := range map[string]string{
		"nothing stored":   "",
		"an embedded page": "https://example.org/landing",
	} {
		t.Run(name, func(t *testing.T) {
			s := site()
			s.HomeContent = stored
			page := string(s.Render([]byte(shell), "/"))

			assert.Contains(t, page, "<title>LUK</title>")
			assert.Contains(t, page, "Unified AI API gateway", "no description to offer")
			assert.Empty(t, root(t, page))
			assert.NotContains(t, page, "data-prerender", "no style for text that is not there")
		})
	}
}

func TestMarkdownPagesAreRead(t *testing.T) {
	page := string(site().Render([]byte(shell), "/about/"))

	assert.Contains(t, page, "<title>关于 · LUK</title>")
	assert.Contains(t, page, `<meta name="description" content="每一项成本都列在这里。" />`)
	assert.Contains(t, page, `<link rel="canonical" href="https://ai.example.com/about">`)
	assert.Contains(t, root(t, page), "<h1>成本</h1><p>每一项成本都列在这里。</p>")
}

func TestModelPages(t *testing.T) {
	s := site()

	list := string(s.Render([]byte(shell), "/pricing"))
	assert.Contains(t, list, "<title>模型广场 · LUK</title>")
	assert.Contains(t, list, `content="LUK 上全部 2 个可用模型，以及它们的价格、延迟和吞吐。"`)
	assert.Contains(t, root(t, list),
		`<li><a href="/pricing/deepseek-v4.1-flash-x0.25">deepseek-v4.1-flash-x0.25</a> — DeepSeek 的通用模型</li>`+
			`<li><a href="/pricing/z-ai%2Fglm-5.3">z-ai/glm-5.3</a></li>`)

	described := string(s.Render([]byte(shell), "/pricing/deepseek-v4.1-flash-x0.25"))
	assert.Contains(t, described, "<title>deepseek-v4.1-flash-x0.25 · LUK</title>")
	assert.Contains(t, described, `<meta name="description" content="DeepSeek 的通用模型" />`)
	assert.Contains(t, described, `<link rel="canonical" href="https://ai.example.com/pricing/deepseek-v4.1-flash-x0.25">`)
	assert.Contains(t, root(t, described), "<h1>deepseek-v4.1-flash-x0.25</h1><p>DeepSeek 的通用模型</p><p>供应商：DeepSeek</p>")

	// A name with a slash arrives escaped, or as written by hand.
	for _, path := range []string{"/pricing/z-ai%2Fglm-5.3", "/pricing/z-ai/glm-5.3"} {
		bare := string(s.Render([]byte(shell), path))
		assert.Contains(t, bare, "<title>z-ai/glm-5.3 · LUK</title>", path)
		assert.Contains(t, bare, `content="z-ai/glm-5.3 在 LUK 上的价格与调用方式。"`, path)
		assert.Contains(t, bare, `<link rel="canonical" href="https://ai.example.com/pricing/z-ai%2Fglm-5.3">`, path)
	}
}

func TestPagesNotForSearchEngines(t *testing.T) {
	closed := site()
	closed.PricingPublic = false

	for name, tc := range map[string]struct {
		site Site
		path string
	}{
		"the console":                   {site(), "/dashboard"},
		"sign-in":                       {site(), "/sign-in"},
		"a model that is not sold":      {site(), "/pricing/no-such-model"},
		"a name that cannot be read":    {site(), "/pricing/%zz"},
		"models behind sign-in":         {closed, "/pricing"},
		"a model page behind sign-in":   {closed, "/pricing/deepseek-v4.1-flash-x0.25"},
		"an address that leads nowhere": {site(), "/tavern"},
	} {
		t.Run(name, func(t *testing.T) {
			page := string(tc.site.Render([]byte(shell), tc.path))

			assert.Contains(t, page, `<meta name="robots" content="noindex">`)
			assert.Contains(t, page, "<title>LUK</title>")
			assert.NotContains(t, page, "canonical")
			assert.Empty(t, root(t, page))
		})
	}
}

func TestSiteWithoutSettingsServesTheShellItWasBuiltWith(t *testing.T) {
	s := Site{Name: "New API"}
	page := string(s.Render([]byte(shell), "/"))

	assert.Contains(t, page, `<html lang="en">`)
	assert.Contains(t, page, "<title>New API</title>")
	assert.Contains(t, page, `<meta name="title" content="New API" />`)
	assert.Contains(t, page, "Unified AI API gateway and admin dashboard.")
	assert.NotContains(t, page, "canonical", "the site's address is not known")
	assert.Empty(t, root(t, page))

	english := s
	english.RankingsPublic = true
	assert.Contains(t, string(english.Render([]byte(shell), "/rankings")), "<title>Rankings · New API</title>",
		"a site with no default language is described in English")
}

func TestShellThatChangedIsLeftAlone(t *testing.T) {
	other := []byte("<html><head></head><body><main></main></body></html>")
	page := string(site().Render(other, "/"))

	assert.Contains(t, page, "<main></main>", "nowhere known to put the text")
	assert.NotContains(t, page, "data-prerender")
	assert.Contains(t, page, `<link rel="canonical" href="https://ai.example.com/">`)
}

func TestRobotsAndSitemap(t *testing.T) {
	s := site()

	robots := s.Robots()
	assert.Contains(t, robots, "User-agent: *\nAllow: /\n")
	assert.NotContains(t, robots, "Disallow", "the pages need the API to render")
	assert.Contains(t, robots, "Sitemap: https://ai.example.com/sitemap.xml")

	sitemap := string(s.Sitemap())
	for _, address := range []string{
		"https://ai.example.com/",
		"https://ai.example.com/pricing",
		"https://ai.example.com/pricing/deepseek-v4.1-flash-x0.25",
		"https://ai.example.com/pricing/z-ai%2Fglm-5.3",
		"https://ai.example.com/rankings",
		"https://ai.example.com/about",
	} {
		assert.Contains(t, sitemap, "<loc>"+address+"</loc>")
	}
	assert.Equal(t, 6, strings.Count(sitemap, "<url>"))

	s.PricingPublic = false
	s.AboutContent = ""
	sitemap = string(s.Sitemap())
	assert.Equal(t, 2, strings.Count(sitemap, "<url>"), "only the pages a visitor can open")
	assert.NotContains(t, sitemap, "pricing")

	s.BaseURL = ""
	assert.Nil(t, s.Sitemap(), "a sitemap needs absolute addresses")
	assert.NotContains(t, s.Robots(), "Sitemap")
}

func TestLongDescriptionsAreCut(t *testing.T) {
	s := site()
	s.HomeContent = "<h1>标题</h1><p>" + strings.Repeat("很长的一段话。", 60) + "</p>"
	page := s.Page("/")

	assert.Len(t, []rune(page.Description), descriptionLength)
	assert.True(t, strings.HasSuffix(page.Description, "…"))
}
