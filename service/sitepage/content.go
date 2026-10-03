package sitepage

import (
	"html"
	"net/url"
	"regexp"
	"strings"
	"unicode"

	nethtml "golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// content is a stored page reduced to what the shell can carry.
type content struct {
	// markup is the page's text as plain elements: headings, paragraphs,
	// lists, code and links.
	markup string
	// heading is the text of the first top-level heading.
	heading string
	// summary is the start of the page's paragraphs.
	summary string
}

var (
	// markupPattern tells HTML from Markdown the way the front end does.
	markupPattern = regexp.MustCompile(`(?i)<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]|<style[\s>]|<script[\s>]|</?[a-z][\s\S]*>`)
	spacePattern  = regexp.MustCompile(`\s+`)
	blankLines    = regexp.MustCompile(`\n\s*\n`)
)

// kept elements pass with their attributes dropped.
var kept = map[atom.Atom]bool{
	atom.H1: true, atom.H2: true, atom.H3: true, atom.H4: true, atom.H5: true, atom.H6: true,
	atom.P: true, atom.Ul: true, atom.Ol: true, atom.Li: true, atom.Dl: true, atom.Dt: true, atom.Dd: true,
	atom.Pre: true, atom.Code: true, atom.Blockquote: true,
	atom.Strong: true, atom.Em: true, atom.B: true, atom.I: true,
	atom.Table: true, atom.Thead: true, atom.Tbody: true, atom.Tr: true, atom.Th: true, atom.Td: true,
}

// boxes are elements that only group others. Each becomes a plain block, so
// that the text of two of them does not run together.
var boxes = map[atom.Atom]bool{
	atom.Div: true, atom.Section: true, atom.Article: true, atom.Header: true,
	atom.Footer: true, atom.Main: true, atom.Aside: true, atom.Nav: true, atom.Figure: true,
}

// dropped elements go with everything inside them: what runs, what restyles
// the page, and what has no text to give.
var dropped = map[atom.Atom]bool{
	atom.Script: true, atom.Style: true, atom.Template: true, atom.Noscript: true,
	atom.Iframe: true, atom.Frame: true, atom.Object: true, atom.Embed: true,
	atom.Svg: true, atom.Math: true, atom.Canvas: true, atom.Video: true, atom.Audio: true,
	atom.Img: true, atom.Picture: true, atom.Form: true, atom.Input: true, atom.Select: true,
	atom.Textarea: true, atom.Head: true, atom.Title: true, atom.Link: true, atom.Meta: true,
	atom.Base: true,
}

// readContent reduces a stored page. Stored pages are written for the front
// end, which sanitizes them and shows them inside a shadow root. Here the
// text lands in the page itself, so only plain elements pass and no attribute
// but a link's address does.
func readContent(stored string) content {
	stored = strings.TrimSpace(stored)
	if stored == "" || isAddress(stored) {
		return content{}
	}
	if !markupPattern.MatchString(stored) {
		stored = markdownOutline(stored)
	}
	nodes, err := nethtml.ParseFragment(strings.NewReader(stored), &nethtml.Node{
		Type:     nethtml.ElementNode,
		Data:     "div",
		DataAtom: atom.Div,
	})
	if err != nil {
		return content{}
	}

	reader := contentReader{}
	for _, node := range nodes {
		reader.write(node, false)
	}
	return content{
		markup:  strings.TrimSpace(reader.markup.String()),
		heading: reader.heading,
		summary: clip(strings.Join(reader.paragraphs, " "), descriptionLength),
	}
}

// isAddress reports whether a stored page is the address of a page to embed.
func isAddress(stored string) bool {
	if strings.ContainsFunc(stored, unicode.IsSpace) {
		return false
	}
	address, err := url.Parse(stored)
	return err == nil && (address.Scheme == "http" || address.Scheme == "https") && address.Host != ""
}

// markdownOutline turns Markdown into headings and paragraphs. It reads the
// block structure only; inline marks stay as written.
func markdownOutline(text string) string {
	var out strings.Builder
	for _, block := range blankLines.Split(strings.ReplaceAll(text, "\r\n", "\n"), -1) {
		block = strings.TrimSpace(block)
		if block == "" {
			continue
		}
		level := len(block) - len(strings.TrimLeft(block, "#"))
		if level >= 1 && level <= 6 && strings.HasPrefix(block[level:], " ") {
			line, rest, _ := strings.Cut(block[level:], "\n")
			tag := "h" + string(rune('0'+level))
			out.WriteString("<" + tag + ">" + html.EscapeString(strings.TrimSpace(line)) + "</" + tag + ">")
			block = strings.TrimSpace(rest)
			if block == "" {
				continue
			}
		}
		out.WriteString("<p>" + html.EscapeString(block) + "</p>")
	}
	return out.String()
}

type contentReader struct {
	markup     strings.Builder
	heading    string
	paragraphs []string
}

func (r *contentReader) write(node *nethtml.Node, preformatted bool) {
	switch node.Type {
	case nethtml.TextNode:
		text := node.Data
		if !preformatted {
			text = spacePattern.ReplaceAllString(text, " ")
		}
		r.markup.WriteString(html.EscapeString(text))
		return
	case nethtml.ElementNode:
	default:
		return
	}
	if dropped[node.DataAtom] {
		return
	}

	switch {
	case node.DataAtom == atom.H1 && r.heading == "":
		r.heading = plainText(node)
	case node.DataAtom == atom.P:
		if text := plainText(node); text != "" {
			r.paragraphs = append(r.paragraphs, text)
		}
	}

	open, end := "", ""
	switch {
	case node.DataAtom == atom.Br:
		r.markup.WriteString("<br>")
		return
	case node.DataAtom == atom.A:
		if href, ok := linkAddress(node); ok {
			open, end = `<a href="`+html.EscapeString(href)+`">`, "</a>"
		}
	case kept[node.DataAtom]:
		open, end = "<"+node.Data+">", "</"+node.Data+">"
	case boxes[node.DataAtom]:
		open, end = "<div>", "</div>"
	}

	r.markup.WriteString(open)
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		r.write(child, preformatted || node.DataAtom == atom.Pre)
	}
	r.markup.WriteString(end)
}

// linkAddress returns where a link leads, when that is a page: a path on this
// site or a web or mail address.
func linkAddress(node *nethtml.Node) (string, bool) {
	for _, attribute := range node.Attr {
		if attribute.Key != "href" {
			continue
		}
		href := strings.TrimSpace(attribute.Val)
		if strings.HasPrefix(href, "#") || (strings.HasPrefix(href, "/") && !strings.HasPrefix(href, "//")) {
			return href, true
		}
		address, err := url.Parse(href)
		if err != nil {
			return "", false
		}
		switch address.Scheme {
		case "http", "https", "mailto":
			return href, true
		}
		return "", false
	}
	return "", false
}

// plainText is the text inside a node, on one line.
func plainText(node *nethtml.Node) string {
	var out strings.Builder
	var read func(*nethtml.Node)
	read = func(n *nethtml.Node) {
		switch n.Type {
		case nethtml.TextNode:
			out.WriteString(n.Data)
		case nethtml.ElementNode:
			if dropped[n.DataAtom] {
				return
			}
			if n.DataAtom == atom.Br {
				out.WriteString(" ")
			}
			for child := n.FirstChild; child != nil; child = child.NextSibling {
				read(child)
			}
		}
	}
	read(node)
	return strings.TrimSpace(spacePattern.ReplaceAllString(out.String(), " "))
}

// clip shortens text to at most limit characters, marking the cut.
func clip(text string, limit int) string {
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	return strings.TrimSpace(string(runes[:limit-1])) + "…"
}
