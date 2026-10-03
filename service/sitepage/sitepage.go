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
	"encoding/xml"
	"html"
	"net/url"
	"regexp"
	"strings"

	"github.com/QuantumNous/new-api/i18n"
)

// descriptionLength is about what a search result shows of a description.
const descriptionLength = 160

// Model is what a model's page says about it before the front end starts.
type Model struct {
	Name        string
	Description string
	Vendor      string
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

	HomeTitle       string
	HomeDescription string
	// HomeContent and AboutContent are the stored pages: HTML, Markdown, or
	// the address of a page to embed.
	HomeContent  string
	AboutContent string

	// PricingPublic, RankingsPublic and AboutPublic say whether a visitor who
	// is not signed in can open that page.
	PricingPublic  bool
	RankingsPublic bool
	AboutPublic    bool

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
	return s.AboutPublic && strings.TrimSpace(s.AboutContent) != ""
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

// ModelPath is the address of a model's page, with the name escaped the way
// the front end escapes it in its own links.
func ModelPath(name string) string {
	return "/pricing/" + strings.ReplaceAll(url.QueryEscape(name), "+", "%20")
}

// Page describes the page at a request path, in the escaped form it arrived in.
func (s Site) Page(escapedPath string) Page {
	path := strings.TrimRight(escapedPath, "/")
	switch {
	case path == "":
		return s.homePage()
	case path == "/pricing" && s.PricingPublic:
		return s.modelsPage()
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
		body.WriteString(`<li><a href="` + html.EscapeString(ModelPath(model.Name)) + `">` + html.EscapeString(model.Name) + "</a>")
		if model.Description != "" {
			body.WriteString(" — " + html.EscapeString(model.Description))
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

func (s Site) modelPage(model Model) Page {
	description := strings.TrimSpace(model.Description)
	if description == "" {
		description = s.text(i18n.MsgSitePageModelDescription, map[string]any{"Site": s.Name, "Model": model.Name})
	}
	body := "<h1>" + html.EscapeString(model.Name) + "</h1><p>" + html.EscapeString(description) + "</p>"
	if model.Vendor != "" {
		body += "<p>" + html.EscapeString(s.text(i18n.MsgSitePageModelVendor, map[string]any{"Vendor": model.Vendor})) + "</p>"
	}
	return Page{
		Title:       s.titled(model.Name),
		Description: clip(description, descriptionLength),
		Path:        ModelPath(model.Name),
		Body:        body + s.links(),
	}
}

// links closes a page's text with the way to the other public pages, so that
// a crawler reading only the markup can still find them.
func (s Site) links() string {
	type link struct{ path, label string }
	list := []link{{"/", s.text(i18n.MsgSitePageHome)}}
	if s.PricingPublic {
		list = append(list, link{"/pricing", s.text(i18n.MsgSitePageModels)})
	}
	if s.RankingsPublic {
		list = append(list, link{"/rankings", s.text(i18n.MsgSitePageRankings)})
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

// image is the logo as an absolute address, for link previews. Inline image
// data has no address to give.
func (s Site) image() string {
	switch {
	case strings.HasPrefix(s.Logo, "https://"), strings.HasPrefix(s.Logo, "http://"):
		return s.Logo
	case strings.HasPrefix(s.Logo, "/") && !strings.HasPrefix(s.Logo, "//") && s.BaseURL != "":
		return s.BaseURL + s.Logo
	}
	return ""
}

// paths lists the pages that search engines should know about.
func (s Site) paths() []string {
	paths := []string{"/"}
	if s.PricingPublic {
		paths = append(paths, "/pricing")
		for _, model := range s.models() {
			paths = append(paths, ModelPath(model.Name))
		}
	}
	if s.RankingsPublic {
		paths = append(paths, "/rankings")
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
		out.WriteString("</loc></url>\n")
	}
	out.WriteString("</urlset>\n")
	return out.Bytes()
}
