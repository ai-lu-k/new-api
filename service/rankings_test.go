package service

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPricingDrawsImages(t *testing.T) {
	tests := []struct {
		name    string
		pricing model.Pricing
		want    bool
	}{
		{
			name:    "output modality image",
			pricing: model.Pricing{OutputModalities: []string{"image"}},
			want:    true,
		},
		{
			name:    "image generation endpoint",
			pricing: model.Pricing{SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeImageGeneration}},
			want:    true,
		},
		{
			name:    "text only",
			pricing: model.Pricing{OutputModalities: []string{"text"}, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI}},
			want:    false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, pricingDrawsImages(tc.pricing))
		})
	}
}

func TestPricingIsDecision(t *testing.T) {
	tests := []struct {
		name    string
		pricing model.Pricing
		want    bool
	}{
		{
			name:    "decision tag",
			pricing: model.Pricing{Tags: "决策模型"},
			want:    true,
		},
		{
			name:    "english tag, any case",
			pricing: model.Pricing{Tags: "Decision"},
			want:    true,
		},
		{
			name:    "decision among several tags",
			pricing: model.Pricing{Tags: "评测, 决策模型"},
			want:    true,
		},
		{
			name:    "unrelated tag",
			pricing: model.Pricing{Tags: "文本模型"},
			want:    false,
		},
		{
			name:    "no tags",
			pricing: model.Pricing{},
			want:    false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, pricingIsDecision(tc.pricing))
		})
	}
}

func TestSplitRankingTotalsByKindSeparatesImageModels(t *testing.T) {
	// A decision model with a picture-capable metadata set still lands on the
	// decision board only, never on the text or image boards.
	meta := map[string]rankingModelMeta{
		"chat-model":   {vendor: "DeepSeek"},
		"image-model":  {vendor: "Google", image: true},
		"second-image": {vendor: "OpenAI", image: true},
		"voice-model":  {vendor: "HeyGen", audio: true},
		"jev":          {vendor: "Jev", image: true, decision: true},
	}
	totals := []model.RankingQuotaTotal{
		{ModelName: "chat-model", TotalTokens: 100, TotalRequests: 2},
		{ModelName: "image-model", TotalTokens: 0, TotalRequests: 9},
		{ModelName: "second-image", TotalTokens: 0, TotalRequests: 4},
		{ModelName: "voice-model", TotalTokens: 0, TotalRequests: 40},
		{ModelName: "jev", TotalTokens: 500, TotalRequests: 3},
	}

	text, image, audio, decision := splitRankingTotalsByKind(totals, meta)

	require.Len(t, text, 1)
	assert.Equal(t, "chat-model", text[0].ModelName)
	require.Len(t, image, 2)
	assert.Equal(t, "image-model", image[0].ModelName)
	assert.Equal(t, "second-image", image[1].ModelName)
	require.Len(t, audio, 1)
	assert.Equal(t, "voice-model", audio[0].ModelName)
	assert.Equal(t, int64(40), audio[0].TotalRequests)
	require.Len(t, decision, 1)
	assert.Equal(t, "jev", decision[0].ModelName)
	assert.Equal(t, int64(500), decision[0].TotalTokens)
}

func TestBuildRankedImageModelsCountsCalls(t *testing.T) {
	meta := map[string]rankingModelMeta{
		"image-a": {vendor: "Google", image: true},
		"image-b": {vendor: "OpenAI", image: true},
	}
	current := sortRankingTotalsByRequests([]model.RankingQuotaTotal{
		{ModelName: "image-a", TotalRequests: 300},
		{ModelName: "image-b", TotalRequests: 100},
	})
	previous := []model.RankingQuotaTotal{
		{ModelName: "image-a", TotalRequests: 200},
		{ModelName: "image-b", TotalRequests: 200},
	}

	rows := buildRankedImageModels(current, previous, meta, true)

	require.Len(t, rows, 2)
	assert.Equal(t, "image-a", rows[0].ModelName)
	assert.Equal(t, 1, rows[0].Rank)
	require.NotNil(t, rows[0].PreviousRank)
	assert.Equal(t, 1, *rows[0].PreviousRank)
	assert.Equal(t, 300, int(rows[0].TotalRequests))
	assert.InDelta(t, 0.75, rows[0].Share, 0.0001)
	assert.InDelta(t, 50, rows[0].GrowthPct, 0.0001)

	assert.Equal(t, "image-b", rows[1].ModelName)
	assert.Equal(t, 2, rows[1].Rank)
	require.NotNil(t, rows[1].PreviousRank)
	assert.Equal(t, 2, *rows[1].PreviousRank)
	assert.InDelta(t, -50, rows[1].GrowthPct, 0.0001)
}

func TestBuildImageHistorySumsCallsPerBucket(t *testing.T) {
	meta := map[string]rankingModelMeta{
		"image-a": {vendor: "Google", image: true},
		"image-b": {vendor: "OpenAI", image: true},
	}
	first := time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC).Unix()
	second := first + 24*3600
	config := rankingPeriodConfig{id: "week", duration: 7 * 24 * time.Hour, bucketSize: 24 * 3600, labelLayout: "Jan 2", hasPrevious: true}
	totals := []model.RankingQuotaTotal{
		{ModelName: "image-a", TotalRequests: 30},
		{ModelName: "image-b", TotalRequests: 10},
	}
	buckets := []model.RankingQuotaBucket{
		{ModelName: "image-a", Bucket: first, Requests: 20},
		{ModelName: "image-b", Bucket: first, Requests: 10},
		{ModelName: "image-b", Bucket: second, Requests: 5},
	}

	history := buildImageHistory(buckets, totals, meta, config)

	assert.Equal(t, 2, history.Buckets)
	require.Len(t, history.Models, 2)
	assert.Equal(t, "image-a", history.Models[0].Name)
	assert.Equal(t, 30, int(history.Models[0].Total))
	require.Len(t, history.Points, 3)
	assert.Equal(t, "image-a", history.Points[0].Model)
	assert.Equal(t, 20, int(history.Points[0].Requests))
	assert.Equal(t, "image-b", history.Points[1].Model)
	assert.Equal(t, 10, int(history.Points[1].Requests))
	assert.Equal(t, 5, int(history.Points[2].Requests))
}

func TestBuildModelHistoryRanksDecisionModelsByTokens(t *testing.T) {
	// The decision board reuses the token history shape: one "jev" model
	// fills its own series, second only if more usage is recorded.
	meta := map[string]rankingModelMeta{
		"jev": {vendor: "Jev", decision: true},
	}
	first := time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC).Unix()
	second := first + 24*3600
	config := rankingPeriodConfig{id: "week", duration: 7 * 24 * time.Hour, bucketSize: 24 * 3600, labelLayout: "Jan 2", hasPrevious: true}
	totals := []model.RankingQuotaTotal{
		{ModelName: "jev", TotalTokens: 480, TotalRequests: 3},
	}
	buckets := []model.RankingQuotaBucket{
		{ModelName: "jev", Bucket: first, Tokens: 300},
		{ModelName: "jev", Bucket: second, Tokens: 180},
	}

	history := buildModelHistory(buckets, totals, meta, config)

	assert.Equal(t, 2, history.Buckets)
	require.Len(t, history.Models, 1)
	assert.Equal(t, "jev", history.Models[0].Name)
	assert.Equal(t, int64(480), history.Models[0].Total)
	require.Len(t, history.Points, 2)
	assert.Equal(t, "jev", history.Points[0].Model)
	assert.Equal(t, int64(300), history.Points[0].Tokens)
}
