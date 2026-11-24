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

const storedHome = `<style>.demo { color: red } h1 { display: none }</style>
<div class="demo" onclick="steal()">
  <h1 class="demo-h1">统一 API 网关<br><span>成本透明，</span><span>代码开源</span></h1>
  <p class="demo-sub">
    一个兼容 OpenAI 协议的接口地址，即可调用<a href="/pricing">全部可用模型</a>。<br>
    代码放在 <a href="https://github.com/example/gateway" target="_blank">GitHub</a> 上。
  </p>
  <a class="demo-btn" href="javascript:alert(1)">查看模型</a>
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
		Name:           "DEMO",
		BaseURL:        "https://ai.example.com",
		Language:       "zh-CN",
		Logo:           "/logo.png",
		HomeContent:    storedHome,
		AboutContent:   "# 成本\n\n每一项成本都列在这里。",
		PricingPublic:  true,
		RankingsPublic: true,
		Models: func() []Model {
			return []Model{
				{Name: "deepseek-v4.1-flash-x0.25", Description: "DeepSeek 的通用模型", Vendor: "DeepSeek", Series: "DeepSeek", InputPrice: 2, OutputPrice: 8},
				{Name: "z-ai/glm-5.3", Series: "GLM", InputPrice: 0.8, OutputPrice: 2.8},
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
	assert.Contains(t, page, "<title>DEMO · 统一 API 网关 成本透明，代码开源</title>")
	assert.Contains(t, page, `<meta name="title" content="DEMO · 统一 API 网关 成本透明，代码开源" />`)
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
	assert.Contains(t, text, `<nav><a href="/">首页</a> · <a href="/pricing">模型广场</a> · <a href="/cheap">便宜模型</a> · <a href="/rankings">公开数据</a> · <a href="/about">关于</a></nav>`)

	for _, unsafe := range []string{"<style", "<script", "<iframe", "<img", "onclick", "onerror", "javascript:", "class=", "alert", "steal"} {
		assert.NotContains(t, text, unsafe, "stored content cannot run or restyle the page")
	}
}

func TestHomePageTitleAndDescriptionCanBeSet(t *testing.T) {
	s := site()
	s.HomeTitle = `DeepSeek 中转 "低价" <DEMO>`
	s.HomeDescription = "兼容 OpenAI 协议 & 人民币结算"
	page := string(s.Render([]byte(shell), "/"))

	assert.Contains(t, page, "<title>DeepSeek 中转 &#34;低价&#34; &lt;DEMO&gt;</title>")
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

			assert.Contains(t, page, "<title>DEMO</title>")
			assert.Contains(t, page, "Unified AI API gateway", "no description to offer")
			assert.Empty(t, root(t, page))
			assert.NotContains(t, page, "data-prerender", "no style for text that is not there")
		})
	}
}

func TestMarkdownPagesAreRead(t *testing.T) {
	page := string(site().Render([]byte(shell), "/about/"))

	assert.Contains(t, page, "<title>关于 · DEMO</title>")
	assert.Contains(t, page, `<meta name="description" content="每一项成本都列在这里。" />`)
	assert.Contains(t, page, `<link rel="canonical" href="https://ai.example.com/about">`)
	assert.Contains(t, root(t, page), "<h1>成本</h1><p>每一项成本都列在这里。</p>")
}

func TestModelPages(t *testing.T) {
	s := site()

	list := string(s.Render([]byte(shell), "/pricing"))
	assert.Contains(t, list, "<title>模型广场 · DEMO</title>")
	assert.Contains(t, list, `content="DEMO 上全部 2 个可用模型，以及它们的价格、延迟和吞吐。"`)
	assert.Contains(t, root(t, list),
		`<li><a href="/pricing/deepseek-v4.1-flash-x0.25">deepseek-v4.1-flash-x0.25</a> — 输入 $2 / 百万 token，输出 $8 / 百万 token · DeepSeek 的通用模型</li>`+
			`<li><a href="/pricing/z-ai%2Fglm-5.3">z-ai/glm-5.3</a> — 输入 $0.8 / 百万 token，输出 $2.8 / 百万 token</li>`)

	described := string(s.Render([]byte(shell), "/pricing/deepseek-v4.1-flash-x0.25"))
	assert.Contains(t, described, "<title>deepseek-v4.1-flash-x0.25 · DEMO</title>")
	assert.Contains(t, described, `<meta name="description" content="输入 $2 / 百万 token，输出 $8 / 百万 token · DeepSeek 的通用模型" />`)
	assert.Contains(t, described, `<link rel="canonical" href="https://ai.example.com/pricing/deepseek-v4.1-flash-x0.25">`)
	assert.Contains(t, root(t, described), "<h1>deepseek-v4.1-flash-x0.25</h1><p>DeepSeek 的通用模型</p><p>供应商：DeepSeek</p>"+
		"<p>输入 $2 / 百万 token，输出 $8 / 百万 token</p>")
	assert.NotContains(t, root(t, described), "同系列更便宜", "no cheaper model of its series to point at")

	// A name with a slash arrives escaped, or as written by hand.
	for _, path := range []string{"/pricing/z-ai%2Fglm-5.3", "/pricing/z-ai/glm-5.3"} {
		bare := string(s.Render([]byte(shell), path))
		assert.Contains(t, bare, "<title>z-ai/glm-5.3 · DEMO</title>", path)
		assert.Contains(t, bare, `content="输入 $0.8 / 百万 token，输出 $2.8 / 百万 token · z-ai/glm-5.3 在 DEMO 上的价格与调用方式。"`, path)
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
			assert.Contains(t, page, "<title>DEMO</title>")
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
	assert.Contains(t, string(english.Render([]byte(shell), "/rankings")), "<title>Public data · New API</title>",
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
		"https://ai.example.com/cheap",
		"https://ai.example.com/pricing/deepseek-v4.1-flash-x0.25",
		"https://ai.example.com/pricing/z-ai%2Fglm-5.3",
		"https://ai.example.com/rankings",
		"https://ai.example.com/about",
	} {
		assert.Contains(t, sitemap, "<loc>"+address+"</loc>")
	}
	assert.Equal(t, 7, strings.Count(sitemap, "<url>"))

	s.PricingPublic = false
	s.AboutContent = ""
	sitemap = string(s.Sitemap())
	assert.Equal(t, 2, strings.Count(sitemap, "<url>"), "only the pages a visitor can open")
	assert.NotContains(t, sitemap, "pricing")
	assert.NotContains(t, sitemap, "/cheap", "the cheap list is behind the same switch")

	s.BaseURL = ""
	assert.Nil(t, s.Sitemap(), "a sitemap needs absolute addresses")
	assert.NotContains(t, s.Robots(), "Sitemap")
}

func TestCheapPageListsTheCheapestFirst(t *testing.T) {
	s := site()
	s.Models = func() []Model {
		// Out of order on purpose: the page sorts, it does not trust the list.
		return []Model{
			{Name: "gpt-6-astra-x0.1", Series: "GPT-6", InputPrice: 6.7, OutputPrice: 33.5},
			{Name: "glm-5.3-flash-x0.5", Series: "GLM", InputPrice: 0.8, OutputPrice: 2.8},
			// Priced per image: it has no price per million tokens to rank.
			{Name: "gemini-3-pro-image", Series: "Gemini"},
			{Name: "deepseek-v4.1-flash-x0.1", Series: "DeepSeek", InputPrice: 1, OutputPrice: 4},
		}
	}
	page := string(s.Render([]byte(shell), "/cheap"))

	assert.Contains(t, page, "<title>便宜模型 · DEMO</title>")
	assert.Contains(t, page, `<link rel="canonical" href="https://ai.example.com/cheap">`)
	assert.Contains(t, page,
		`content="DEMO 上 3 个按 token 计价的模型按输入价格从低到高排列，最低的是 glm-5.3-flash-x0.5，输入 $0.8/百万 token。"`)
	assert.NotContains(t, page, "noindex")

	text := root(t, page)
	assert.Contains(t, text, "<h1>便宜模型</h1>")
	assert.Contains(t, text, "<p>另有 1 个模型不按 token 计价，未列入。</p>")
	assert.Contains(t, text,
		`<ul><li><a href="/pricing/glm-5.3-flash-x0.5">glm-5.3-flash-x0.5</a> — 输入 $0.8 / 百万 token，输出 $2.8 / 百万 token</li>`+
			`<li><a href="/pricing/deepseek-v4.1-flash-x0.1">deepseek-v4.1-flash-x0.1</a> — 输入 $1 / 百万 token，输出 $4 / 百万 token</li>`+
			`<li><a href="/pricing/gpt-6-astra-x0.1">gpt-6-astra-x0.1</a> — 输入 $6.7 / 百万 token，输出 $33.5 / 百万 token</li></ul>`,
		"the cheapest first, and a model with no token price left out")
}

func TestCheapPageSaysSoWhenNoPriceIsKnown(t *testing.T) {
	s := site()
	s.Models = func() []Model {
		return []Model{{Name: "gemini-3-pro-image", Series: "Gemini"}}
	}
	page := string(s.Render([]byte(shell), "/cheap"))

	assert.Contains(t, page, "<title>便宜模型 · DEMO</title>")
	assert.Contains(t, page, `<meta name="description" content="价格暂时无法读取，请直接查看模型广场。" />`)
	assert.Equal(t, "<div data-prerender><h1>便宜模型</h1><p>价格暂时无法读取，请直接查看模型广场。</p>"+
		`<nav><a href="/">首页</a> · <a href="/pricing">模型广场</a> · <a href="/cheap">便宜模型</a> · <a href="/rankings">公开数据</a> · <a href="/about">关于</a></nav></div>`,
		root(t, page))
}

func TestModelPagePointsAtTheCheaperOfItsSeries(t *testing.T) {
	s := site()
	s.Models = func() []Model {
		return []Model{
			{Name: "deepseek-v4.1-flash-x0.1", Series: "DeepSeek", InputPrice: 1, OutputPrice: 4},
			{Name: "deepseek-v4.1-flash-x0.25", Series: "DeepSeek", InputPrice: 2, OutputPrice: 8},
			{Name: "deepseek-v4.1-flash-fast-x0.35", Series: "DeepSeek", InputPrice: 1.5, OutputPrice: 6},
			{Name: "gpt-6-astra-x0.1", Series: "GPT-6", InputPrice: 6.7, OutputPrice: 33.5},
		}
	}
	text := root(t, string(s.Render([]byte(shell), "/pricing/deepseek-v4.1-flash-x0.25")))

	assert.Contains(t, text, "<p>输入 $2 / 百万 token，输出 $8 / 百万 token</p>")
	assert.Contains(t, text, `<p>同系列更便宜：<a href="/pricing/deepseek-v4.1-flash-x0.1">deepseek-v4.1-flash-x0.1</a>, `+
		`<a href="/pricing/deepseek-v4.1-flash-fast-x0.35">deepseek-v4.1-flash-fast-x0.35</a></p>`)

	cheapest := root(t, string(s.Render([]byte(shell), "/pricing/deepseek-v4.1-flash-x0.1")))
	assert.NotContains(t, cheapest, "同系列更便宜", "the cheapest of its series points nowhere")

	other := root(t, string(s.Render([]byte(shell), "/pricing/gpt-6-astra-x0.1")))
	assert.NotContains(t, other, "deepseek", "a series points only at itself")
}

func TestCheapPageBehindThePricingSwitch(t *testing.T) {
	closed := site()
	closed.PricingPublic = false

	for _, path := range []string{"/cheap", "/cheap/"} {
		page := string(closed.Render([]byte(shell), path))

		assert.Contains(t, page, `<meta name="robots" content="noindex">`, path)
		assert.NotContains(t, page, "canonical", path)
		assert.Empty(t, root(t, page), path)
	}
}

func TestLongDescriptionsAreCut(t *testing.T) {
	s := site()
	s.HomeContent = "<h1>标题</h1><p>" + strings.Repeat("很长的一段话。", 60) + "</p>"
	page := s.Page("/")

	assert.Len(t, []rune(page.Description), descriptionLength)
	assert.True(t, strings.HasSuffix(page.Description, "…"))
}

func TestModelsWithoutANameAreLeftOut(t *testing.T) {
	s := site()
	s.Models = func() []Model {
		return []Model{
			{Name: "", Description: "没有名字的模型", InputPrice: 26.8, OutputPrice: 134},
			{Name: "  ", Description: "只有空白", InputPrice: 14, OutputPrice: 70},
			{Name: "deepseek-v4.1-flash-x0.25", InputPrice: 2, OutputPrice: 8},
		}
	}

	list := string(s.Render([]byte(shell), "/pricing"))
	assert.NotContains(t, list, `href="/pricing/"`, "a nameless model links nowhere")
	assert.Contains(t, list, `href="/pricing/deepseek-v4.1-flash-x0.25"`)

	sitemap := string(s.Sitemap())
	assert.NotContains(t, sitemap, "https://ai.example.com/pricing/</loc>", "the list itself is not a model page")
	assert.Contains(t, sitemap, "https://ai.example.com/pricing/deepseek-v4.1-flash-x0.25</loc>")
}

func TestGuidePageIsOpenWhenTheModuleIs(t *testing.T) {
	open := site()
	open.GuidePublic = true

	page := open.Page("/guide")
	require.Equal(t, "/guide", page.Path)
	assert.Contains(t, page.Title, "快速开始")
	require.NotEmpty(t, page.Body)
	assert.Contains(t, page.Body, "<h1>快速开始</h1>")
	assert.Contains(t, page.Body, `<a href="/guide">快速开始</a>`, "the page links to itself like the others")

	rendered := string(open.Render([]byte(shell), "/guide/"))
	assert.Contains(t, rendered, `<link rel="canonical" href="https://ai.example.com/guide">`)
	assert.NotContains(t, rendered, "noindex")
	assert.Contains(t, root(t, rendered), "<h1>快速开始</h1>")
	assert.Contains(t, string(open.Sitemap()), "<loc>https://ai.example.com/guide</loc>")

	closed := site()
	closed.GuidePublic = false
	assert.Empty(t, closed.Page("/guide").Path, "a guide behind the module switch is left out of search results")
	assert.Contains(t, string(closed.Render([]byte(shell), "/guide")), `<meta name="robots" content="noindex">`)
	assert.NotContains(t, string(closed.Sitemap()), "/guide")
}

func TestPreviewImageStandsInForALogoWithNoAddress(t *testing.T) {
	s := site()
	s.Logo = "data:image/png;base64,iVBORw0KGgo="
	s.PreviewImage = "/logo.png"

	page := string(s.Render([]byte(shell), "/"))
	assert.Contains(t, page,
		`<meta property="og:image" content="https://ai.example.com/logo.png">`,
		"inline logo data has no address, so the site's preview image is shared instead")

	s.PreviewImage = "https://cdn.example.com/share.png"
	assert.Contains(t, string(s.Render([]byte(shell), "/")),
		`<meta property="og:image" content="https://cdn.example.com/share.png">`)

	s.PreviewImage = ""
	assert.NotContains(t, string(s.Render([]byte(shell), "/")), "og:image", "no picture to share")
}

func TestStructuredDataNamesTheSite(t *testing.T) {
	page := string(site().Render([]byte(shell), "/pricing"))

	assert.Contains(t, page, `<script type="application/ld+json">`)
	assert.Contains(t, page, `"@type":"WebSite"`)
	assert.Contains(t, page, `"@type":"Organization"`)
	assert.Contains(t, page, `"@id":"https://ai.example.com/#website"`)
	assert.Contains(t, page, `"@id":"https://ai.example.com/#organization"`)
	assert.Contains(t, page, `"name":"DEMO"`)
	assert.Contains(t, page, `"url":"https://ai.example.com"`)
	assert.Contains(t, page, `"inLanguage":"zh-CN"`)
	assert.Contains(t, page, `"logo":"https://ai.example.com/logo.png"`)

	inline := site()
	inline.Logo = "data:image/png;base64,iVBORw0KGgo="
	inline.PreviewImage = "/logo.png"
	assert.NotContains(t, string(inline.Render([]byte(shell), "/")), `"logo"`,
		"a preview card is not the organization's logo")

	unknown := site()
	unknown.BaseURL = ""
	page = string(unknown.Render([]byte(shell), "/"))
	assert.NotContains(t, page, "ld+json", "a site whose address is not known cannot name itself")

	console := string(site().Render([]byte(shell), "/dashboard"))
	assert.Contains(t, console, "noindex")
	assert.NotContains(t, console, "ld+json", "a page left out of search results says nothing about the site")
}

func TestBuildDateReadsTheVersion(t *testing.T) {
	tests := map[string]string{
		"20260102-abcdef1":       "2026-01-02",
		"20260102-abcdef1-dirty": "2026-01-02",
		"v0.0.0":                 "",
		"1ce31ae":                "",
		"2026110-x":              "",
		"20261103-":              "",
		"-1ce31ae":               "",
		"20261301-x":             "",
		"20260231-x":             "",
		"2026-11-03":             "",
		"":                       "",
	}
	for version, date := range tests {
		assert.Equal(t, date, BuildDate(version), "version %q", version)
	}
}

func TestSitemapDatedWhenTheBuildIs(t *testing.T) {
	s := site()
	assert.NotContains(t, string(s.Sitemap()), "<lastmod>", "a build without a date states none")

	s.LastModified = "2026-11-03"
	sitemap := string(s.Sitemap())
	assert.Contains(t, sitemap, "<loc>https://ai.example.com/</loc><lastmod>2026-11-03</lastmod>")
	assert.Equal(t, strings.Count(sitemap, "<url>"), strings.Count(sitemap, "<lastmod>"),
		"every address carries the same date")
}
