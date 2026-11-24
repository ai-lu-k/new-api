// Package benchmark publishes administrator-supplied model evaluations.
package benchmark

import (
	"context"
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

// A dimension or model is scored in one modality; the two never mix.
const (
	modalityText  = "text"
	modalityImage = "image"
)

// Image ratings are Elo from human preference comparisons, not a 0–100 suite
// average, so they keep their own scale and anchor.
const (
	imageRatingMin = 0
	imageRatingMax = 2000
)

type Score struct {
	Rating float64 `json:"rating"`
	Date   string  `json:"date"`
}

type Tier struct {
	ID         string           `json:"id"`
	SourceName string           `json:"source_name"`
	Scores     map[string]Score `json:"scores"`
}

type Model struct {
	ID          string   `json:"id"`
	Modality    string   `json:"modality,omitempty"`
	Aliases     []string `json:"aliases"`
	HighestTier string   `json:"highest_tier"`
	Tiers       []Tier   `json:"tiers"`
}

type Dimension struct {
	ID       string `json:"id"`
	LabelKey string `json:"label_key"`
	Modality string `json:"modality"`
	Group    string `json:"group"`
	Date     string `json:"date"`
}

// Text ratings keep the publisher's native scale per dimension: percent pass
// rates on 0–100, Elo on 0–2000 and the signed AA index on -100–100.
func textRatingBounds(dimension string) (ratingMin, ratingMax float64) {
	switch dimension {
	case "briefcase_elo":
		return 0, 2000
	case "omniscience":
		return -100, 100
	default:
		return 0, 100
	}
}

// parseTextSnapshot validates a text snapshot.
// Text dimension ids are not namespaced, so they must not collide with the
// image ones; image dimensions stay behind the image: prefix instead.
func parseTextSnapshot(data []byte) (Snapshot, []Dimension, []Model, error) {
	var file Snapshot
	if err := common.Unmarshal(data, &file); err != nil {
		return Snapshot{}, nil, nil, err
	}
	file.Stale = false
	if file.Dimensions != nil && file.Models != nil && len(file.Dimensions) == 0 && len(file.Models) == 0 {
		return Snapshot{}, file.Dimensions, file.Models, nil
	}
	if file.SourceURL == "" || file.LicenseURL == "" || file.Version == "" || file.UpdatedAt == "" {
		return Snapshot{}, nil, nil, errors.New("text benchmark requires complete source attribution metadata")
	}
	if len(file.Dimensions) == 0 || len(file.Dimensions) > 64 {
		return Snapshot{}, nil, nil, errors.New("text benchmark requires 1 to 64 dimensions")
	}
	dimensions := make(map[string]bool, len(file.Dimensions))
	for i := range file.Dimensions {
		dimension := &file.Dimensions[i]
		// The transcription omits the marker the payload must carry; an
		// explicit other modality is still rejected.
		if dimension.Modality != "" && dimension.Modality != modalityText {
			return Snapshot{}, nil, nil, fmt.Errorf("invalid text benchmark dimension: %s", dimension.ID)
		}
		dimension.Modality = modalityText
		if strings.HasPrefix(dimension.ID, "image:") || dimensions[dimension.ID] || !validName(dimension.LabelKey) {
			return Snapshot{}, nil, nil, fmt.Errorf("invalid text benchmark dimension: %s", dimension.ID)
		}
		dimensions[dimension.ID] = true
	}
	if len(file.Models) == 0 || len(file.Models) > 500 {
		return Snapshot{}, nil, nil, errors.New("text benchmark requires 1 to 500 models")
	}
	ids, aliases := make(map[string]bool, len(file.Models)), make(map[string]bool)
	for i := range file.Models {
		model := &file.Models[i]
		if !validName(model.ID) || ids[model.ID] {
			return Snapshot{}, nil, nil, fmt.Errorf("invalid or duplicate text benchmark model: %s", model.ID)
		}
		ids[model.ID] = true
		if model.Modality != "" && model.Modality != modalityText {
			return Snapshot{}, nil, nil, fmt.Errorf("invalid text benchmark model modality: %s", model.ID)
		}
		model.Modality = modalityText
		if len(model.Aliases) == 0 || len(model.Aliases) > 100 || len(model.Tiers) != 1 || model.Tiers[0].ID != "default" || model.HighestTier != "default" || !validName(model.Tiers[0].SourceName) {
			return Snapshot{}, nil, nil, fmt.Errorf("invalid text benchmark tiers: %s", model.ID)
		}
		for _, alias := range model.Aliases {
			if !validName(alias) || aliases[alias] {
				return Snapshot{}, nil, nil, fmt.Errorf("invalid or duplicate text benchmark alias: %s", alias)
			}
			aliases[alias] = true
		}
		scores := model.Tiers[0].Scores
		if len(scores) == 0 {
			return Snapshot{}, nil, nil, fmt.Errorf("text benchmark model has no scores: %s", model.ID)
		}
		for dimension, score := range scores {
			// Partial coverage is expected: a model may carry any subset of
			// the dimensions, but every published rating must be valid.
			minRating, maxRating := textRatingBounds(dimension)
			if !dimensions[dimension] || score.Date == "" || math.IsNaN(score.Rating) || math.IsInf(score.Rating, 0) || score.Rating < minRating || score.Rating > maxRating {
				return Snapshot{}, nil, nil, fmt.Errorf("invalid text benchmark score for %s", model.ID)
			}
		}
	}
	return file, file.Dimensions, file.Models, nil
}

// Attribution describes the source of one modality's scores.
type Attribution struct {
	SourceURL  string `json:"source_url"`
	LicenseURL string `json:"license_url"`
	Version    string `json:"version"`
}

type imageSnapshotFile struct {
	Attribution
	Dimensions []Dimension `json:"dimensions"`
	Models     []Model     `json:"models"`
}

// parseImageSnapshot validates the image leaderboard. Its ratings are
// Elo, so they are bounded by the Elo scale rather than the text scales, and
// every dimension must be namespaced so it cannot collide with a text one.
func parseImageSnapshot(data []byte) (imageSnapshotFile, error) {
	var file imageSnapshotFile
	if err := common.Unmarshal(data, &file); err != nil {
		return imageSnapshotFile{}, err
	}
	if file.Dimensions != nil && file.Models != nil && len(file.Dimensions) == 0 && len(file.Models) == 0 {
		return file, nil
	}
	if len(file.Dimensions) == 0 || len(file.Dimensions) > 64 {
		return imageSnapshotFile{}, errors.New("image benchmark requires 1 to 64 dimensions")
	}
	dimensions := make(map[string]bool, len(file.Dimensions))
	for i := range file.Dimensions {
		dimension := &file.Dimensions[i]
		// The transcription omits the marker the payload must carry; an
		// explicit other modality is still rejected.
		if dimension.Modality != "" && dimension.Modality != modalityImage {
			return imageSnapshotFile{}, fmt.Errorf("invalid image benchmark dimension: %s", dimension.ID)
		}
		dimension.Modality = modalityImage
		if !strings.HasPrefix(dimension.ID, "image:") || dimensions[dimension.ID] || !validName(dimension.LabelKey) {
			return imageSnapshotFile{}, fmt.Errorf("invalid image benchmark dimension: %s", dimension.ID)
		}
		dimensions[dimension.ID] = true
	}
	if len(file.Models) == 0 || len(file.Models) > 500 {
		return imageSnapshotFile{}, errors.New("image benchmark requires 1 to 500 models")
	}
	ids, aliases := make(map[string]bool, len(file.Models)), make(map[string]bool)
	for i := range file.Models {
		model := &file.Models[i]
		if !validName(model.ID) || ids[model.ID] {
			return imageSnapshotFile{}, fmt.Errorf("invalid or duplicate image benchmark model: %s", model.ID)
		}
		ids[model.ID] = true
		if model.Modality != "" && model.Modality != modalityImage {
			return imageSnapshotFile{}, fmt.Errorf("invalid image benchmark model modality: %s", model.ID)
		}
		model.Modality = modalityImage
		if len(model.Aliases) == 0 || len(model.Aliases) > 100 || len(model.Tiers) != 1 || model.Tiers[0].ID != "default" || model.HighestTier != "default" || !validName(model.Tiers[0].SourceName) {
			return imageSnapshotFile{}, fmt.Errorf("invalid image benchmark tiers: %s", model.ID)
		}
		for _, alias := range model.Aliases {
			if !validName(alias) || aliases[alias] {
				return imageSnapshotFile{}, fmt.Errorf("invalid or duplicate image benchmark alias: %s", alias)
			}
			aliases[alias] = true
		}
		scores := model.Tiers[0].Scores
		if len(scores) == 0 {
			return imageSnapshotFile{}, fmt.Errorf("image benchmark model has no scores: %s", model.ID)
		}
		for dimension, score := range scores {
			if !dimensions[dimension] || score.Date == "" || math.IsNaN(score.Rating) || math.IsInf(score.Rating, 0) || score.Rating < imageRatingMin || score.Rating > imageRatingMax {
				return imageSnapshotFile{}, fmt.Errorf("invalid image benchmark score for %s", model.ID)
			}
		}
	}
	return file, nil
}

type Snapshot struct {
	SourceURL        string       `json:"source_url"`
	LicenseURL       string       `json:"license_url"`
	Version          string       `json:"version"`
	UpdatedAt        string       `json:"updated_at"`
	SourceRevision   string       `json:"source_revision"`
	Stale            bool         `json:"stale"`
	Dimensions       []Dimension  `json:"dimensions"`
	Models           []Model      `json:"models"`
	ImageAttribution *Attribution `json:"image_attribution,omitempty"`
}

type Cache struct {
	mu              sync.RWMutex
	data            Snapshot
	mappings        []Model
	scores          map[string]map[string]Score
	textDimensions  []Dimension
	textModels      []Model
	imageDimensions []Dimension
	imageModels     []Model
	// published records that a payload pair is already live, so a later Start
	// keeps the snapshot supplied by the database.
	published bool
}

var Default = NewCache()

func NewCache() *Cache {
	return &Cache{}
}

func (c *Cache) Get() Snapshot {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.data // Published snapshots are immutable and never stale.
}

// Start initializes an empty benchmark cache if no stored data has been loaded.
func (c *Cache) Start(_ context.Context) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.published {
		c.applySnapshots(parsedSnapshots{
			textDimensions:  []Dimension{},
			imageDimensions: []Dimension{},
		})
	}
}

// publishedDimensions is what clients read: the text dimensions first, then
// the image ones. Callers hold c.mu.
func (c *Cache) publishedDimensions() []Dimension {
	return append(slices.Clone(c.textDimensions), c.imageDimensions...)
}

// publishedModels is what clients read: the operator-mapped text models first,
// then the static image models. Callers hold c.mu.
func (c *Cache) publishedModels(mapped []Model) []Model {
	models := make([]Model, 0, len(mapped)+len(c.imageModels))
	for _, model := range mapped {
		model.Modality = modalityText
		models = append(models, model)
	}
	return append(models, c.imageModels...)
}

// snapshotScores indexes the published text ratings by source identity so
// operator mappings can be scored without another data source.
func snapshotScores(models []Model) map[string]map[string]Score {
	scores := make(map[string]map[string]Score)
	for _, model := range models {
		for _, tier := range model.Tiers {
			if tier.SourceName != "" && len(tier.Scores) > 0 {
				scores[tier.SourceName] = tier.Scores
			}
		}
	}
	return scores
}
