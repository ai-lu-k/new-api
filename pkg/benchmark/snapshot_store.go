package benchmark

import (
	"errors"
	"fmt"
)

// The published snapshots are stored as option rows.
const (
	TextSnapshotOptionKey  = "BenchmarkTextSnapshot"
	ImageSnapshotOptionKey = "BenchmarkImageSnapshot"
)

var ErrInvalidSnapshots = errors.New("invalid benchmark snapshots")

const emptySnapshotJSON = `{"dimensions":[],"models":[]}`

// DefaultTextSnapshotJSON is used only to initialize a database without snapshots.
func DefaultTextSnapshotJSON() string { return emptySnapshotJSON }

// DefaultImageSnapshotJSON is used only to initialize a database without snapshots.
func DefaultImageSnapshotJSON() string { return emptySnapshotJSON }

// parsedSnapshots is a validated text/image payload pair ready to publish.
type parsedSnapshots struct {
	text             Snapshot
	textDimensions   []Dimension
	textModels       []Model
	imageDimensions  []Dimension
	imageModels      []Model
	imageAttribution Attribution
}

func parseSnapshots(textJSON, imageJSON string) (parsedSnapshots, error) {
	text, textDimensions, textModels, err := parseTextSnapshot([]byte(textJSON))
	if err != nil {
		return parsedSnapshots{}, err
	}
	image, err := parseImageSnapshot([]byte(imageJSON))
	if err != nil {
		return parsedSnapshots{}, err
	}
	return parsedSnapshots{
		text:             text,
		textDimensions:   textDimensions,
		textModels:       textModels,
		imageDimensions:  image.Dimensions,
		imageModels:      image.Models,
		imageAttribution: image.Attribution,
	}, nil
}

// ValidateSnapshots rejects an invalid payload pair without publishing it, so a
// value is checked before it is stored and rejected again only if the row was
// written outside this path.
func ValidateSnapshots(textJSON, imageJSON string) error {
	if _, err := parseSnapshots(textJSON, imageJSON); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidSnapshots, err)
	}
	return nil
}

// SetSnapshots publishes a validated payload pair immediately, so a save is
// visible without a restart. It is atomic: a rejected payload leaves both
// modalities as they were, and the current mappings stay applied.
func (c *Cache) SetSnapshots(textJSON, imageJSON string) error {
	parsed, err := parseSnapshots(textJSON, imageJSON)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidSnapshots, err)
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.applySnapshots(parsed)
	return nil
}

// applySnapshots replaces the cached ratings and republishes them. Callers hold c.mu.
func (c *Cache) applySnapshots(parsed parsedSnapshots) {
	if c.mappings == nil {
		c.mappings, _ = ParseMappings(DefaultMappingsJSON())
	}
	c.scores = snapshotScores(parsed.textModels)
	c.textDimensions, c.textModels = parsed.textDimensions, parsed.textModels
	c.imageDimensions, c.imageModels = parsed.imageDimensions, parsed.imageModels
	parsed.text.Stale = false
	parsed.text.ImageAttribution = nil
	if len(parsed.imageModels) > 0 && parsed.imageAttribution != (Attribution{}) {
		parsed.text.ImageAttribution = &parsed.imageAttribution
	}
	parsed.text.Dimensions = c.publishedDimensions()
	parsed.text.Models = c.publishedModels(applyScores(c.mappings, c.scores))
	c.data = parsed.text
	c.published = true
}
