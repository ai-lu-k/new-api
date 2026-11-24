package benchmark

import (
	"context"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// These fixtures use synthetic model identities and scores.
const textSnapshotModel = `{"id":"a","aliases":["a"],"highest_tier":"default","tiers":[{"id":"default","source_name":"a","scores":{` + allTextDimensionsScored + `}}]}`
const textSnapshotTemplate = `{"source_url":"https://benchmark.example.test/text","license_url":"https://benchmark.example.test/terms","version":"Example Text Evaluations","updated_at":"2026-10-29T00:00:00Z","dimensions":[{"id":"overall","label_key":"Overall","group":"Capability","date":"2026-10-29"},{"id":"omniscience","label_key":"Omniscience Index","group":"Evaluation","date":"2026-10-29"},{"id":"briefcase_elo","label_key":"Briefcase Elo","group":"Evaluation","date":"2026-10-29"}],"models":[%s]}`
const allTextDimensionsScored = `"overall":{"rating":50,"date":"2026-10-29"},"omniscience":{"rating":-8,"date":"2026-10-29"},"briefcase_elo":{"rating":1400,"date":"2026-10-29"}`

var testTextSnapshot = strings.Replace(textSnapshotTemplate, "%s", textSnapshotModel, 1)

const testImageSnapshot = `{
  "source_url":"https://benchmark.example.test/images",
  "license_url":"https://benchmark.example.test/image-terms",
  "version":"Example Image Evaluations",
  "dimensions":[{"id":"image:overall","label_key":"Overall"},{"id":"image:layout","label_key":"Layout"}],
  "models":[{"id":"example-image","aliases":["example-image"],"highest_tier":"default",
    "tiers":[{"id":"default","source_name":"Example image","scores":{
      "image:overall":{"rating":1200,"date":"2026-01-01"},
      "image:layout":{"rating":1100,"date":"2026-01-01"}
    }}]}]
}`

const testBenchmarkMappings = `[{"id":"example-text","aliases":["example-text-discount"],"highest_tier":"high",
  "tiers":[{"id":"high","source_name":"a"},{"id":"low","source_name":"unscored"}]}]`

func parseTextSnapshotTemplate(t *testing.T, models string) (Snapshot, []Dimension, []Model, error) {
	t.Helper()
	return parseTextSnapshot([]byte(strings.Replace(textSnapshotTemplate, `[%s]`, "["+models+"]", 1)))
}

func TestNewBenchmarkCacheStartsEmpty(t *testing.T) {
	cache := NewCache()
	cache.Start(context.Background())
	assert.Empty(t, cache.Get().Models)
	assert.Empty(t, cache.Get().Dimensions)
	require.NoError(t, ValidateSnapshots(DefaultTextSnapshotJSON(), DefaultImageSnapshotJSON()))
}

func TestTextSnapshotRejectsInvalidScoresAndDimensions(t *testing.T) {
	_, dimensions, models, err := parseTextSnapshot([]byte(testTextSnapshot))
	require.NoError(t, err)
	assert.Len(t, dimensions, 3)
	assert.Len(t, models, 1)

	for name, corrupt := range map[string]func(file *Snapshot){
		"percent rating out of range": func(file *Snapshot) {
			file.Models[0].Tiers[0].Scores["overall"] = Score{Rating: 100.1, Date: "2026-10-29"}
		},
		"negative percent rating": func(file *Snapshot) {
			file.Models[0].Tiers[0].Scores["overall"] = Score{Rating: -0.1, Date: "2026-10-29"}
		},
		"Elo rating out of range": func(file *Snapshot) {
			file.Models[0].Tiers[0].Scores["briefcase_elo"] = Score{Rating: 2000.01, Date: "2026-10-29"}
		},
		"AA index under its bound": func(file *Snapshot) {
			file.Models[0].Tiers[0].Scores["omniscience"] = Score{Rating: -100.01, Date: "2026-10-29"}
		},
		"missing score date": func(file *Snapshot) {
			file.Models[0].Tiers[0].Scores["overall"] = Score{Rating: 49}
		},
		"unknown dimension": func(file *Snapshot) {
			file.Models[0].Tiers[0].Scores["mystery"] = Score{Rating: 50, Date: "2026-10-29"}
		},
		"empty scoreboard": func(file *Snapshot) {
			file.Models[0].Tiers[0].Scores = map[string]Score{}
		},
		"image-prefixed text dimension": func(file *Snapshot) {
			file.Dimensions[0].ID = "image:overall"
		},
		"duplicate text dimension": func(file *Snapshot) {
			file.Dimensions[0].ID = file.Dimensions[1].ID
		},
	} {
		t.Run(name, func(t *testing.T) {
			var file Snapshot
			require.NoError(t, common.UnmarshalJsonStr(testTextSnapshot, &file))
			corrupt(&file)
			data, marshalErr := common.Marshal(file)
			require.NoError(t, marshalErr)
			_, _, _, err := parseTextSnapshot(data)
			require.Error(t, err)
		})
	}

	for name, score := range map[string]string{
		"non-finite rating":   `NaN`,
		"overflowing rating":  `1e400`,
		"non-numeric rating":  `"50"`,
		"correct rating type": `50`,
	} {
		t.Run(name, func(t *testing.T) {
			source := strings.Replace(textSnapshotModel, `"rating":50`, `"rating":`+score, 1)
			_, _, _, err := parseTextSnapshotTemplate(t, source)
			if name == "correct rating type" {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		})
	}
	// A model with a single dimension is valid partial coverage.
	partial := strings.Replace(textSnapshotModel, allTextDimensionsScored, `"overall":{"rating":50,"date":"2026-10-29"}`, 1)
	_, _, _, err = parseTextSnapshotTemplate(t, partial)
	require.NoError(t, err)
}

func TestPublishedBenchmarkSeparatesModalitiesAndResolvesTiers(t *testing.T) {
	cache := NewCache()
	require.NoError(t, cache.SetMappings(testBenchmarkMappings))
	require.NoError(t, cache.SetSnapshots(testTextSnapshot, testImageSnapshot))
	published := cache.Get()
	require.Len(t, published.Models, 2)
	require.Len(t, published.Dimensions, 5)
	text, image := published.Models[0], published.Models[1]
	assert.Equal(t, modalityText, text.Modality)
	assert.Equal(t, modalityImage, image.Modality)
	assert.Equal(t, []string{"example-text-discount"}, text.Aliases)
	assert.Equal(t, "high", text.HighestTier)
	assert.Equal(t, 50.0, text.Tiers[0].Scores["overall"].Rating)
	assert.Equal(t, -8.0, text.Tiers[0].Scores["omniscience"].Rating)
	assert.Empty(t, text.Tiers[1].Scores)
	assert.Equal(t, 1200.0, image.Tiers[0].Scores["image:overall"].Rating)
	assert.Equal(t, "overall", published.Dimensions[0].ID)
	assert.Equal(t, "image:overall", published.Dimensions[3].ID)
	assert.Equal(t, "Example Text Evaluations", published.Version)
	require.NotNil(t, published.ImageAttribution)
	assert.Equal(t, Attribution{
		SourceURL:  "https://benchmark.example.test/images",
		LicenseURL: "https://benchmark.example.test/image-terms",
		Version:    "Example Image Evaluations",
	}, *published.ImageAttribution)

	// A previously saved image snapshot without metadata keeps its scores.
	legacy := testImageSnapshot[strings.Index(testImageSnapshot, `"dimensions"`):]
	require.NoError(t, cache.SetSnapshots(testTextSnapshot, "{"+legacy))
	assert.Nil(t, cache.Get().ImageAttribution)
	require.Len(t, cache.Get().Models, 2)
}

func TestImageBenchmarkSnapshotRejectsInvalidData(t *testing.T) {
	snapshot, err := parseImageSnapshot([]byte(testImageSnapshot))
	require.NoError(t, err)
	assert.Len(t, snapshot.Dimensions, 2)
	assert.Len(t, snapshot.Models, 1)

	renameDimension := func(file *imageSnapshotFile, from, to string) {
		for i := range file.Dimensions {
			if file.Dimensions[i].ID == from {
				file.Dimensions[i].ID = to
			}
		}
		for i := range file.Models {
			scores := file.Models[i].Tiers[0].Scores
			scores[to] = scores[from]
			delete(scores, from)
		}
	}
	for name, corrupt := range map[string]func(file *imageSnapshotFile){
		"rating out of range": func(file *imageSnapshotFile) {
			file.Models[0].Tiers[0].Scores["image:overall"] = Score{Rating: 2001, Date: "2026-10-27"}
		},
		"missing image prefix": func(file *imageSnapshotFile) {
			renameDimension(file, "image:overall", "overall")
		},
		"duplicate dimension": func(file *imageSnapshotFile) {
			renameDimension(file, "image:layout", "image:overall")
		},
		"missing score date": func(file *imageSnapshotFile) {
			file.Models[0].Tiers[0].Scores["image:overall"] = Score{Rating: 1100}
		},
	} {
		t.Run(name, func(t *testing.T) {
			var file imageSnapshotFile
			require.NoError(t, common.UnmarshalJsonStr(testImageSnapshot, &file))
			corrupt(&file)
			data, err := common.Marshal(file)
			require.NoError(t, err)
			_, err = parseImageSnapshot(data)
			require.Error(t, err)
		})
	}
}

func TestBenchmarkMappingsKeepSourceScoresAndSupportClearing(t *testing.T) {
	cache := NewCache()
	require.NoError(t, cache.SetSnapshots(testTextSnapshot, testImageSnapshot))
	require.NoError(t, cache.SetMappings(testBenchmarkMappings))
	cache.Start(context.Background())
	assert.Equal(t, 50.0, cache.Get().Models[0].Tiers[0].Scores["overall"].Rating)
	require.NoError(t, cache.SetMappings("[]"))
	require.Len(t, cache.Get().Models, 1)
	assert.Equal(t, modalityImage, cache.Get().Models[0].Modality)
}

func TestMappingsRejectAmbiguousIdentitiesAndTierMetadata(t *testing.T) {
	for _, input := range []string{
		`null`,
		`[{"id":"example","aliases":["alias","alias"],"highest_tier":"high","tiers":[{"id":"high"}]}]`,
		`[{"id":"example","aliases":[],"highest_tier":"max","tiers":[{"id":"high"}]}]`,
		`[{"id":"example","aliases":[],"highest_tier":"high","tiers":[{"id":"high"},{"id":"high"}]}]`,
	} {
		_, err := ParseMappings(input)
		require.ErrorIs(t, err, ErrInvalidMappings)
	}
}

func TestSetSnapshotsPreservesPublishedDataOnInvalidInputAndClearsOneModality(t *testing.T) {
	cache := NewCache()
	require.NoError(t, cache.SetMappings(testBenchmarkMappings))
	require.NoError(t, cache.SetSnapshots(testTextSnapshot, testImageSnapshot))

	edited := strings.Replace(testTextSnapshot, `"rating":50`, `"rating":12.5`, 1)
	require.NoError(t, cache.SetSnapshots(edited, testImageSnapshot))
	cache.Start(context.Background())
	before := cache.Get()
	require.Len(t, before.Models, 2)
	assert.Equal(t, 12.5, before.Models[0].Tiers[0].Scores["overall"].Rating)

	require.ErrorIs(t, cache.SetSnapshots(`{"source_url":""}`, testImageSnapshot), ErrInvalidSnapshots)
	require.ErrorIs(t, cache.SetSnapshots(edited, `{"dimensions":[]}`), ErrInvalidSnapshots)
	assert.Equal(t, before, cache.Get())

	require.NoError(t, cache.SetSnapshots(edited, DefaultImageSnapshotJSON()))
	require.Len(t, cache.Get().Models, 1)
	assert.Equal(t, 12.5, cache.Get().Models[0].Tiers[0].Scores["overall"].Rating)
}
