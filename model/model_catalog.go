package model

import (
	"regexp"
	"slices"
	"strings"
)

// Catalogue facts about a model: what it accepts, how much context it holds,
// which request features it supports, when it came out and which family it
// belongs to. An administrator enters them when the model is created; the
// model list filters on them and the model page shows them. They are not
// inherited: two names for the same upstream model at different prices are
// served by different channels and may differ, so each name has its own.

// ModelInputModalities are the kinds of input a model can be said to accept,
// in the order they are stored and shown.
var ModelInputModalities = []string{"text", "image", "file", "audio", "video"}

// ModelSupportedParameters are the request features a model can be said to
// support. The list is short on purpose: only what differs between models.
var ModelSupportedParameters = []string{"tools", "reasoning", "structured_outputs", "response_format"}

const (
	maxModelContextLength = 100_000_000
	maxModelSeriesLength  = 64
)

// releaseDatePattern is a year and month, such as "2026-09".
var releaseDatePattern = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

// CatalogError names the catalogue field that is missing or not understood.
type CatalogError struct {
	Field string
}

func (e *CatalogError) Error() string {
	return "model catalogue: " + e.Field + " is missing or invalid"
}

// SplitCatalogList reads a stored list ("text,image") into its items.
func SplitCatalogList(stored string) []string {
	items := make([]string, 0, 4)
	for _, item := range strings.Split(stored, ",") {
		if item = strings.TrimSpace(item); item != "" {
			items = append(items, item)
		}
	}
	return items
}

// canonicalCatalogList keeps the allowed items of a list, each once, in the
// order of allowed. It fails on an item that is not allowed.
func canonicalCatalogList(stored string, allowed []string) (string, bool) {
	chosen := map[string]bool{}
	for _, item := range SplitCatalogList(stored) {
		item = strings.ToLower(item)
		if !slices.Contains(allowed, item) {
			return "", false
		}
		chosen[item] = true
	}
	kept := make([]string, 0, len(chosen))
	for _, item := range allowed {
		if chosen[item] {
			kept = append(kept, item)
		}
	}
	return strings.Join(kept, ","), true
}

// NormalizeCatalog tidies the catalogue fields in place and reports the
// first one that is missing or invalid. Every field is required except the
// supported parameters, where an empty list says the model supports none of
// them.
func (mi *Model) NormalizeCatalog() error {
	modalities, ok := canonicalCatalogList(mi.InputModalities, ModelInputModalities)
	if !ok || modalities == "" {
		return &CatalogError{Field: "input_modalities"}
	}
	mi.InputModalities = modalities

	if mi.ContextLength <= 0 || mi.ContextLength > maxModelContextLength {
		return &CatalogError{Field: "context_length"}
	}

	parameters, ok := canonicalCatalogList(mi.SupportedParameters, ModelSupportedParameters)
	if !ok {
		return &CatalogError{Field: "supported_parameters"}
	}
	mi.SupportedParameters = parameters

	mi.ReleaseDate = strings.TrimSpace(mi.ReleaseDate)
	if !releaseDatePattern.MatchString(mi.ReleaseDate) {
		return &CatalogError{Field: "release_date"}
	}

	mi.Series = strings.TrimSpace(mi.Series)
	if mi.Series == "" || len([]rune(mi.Series)) > maxModelSeriesLength {
		return &CatalogError{Field: "series"}
	}
	return nil
}
