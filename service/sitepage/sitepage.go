// Package sitepage makes the public pages of the site readable before any
// script runs. Every page is the same HTML shell, which the front end fills in
// from the API. A crawler that does not run scripts gets an empty page from
// it, and one that runs them without the API, or in another language, gets the
// wrong page. The shell served for a public page therefore carries that page's
// own title, description and text, and the site answers /robots.txt and
// /sitemap.xml itself.
package sitepage

import (
	"bytes"
	"cmp"
	"encoding/xml"
	"html"
	"math"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
)

// descriptionLength is about what a search result shows of a description.
const descriptionLength = 160

// Model is what a model's page says about it before the front end starts.
type Model struct {
	Name        string
	Description string
	Vendor      string
	// Series groups a model with the rest of its family, so that a page can
	// point at the cheaper ones.
	Series string
	// InputPrice and OutputPrice are dollars per million tokens. Zero means
	// the price is not known, or the model is not priced by the token.
	InputPrice  float64
	OutputPrice float64
}

// Site is what the site shows the public at one moment.
type Site struct {
	// Name is the system name.
	Name string
	// BaseURL is the address the site is reached at, without a trailing slash.
	// Empty leaves absolute addresses, and with them the sitemap, out.
	BaseURL string
	// Language is the BCP 47 tag of the site's default language. Empty follows
	// the visitor's browser.
	Language string
	// Logo is the site's logo: an address, a path, or inline image data.
	Logo string
	// PreviewImage is what link previews show when the logo has no address to
	// give, as inline image data does: a path inside the site, or an address.
	PreviewImage string
	// LastModified is the date the site's content was last built, as
	// YYYY-MM-DD. Empty says the date is not known, and the sitemap leaves the
	// lastmod out rather than guess it.
	LastModified string

	HomeTitle       string
	HomeDescription string
	// HomeContent and AboutContent are the stored pages: HTML, Markdown, or
	// the address of a page to embed.
	HomeContent  string
	AboutContent string

	// PricingPublic and RankingsPublic say whether a visitor who is not signed
	// in can open that page. The about page is open whenever it has content:
	// its navigation switch only hides the link.
	PricingPublic  bool
	RankingsPublic bool
	// GuidePublic says whether a visitor who is not signed in can open the
	// quick-start guide.
	GuidePublic bool

	// Models lists the models a visitor who is not signed in can see. It is
	// called only for pages that name models.
	Models func() []Model
}

// Page is what the shell says for one address.
type Page struct {
	Title       string
	Description string
	// Path is the page's canonical path. Empty marks a page that search
	// engines should leave out: the console, sign-in, an unknown address.
	Path string
	// Body is the page's text as plain markup. It sits where the front end
	// renders and is replaced when it does.
	Body string
}

func (s Site) text(key string, args ...map[string]any) string {
	lang := s.Language
	if lang == "" {
		lang = i18n.DefaultLang
	}
	return i18n.Translate(lang, key, args...)
}

func (s Site) models() []Model {
	if s.Models == nil || !s.PricingPublic {
		return nil
	}
	return s.Models()
}

func (s Site) aboutShown() bool {
	return strings.TrimSpace(s.AboutContent) != ""
}

// titled puts the site's name after a page's own title.
func (s Site) titled(title string) string {
	switch {
	case title == "":
		return s.Name
	case s.Name == "":
		return title
	}
	return title + " · " + s.Name
}

// BuildDate is the day a released build was made, read from the version a
// build carries, as in 20260102-abcdef1. A sitemap can state that date and be
// honest about it; a development build (v0.0.0) has no date, and the sitemap
// then states none rather than a wrong one.
func BuildDate(version string) string {
	date, rest, found := strings.Cut(version, "-")
	if !found || rest == "" || len(date) != 8 {
		return ""
	}
	if _, err := time.Parse("20060102", date); err != nil {
		return ""
	}
	return date[:4] + "-" + date[4:6] + "-" + date[6:]
}

// ModelPath is the address of a model's page, with the name escaped the way
// the front end escapes it in its own links.
func ModelPath(name string) string {
	return "/pricing/" + strings.ReplaceAll(url.QueryEscape(name), "+", "%20")
}

// modelLink is a model's name as the way to its page.
func modelLink(name string) string {
	return `<a href="` + html.EscapeString(ModelPath(name)) + `">` + html.EscapeString(name) + "</a>"
}

// priceText writes a price per million tokens with the precision a page
// needs: no more than four decimals, and no trailing zeros.
func priceText(price float64) string {
	return strconv.FormatFloat(math.Round(price*10000)/10000, 'f', -1, 64)
}

// priceLine is a model's price as a sentence, for the pages that show one.
func (s Site) priceLine(model Model) string {
	return s.text(i18n.MsgSitePageModelPrice, map[string]any{
		"Input":  priceText(model.InputPrice),
		"Output": priceText(model.OutputPrice),
	})
}

// sortByPrice puts the cheapest model first, and orders models of the same
// price by name, so that the order never depends on the order they arrive in.
func sortByPrice(models []Model) {
	slices.SortFunc(models, func(a, b Model) int {
		if a.InputPrice != b.InputPrice {
			return cmp.Compare(a.InputPrice, b.InputPrice)
		}
		return strings.Compare(a.Name, b.Name)
	})
}

// modelsMark stands in for the models of a translated line that carries
// links: escaping leaves it alone, and the links replace it afterwards.
const modelsMark = "\x00models\x00"

// Page describes the page at a request path, in the escaped form it arrived in.
func (s Site) Page(escapedPath string) Page {
	path := strings.TrimRight(escapedPath, "/")
	switch {
	case path == "":
		return s.homePage()
	case path == "/pricing" && s.PricingPublic:
		return s.modelsPage()
	case path == "/cheap" && s.PricingPublic:
		return s.cheapPage()
	case strings.HasPrefix(path, "/pricing/") && s.PricingPublic:
		name, err := url.PathUnescape(strings.TrimPrefix(path, "/pricing/"))
		if err != nil {
			break
		}
		for _, model := range s.models() {
			if model.Name == name {
				return s.modelPage(model)
			}
		}
	case path == "/rankings" && s.RankingsPublic:
		return Page{
			Title:       s.titled(s.text(i18n.MsgSitePageRankings)),
			Description: s.text(i18n.MsgSitePageRankingsDescription, map[string]any{"Site": s.Name}),
			Path:        "/rankings",
			Body: "<h1>" + html.EscapeString(s.text(i18n.MsgSitePageRankings)) + "</h1><p>" +
				html.EscapeString(s.text(i18n.MsgSitePageRankingsDescription, map[string]any{"Site": s.Name})) + "</p>" + s.links(),
		}
	case path == "/guide" && s.GuidePublic:
		title := s.text(i18n.MsgSitePageGuide)
		description := s.text(i18n.MsgSitePageGuideDescription, map[string]any{"Site": s.Name})
		return Page{
			Title:       s.titled(title),
			Description: description,
			Path:        "/guide",
			Body: "<h1>" + html.EscapeString(title) + "</h1><p>" +
				html.EscapeString(description) + "</p>" + s.links(),
		}
	case path == "/about" && s.aboutShown():
		about := readContent(s.AboutContent)
		page := Page{
			Title:       s.titled(s.text(i18n.MsgSitePageAbout)),
			Description: about.summary,
			Path:        "/about",
		}
		if about.markup != "" {
			page.Body = about.markup + s.links()
		}
		return page
	}
	return Page{Title: s.Name}
}

func (s Site) homePage() Page {
	home := readContent(s.HomeContent)
	page := Page{
		Title:       s.HomeTitle,
		Description: s.HomeDescription,
		Path:        "/",
	}
	if page.Title == "" {
		page.Title = s.Name
		if home.heading != "" && s.Name != "" {
			page.Title = s.Name + " · " + home.heading
		} else if home.heading != "" {
			page.Title = home.heading
		}
	}
	if page.Description == "" {
		page.Description = home.summary
	}
	if home.markup != "" {
		page.Body = home.markup + s.links()
	}
	return page
}

func (s Site) modelsPage() Page {
	models := s.models()
	description := s.text(i18n.MsgSitePageModelsDescription, map[string]any{"Site": s.Name, "Count": len(models)})
	var body strings.Builder
	body.WriteString("<h1>" + html.EscapeString(s.text(i18n.MsgSitePageModels)) + "</h1><p>" + html.EscapeString(description) + "</p><ul>")
	for _, model := range models {
		// A model without a name has no page: its link would go to the list
		// itself, and the sitemap would carry that address twice.
		if strings.TrimSpace(model.Name) == "" {
			continue
		}
		body.WriteString(`<li><a href="` + html.EscapeString(ModelPath(model.Name)) + `">` + html.EscapeString(model.Name) + "</a>")
		if model.InputPrice > 0 {
			body.WriteString(" — " + html.EscapeString(s.priceLine(model)))
		}
		if model.Description != "" {
			body.WriteString(" · " + html.EscapeString(model.Description))
		}
		body.WriteString("</li>")
	}
	body.WriteString("</ul>" + s.links())
	return Page{
		Title:       s.titled(s.text(i18n.MsgSitePageModels)),
		Description: description,
		Path:        "/pricing",
		Body:        body.String(),
	}
}

// cheapPage lists the token-priced models from the cheapest, which is the page
// a search for a cheap model should land on.
func (s Site) cheapPage() Page {
	models := s.models()
	priced := make([]Model, 0, len(models))
	for _, model := range models {
		if model.InputPrice > 0 {
			priced = append(priced, model)
		}
	}
	sortByPrice(priced)

	title := s.text(i18n.MsgSitePageCheap)
	page := Page{Title: s.titled(title), Path: "/cheap"}
	if len(priced) == 0 {
		page.Description = s.text(i18n.MsgSitePageCheapEmpty)
		page.Body = "<h1>" + html.EscapeString(title) + "</h1><p>" + html.EscapeString(page.Description) + "</p>" + s.links()
		return page
	}

	cheapest := priced[0]
	description := s.text(i18n.MsgSitePageCheapDescription, map[string]any{
		"Site":  s.Name,
		"Count": len(priced),
		"Model": cheapest.Name,
		"Price": priceText(cheapest.InputPrice),
	})
	var body strings.Builder
	body.WriteString("<h1>" + html.EscapeString(title) + "</h1><p>" + html.EscapeString(description) + "</p>")
	if skipped := len(models) - len(priced); skipped > 0 {
		body.WriteString("<p>" + html.EscapeString(s.text(i18n.MsgSitePageCheapSkipped, map[string]any{"Count": skipped})) + "</p>")
	}
	body.WriteString("<ul>")
	for _, model := range priced {
		body.WriteString("<li>" + modelLink(model.Name) + " — " + html.EscapeString(s.priceLine(model)) + "</li>")
	}
	body.WriteString("</ul>" + s.links())
	page.Description = clip(description, descriptionLength)
	page.Body = body.String()
	return page
}

func (s Site) modelPage(model Model) Page {
	description := strings.TrimSpace(model.Description)
	if description == "" {
		description = s.text(i18n.MsgSitePageModelDescription, map[string]any{"Site": s.Name, "Model": model.Name})
	}
	// What a search result shows. A model's price is what the search is about,
	// so it goes first: a long description must not clip it away.
	summary := description
	price := ""
	if model.InputPrice > 0 {
		price = s.priceLine(model)
		summary = price + " · " + description
	}
	body := "<h1>" + html.EscapeString(model.Name) + "</h1><p>" + html.EscapeString(description) + "</p>"
	if model.Vendor != "" {
		body += "<p>" + html.EscapeString(s.text(i18n.MsgSitePageModelVendor, map[string]any{"Vendor": model.Vendor})) + "</p>"
	}
	if price != "" {
		body += "<p>" + html.EscapeString(price) + "</p>"
		if cheaper := s.cheaperLine(model); cheaper != "" {
			body += "<p>" + cheaper + "</p>"
		}
	}
	return Page{
		Title:       s.titled(model.Name),
		Description: clip(summary, descriptionLength),
		Path:        ModelPath(model.Name),
		Body:        body + s.links(),
	}
}

// cheaperLine points a model's page at the cheaper models of its series, so
// that a reader looking for a cheap model finds the way on from here.
func (s Site) cheaperLine(model Model) string {
	if model.Series == "" {
		return ""
	}
	var cheaper []Model
	for _, other := range s.models() {
		if other.Name != model.Name && other.Series == model.Series && other.InputPrice > 0 && other.InputPrice < model.InputPrice {
			cheaper = append(cheaper, other)
		}
	}
	if len(cheaper) == 0 {
		return ""
	}
	sortByPrice(cheaper)
	cheaper = cheaper[:min(len(cheaper), 3)]
	links := make([]string, 0, len(cheaper))
	for _, other := range cheaper {
		links = append(links, modelLink(other.Name))
	}
	// The line carries the links, so its own text is escaped and the links go
	// in where the models belong.
	line := s.text(i18n.MsgSitePageModelCheaper, map[string]any{"Models": modelsMark})
	return strings.Replace(html.EscapeString(line), modelsMark, strings.Join(links, ", "), 1)
}

// links closes a page's text with the way to the other public pages, so that
// a crawler reading only the markup can still find them.
func (s Site) links() string {
	type link struct{ path, label string }
	list := []link{{"/", s.text(i18n.MsgSitePageHome)}}
	if s.PricingPublic {
		list = append(list,
			link{"/pricing", s.text(i18n.MsgSitePageModels)},
			link{"/cheap", s.text(i18n.MsgSitePageCheap)})
	}
	if s.RankingsPublic {
		list = append(list, link{"/rankings", s.text(i18n.MsgSitePageRankings)})
	}
	if s.GuidePublic {
		list = append(list, link{"/guide", s.text(i18n.MsgSitePageGuide)})
	}
	if s.aboutShown() {
		list = append(list, link{"/about", s.text(i18n.MsgSitePageAbout)})
	}
	parts := make([]string, 0, len(list))
	for _, item := range list {
		parts = append(parts, `<a href="`+item.path+`">`+html.EscapeString(item.label)+"</a>")
	}
	return "<nav>" + strings.Join(parts, " · ") + "</nav>"
}

var (
	htmlTagPattern     = regexp.MustCompile(`<html lang="[^"]*"`)
	titlePattern       = regexp.MustCompile(`<title>[^<]*</title>`)
	metaTitlePattern   = regexp.MustCompile(`<meta\s+name="title"\s+content="[^"]*"\s*/?>`)
	descriptionPattern = regexp.MustCompile(`<meta\s+name="description"\s+content="[^"]*"\s*/?>`)
	rootPattern        = regexp.MustCompile(`<div id="root"[^>]*></div>`)
	headEnd            = []byte("</head>")
)

// prerenderStyle keeps a page's text out of sight for the moment the front
// end needs to start, then shows it: a visitor whose scripts load sees only
// the app, and one whose scripts are slow, blocked or off gets the text.
const prerenderStyle = `<style>` +
	`#root>[data-prerender]{max-width:46rem;margin:0 auto;padding:4rem 1.5rem;line-height:1.7;opacity:0;animation:prerender-show 0s linear 3s forwards}` +
	`#root>[data-prerender] h1{margin:0 0 1rem;font-size:1.75rem;font-weight:600;line-height:1.3}` +
	`#root>[data-prerender] :is(p,li,nav,pre){margin:.5rem 0}` +
	`#root>[data-prerender] a{text-decoration:underline}` +
	`@keyframes prerender-show{to{opacity:1}}` +
	`</style><noscript><style>#root>[data-prerender]{opacity:1;animation:none}</style></noscript>`

// replaceFirst swaps the first match of pattern for a literal replacement.
func replaceFirst(page []byte, pattern *regexp.Regexp, replacement string) []byte {
	at := pattern.FindIndex(page)
	if at == nil {
		return page
	}
	out := make([]byte, 0, len(page)+len(replacement))
	out = append(out, page[:at[0]]...)
	out = append(out, replacement...)
	return append(out, page[at[1]:]...)
}

// Render returns the shell as it is served at a request path. A part of the
// shell it does not recognise is left as it is.
func (s Site) Render(shell []byte, escapedPath string) []byte {
	page := s.Page(escapedPath)
	out := shell

	if s.Language != "" {
		lang := html.EscapeString(s.Language)
		out = replaceFirst(out, htmlTagPattern, `<html lang="`+lang+`" data-default-lang="`+lang+`"`)
	}
	if page.Title != "" {
		title := html.EscapeString(page.Title)
		out = replaceFirst(out, titlePattern, "<title>"+title+"</title>")
		out = replaceFirst(out, metaTitlePattern, `<meta name="title" content="`+title+`" />`)
	}
	if page.Description != "" {
		out = replaceFirst(out, descriptionPattern,
			`<meta name="description" content="`+html.EscapeString(page.Description)+`" />`)
	}

	var head strings.Builder
	if page.Path == "" {
		head.WriteString(`<meta name="robots" content="noindex">`)
	} else {
		address := s.BaseURL + page.Path
		if s.BaseURL != "" {
			head.WriteString(`<link rel="canonical" href="` + html.EscapeString(address) + `">`)
			head.WriteString(`<meta property="og:url" content="` + html.EscapeString(address) + `">`)
		}
		head.WriteString(`<meta property="og:type" content="website">`)
		if s.Name != "" {
			head.WriteString(`<meta property="og:site_name" content="` + html.EscapeString(s.Name) + `">`)
		}
		if page.Title != "" {
			head.WriteString(`<meta property="og:title" content="` + html.EscapeString(page.Title) + `">`)
		}
		if page.Description != "" {
			head.WriteString(`<meta property="og:description" content="` + html.EscapeString(page.Description) + `">`)
		}
		if image := s.image(); image != "" {
			head.WriteString(`<meta property="og:image" content="` + html.EscapeString(image) + `">`)
		}
		head.WriteString(s.structuredData())
	}
	if page.Body != "" && rootPattern.Match(out) {
		head.WriteString(prerenderStyle)
	}
	out = bytes.Replace(out, headEnd, append([]byte(head.String()), headEnd...), 1)

	if page.Body != "" {
		if at := rootPattern.FindIndex(out); at != nil {
			end := at[1] - len("</div>")
			filled := make([]byte, 0, len(out)+len(page.Body)+40)
			filled = append(filled, out[:end]...)
			filled = append(filled, "<div data-prerender>"+page.Body+"</div>"...)
			out = append(filled, out[end:]...)
		}
	}
	return out
}

// logoAddress is the logo as an absolute address. Inline image data has none
// to give, and structured data must not name a logo that is really a preview
// card.
func (s Site) logoAddress() string {
	switch {
	case strings.HasPrefix(s.Logo, "https://"), strings.HasPrefix(s.Logo, "http://"):
		return s.Logo
	case strings.HasPrefix(s.Logo, "/") && !strings.HasPrefix(s.Logo, "//") && s.BaseURL != "":
		return s.BaseURL + s.Logo
	}
	return ""
}

// image is what a link preview shows: the logo, or the site's own preview image
// when the logo has no address to give, because a preview with no picture shows
// none at all.
func (s Site) image() string {
	if logo := s.logoAddress(); logo != "" {
		return logo
	}
	switch {
	case strings.HasPrefix(s.PreviewImage, "https://"), strings.HasPrefix(s.PreviewImage, "http://"):
		return s.PreviewImage
	case strings.HasPrefix(s.PreviewImage, "/") && !strings.HasPrefix(s.PreviewImage, "//") && s.BaseURL != "":
		return s.BaseURL + s.PreviewImage
	}
	return ""
}

// structuredData is the site's structured data as the script for the head: a
// search engine reads the site's name, address and language from it instead of
// guessing them from the text. Every public page carries it; a site whose
// address is not known has none to give.
func (s Site) structuredData() string {
	if s.BaseURL == "" {
		return ""
	}
	// Fields left empty are left out: an empty name or language says less than
	// none at all, and schema.org treats a missing value as unknown.
	website := map[string]any{
		"@type":     "WebSite",
		"@id":       s.BaseURL + "/#website",
		"url":       s.BaseURL,
		"publisher": map[string]any{"@id": s.BaseURL + "/#organization"},
	}
	organization := map[string]any{
		"@type": "Organization",
		"@id":   s.BaseURL + "/#organization",
		"url":   s.BaseURL,
	}
	if s.Name != "" {
		website["name"] = s.Name
		organization["name"] = s.Name
	}
	if s.Language != "" {
		website["inLanguage"] = s.Language
	}
	if logo := s.logoAddress(); logo != "" {
		organization["logo"] = logo
	}
	// The members of a graph are not ordered, so one built from maps gives the
	// same bytes for the same site.
	graph := []any{website, organization}
	data, err := common.Marshal(map[string]any{
		"@context": "https://schema.org",
		"@graph":   graph,
	})
	if err != nil {
		return ""
	}
	// Marshalling through common escapes < and >, so nothing in the data can
	// close the script element early.
	return `<script type="application/ld+json">` + string(data) + "</script>"
}

// paths lists the pages that search engines should know about.
func (s Site) paths() []string {
	paths := []string{"/"}
	if s.PricingPublic {
		paths = append(paths, "/pricing", "/cheap")
		for _, model := range s.models() {
			if strings.TrimSpace(model.Name) == "" {
				continue
			}
			paths = append(paths, ModelPath(model.Name))
		}
	}
	if s.RankingsPublic {
		paths = append(paths, "/rankings")
	}
	if s.GuidePublic {
		paths = append(paths, "/guide")
	}
	if s.aboutShown() {
		paths = append(paths, "/about")
	}
	return paths
}

// Robots is the site's robots.txt.
func (s Site) Robots() string {
	var out strings.Builder
	out.WriteString("# The pages fill themselves in from /api/, so it has to stay readable:\n")
	out.WriteString("# a crawler kept away from it renders the wrong page. Pages that are\n")
	out.WriteString("# not for search engines say so themselves (noindex).\n")
	out.WriteString("User-agent: *\nAllow: /\n")
	if s.BaseURL != "" {
		out.WriteString("\nSitemap: " + s.BaseURL + "/sitemap.xml\n")
	}
	return out.String()
}

// Sitemap is the site's sitemap.xml, or nil when the site's address is not
// known: a sitemap has to give absolute addresses.
func (s Site) Sitemap() []byte {
	if s.BaseURL == "" {
		return nil
	}
	var out bytes.Buffer
	out.WriteString(xml.Header)
	out.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	for _, path := range s.paths() {
		out.WriteString("  <url><loc>")
		_ = xml.EscapeText(&out, []byte(s.BaseURL+path))
		out.WriteString("</loc>")
		if s.LastModified != "" {
			out.WriteString("<lastmod>")
			_ = xml.EscapeText(&out, []byte(s.LastModified))
			out.WriteString("</lastmod>")
		}
		out.WriteString("</url>\n")
	}
	out.WriteString("</urlset>\n")
	return out.Bytes()
}
