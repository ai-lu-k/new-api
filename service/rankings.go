package service

import (
	"fmt"
	"math"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/naming_setting"
)

const (
	rankingCacheTTL         = 5 * time.Minute
	rankingLeaderboardLimit = 20
	rankingHistoryLimit     = 10
	rankingVendorLimit      = 5
	rankingMoverLimit       = 6
	rankingOthersLabel      = "Others"
	rankingUnknownVendor    = "Unknown"
)

type RankingsResponse struct {
	Models                []RankedModel      `json:"models"`
	ImageModels           []RankedImageModel `json:"image_models"`
	DecisionModels        []RankedModel      `json:"decision_models"`
	Vendors               []RankedVendor     `json:"vendors"`
	TopMovers             []RankingMover     `json:"top_movers"`
	TopDroppers           []RankingMover     `json:"top_droppers"`
	ModelsHistory         ModelHistorySeries `json:"models_history"`
	ImageModelsHistory    ImageHistorySeries `json:"image_models_history"`
	AudioModelsHistory    ImageHistorySeries `json:"audio_models_history"`
	DecisionModelsHistory ModelHistorySeries `json:"decision_models_history"`
	VendorShareHistory    VendorShareSeries  `json:"vendor_share_history"`
}

type RankedModel struct {
	Rank         int    `json:"rank"`
	PreviousRank *int   `json:"previous_rank,omitempty"`
	ModelName    string `json:"model_name"`
	Vendor       string `json:"vendor"`
	VendorIcon   string `json:"vendor_icon,omitempty"`
	Category     string `json:"category"`
	TotalTokens  int64  `json:"total_tokens"`
	// TotalRequests is carried alongside the tokens so a model priced by token
	// can still show how often it was called.
	TotalRequests int64   `json:"total_requests,omitempty"`
	Share         float64 `json:"share"`
	GrowthPct     float64 `json:"growth_pct"`
}

// RankedImageModel is an image generation model ranked by how many calls it
// served. These models return pictures rather than tokens, so a token ranking
// would leave them out entirely.
type RankedImageModel struct {
	Rank          int     `json:"rank"`
	PreviousRank  *int    `json:"previous_rank,omitempty"`
	ModelName     string  `json:"model_name"`
	Vendor        string  `json:"vendor"`
	VendorIcon    string  `json:"vendor_icon,omitempty"`
	TotalRequests int64   `json:"total_requests"`
	Share         float64 `json:"share"`
	GrowthPct     float64 `json:"growth_pct"`
}

type RankedVendor struct {
	Rank        int     `json:"rank"`
	Vendor      string  `json:"vendor"`
	VendorIcon  string  `json:"vendor_icon,omitempty"`
	TotalTokens int64   `json:"total_tokens"`
	Share       float64 `json:"share"`
	GrowthPct   float64 `json:"growth_pct"`
	ModelsCount int     `json:"models_count"`
	TopModel    string  `json:"top_model"`
}

type RankingMover struct {
	ModelName   string  `json:"model_name"`
	Vendor      string  `json:"vendor"`
	VendorIcon  string  `json:"vendor_icon,omitempty"`
	RankDelta   int     `json:"rank_delta"`
	CurrentRank int     `json:"current_rank"`
	GrowthPct   float64 `json:"growth_pct"`
}

type ModelHistoryPoint struct {
	Ts     string `json:"ts"`
	Label  string `json:"label"`
	Model  string `json:"model"`
	Vendor string `json:"vendor"`
	Tokens int64  `json:"tokens"`
}

type ModelHistoryModel struct {
	Name   string `json:"name"`
	Vendor string `json:"vendor"`
	Total  int64  `json:"total"`
}

type ModelHistorySeries struct {
	Points  []ModelHistoryPoint `json:"points"`
	Models  []ModelHistoryModel `json:"models"`
	Buckets int                 `json:"buckets"`
}

type ImageHistoryPoint struct {
	Ts       string `json:"ts"`
	Label    string `json:"label"`
	Model    string `json:"model"`
	Vendor   string `json:"vendor"`
	Requests int64  `json:"requests"`
}

// ImageHistorySeries is the same shape as ModelHistorySeries, measured in
// calls instead of tokens.
type ImageHistorySeries struct {
	Points  []ImageHistoryPoint `json:"points"`
	Models  []ModelHistoryModel `json:"models"`
	Buckets int                 `json:"buckets"`
}

type VendorSharePoint struct {
	Ts     string  `json:"ts"`
	Label  string  `json:"label"`
	Vendor string  `json:"vendor"`
	Share  float64 `json:"share"`
	Tokens int64   `json:"tokens"`
}

type VendorShareVendor struct {
	Name  string  `json:"name"`
	Total int64   `json:"total"`
	Share float64 `json:"share"`
}

type VendorShareSeries struct {
	Points  []VendorSharePoint  `json:"points"`
	Vendors []VendorShareVendor `json:"vendors"`
	Buckets int                 `json:"buckets"`
}

type rankingPeriodConfig struct {
	id          string
	duration    time.Duration
	bucketSize  int64
	labelLayout string
	hasPrevious bool
}

type rankingCacheItem struct {
	expiresAt time.Time
	data      *RankingsResponse
}

type rankingModelMeta struct {
	vendor     string
	vendorIcon string
	image      bool
	audio      bool
	decision   bool
}

type vendorAggregate struct {
	name           string
	icon           string
	totalTokens    int64
	previousTokens int64
	models         map[string]struct{}
	topModel       string
	topModelTokens int64
}

var (
	rankingCacheMu sync.Mutex
	rankingCache   = map[string]rankingCacheItem{}
)

func GetRankingsSnapshot(period string) (*RankingsResponse, error) {
	config, err := rankingConfig(period)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	rankingCacheMu.Lock()
	if item, ok := rankingCache[config.id]; ok && now.Before(item.expiresAt) {
		rankingCacheMu.Unlock()
		return item.data, nil
	}
	rankingCacheMu.Unlock()

	data, err := buildRankingsSnapshot(config, now)
	if err != nil {
		return nil, err
	}

	rankingCacheMu.Lock()
	rankingCache[config.id] = rankingCacheItem{
		expiresAt: now.Add(rankingCacheTTL),
		data:      data,
	}
	rankingCacheMu.Unlock()

	return data, nil
}

func rankingConfig(period string) (rankingPeriodConfig, error) {
	switch period {
	case "", "week":
		return rankingPeriodConfig{id: "week", duration: 7 * 24 * time.Hour, bucketSize: 24 * 3600, labelLayout: "Jan 2", hasPrevious: true}, nil
	case "today":
		return rankingPeriodConfig{id: "today", duration: 24 * time.Hour, bucketSize: 3600, labelLayout: "15:04", hasPrevious: true}, nil
	case "month":
		return rankingPeriodConfig{id: "month", duration: 30 * 24 * time.Hour, bucketSize: 24 * 3600, labelLayout: "Jan 2", hasPrevious: true}, nil
	case "year":
		return rankingPeriodConfig{id: "year", duration: 365 * 24 * time.Hour, bucketSize: 7 * 24 * 3600, labelLayout: "Jan 2", hasPrevious: true}, nil
	default:
		return rankingPeriodConfig{}, fmt.Errorf("invalid ranking period: %s", period)
	}
}

func buildRankingsSnapshot(config rankingPeriodConfig, now time.Time) (*RankingsResponse, error) {
	startTime, endTime := rankingTimeRange(config, now)
	meta := buildRankingModelMeta()
	currentTotals, err := model.GetRankingQuotaTotals(startTime, endTime)
	if err != nil {
		return nil, err
	}
	currentTotals = foldRankingAliasTotals(currentTotals)
	currentBuckets, err := model.GetRankingQuotaBuckets(startTime, endTime, config.bucketSize)
	if err != nil {
		return nil, err
	}
	currentBuckets = foldRankingAliasBuckets(currentBuckets)

	textTotals, imageTotals, audioTotals, decisionTotals := splitRankingTotalsByKind(currentTotals, meta)
	textBuckets, imageBuckets, audioBuckets, decisionBuckets := splitRankingBucketsByKind(currentBuckets, meta)
	imageTotals = sortRankingTotalsByRequests(imageTotals)

	var previousTextTotals, previousImageTotals, previousDecisionTotals []model.RankingQuotaTotal
	if config.hasPrevious {
		previousStart, previousEnd := previousRankingTimeRange(config, startTime)
		previousTotals, err := model.GetRankingQuotaTotals(previousStart, previousEnd)
		if err != nil {
			return nil, err
		}
		previousTotals = foldRankingAliasTotals(previousTotals)
		previousTextTotals, previousImageTotals, _, previousDecisionTotals = splitRankingTotalsByKind(previousTotals, meta)
	}

	totalTokens := sumRankingTokens(textTotals)
	previousRankByModel := rankingRankMap(previousTextTotals)
	previousTokensByModel := rankingTokenMap(previousTextTotals)

	rankedModels := buildRankedModels(textTotals, totalTokens, previousRankByModel, previousTokensByModel, meta, config.hasPrevious)
	imageModels := buildRankedImageModels(imageTotals, previousImageTotals, meta, config.hasPrevious)
	// The decision board ranks tokens like the text board, but from its own
	// models only, so a decision model never shares a rank with chat models.
	decisionTokens := sumRankingTokens(decisionTotals)
	previousRankByDecision := rankingRankMap(previousDecisionTotals)
	previousTokensByDecision := rankingTokenMap(previousDecisionTotals)
	rankedDecisionModels := buildRankedModels(decisionTotals, decisionTokens, previousRankByDecision, previousTokensByDecision, meta, config.hasPrevious)
	vendors := buildRankedVendors(textTotals, previousTextTotals, totalTokens, meta, config.hasPrevious)
	modelHistory := buildModelHistory(textBuckets, textTotals, meta, config)
	imageHistory := buildImageHistory(imageBuckets, imageTotals, meta, config)
	audioHistory := buildImageHistory(audioBuckets, audioTotals, meta, config)
	decisionHistory := buildModelHistory(decisionBuckets, decisionTotals, meta, config)
	vendorHistory := buildVendorShareHistory(textBuckets, vendors, totalTokens, meta, config)
	movers, droppers := buildRankingMovers(rankedModels)

	return &RankingsResponse{
		Models:                limitRankedModels(rankedModels, rankingLeaderboardLimit),
		ImageModels:           imageModels,
		DecisionModels:        limitRankedModels(rankedDecisionModels, rankingLeaderboardLimit),
		Vendors:               vendors,
		TopMovers:             movers,
		TopDroppers:           droppers,
		ModelsHistory:         modelHistory,
		ImageModelsHistory:    imageHistory,
		AudioModelsHistory:    audioHistory,
		DecisionModelsHistory: decisionHistory,
		VendorShareHistory:    vendorHistory,
	}, nil
}

func rankingTimeRange(config rankingPeriodConfig, now time.Time) (int64, int64) {
	endTime := now.Unix()
	if config.duration <= 0 {
		return 0, endTime
	}
	return now.Add(-config.duration).Unix(), endTime
}

func previousRankingTimeRange(config rankingPeriodConfig, currentStart int64) (int64, int64) {
	previousEnd := currentStart - 1
	previousStart := time.Unix(currentStart, 0).Add(-config.duration).Unix()
	return previousStart, previousEnd
}

func buildRankingModelMeta() map[string]rankingModelMeta {
	vendorByID := make(map[int]model.PricingVendor)
	for _, vendor := range model.GetVendors() {
		vendorByID[vendor.ID] = vendor
	}

	meta := make(map[string]rankingModelMeta)
	for _, pricing := range model.GetPricing() {
		item := rankingModelMeta{
			vendor:   rankingUnknownVendor,
			image:    pricingDrawsImages(pricing),
			audio:    pricingSpeaksAudio(pricing),
			decision: pricingIsDecision(pricing),
		}
		if vendor, ok := vendorByID[pricing.VendorID]; ok {
			item.vendor = vendor.Name
			item.vendorIcon = vendor.Icon
		} else if pricing.OwnerBy != "" {
			item.vendor = pricing.OwnerBy
		}
		meta[pricing.ModelName] = item
	}
	return meta
}

// pricingDrawsImages reports whether a model produces a picture. The stated
// output modality is authoritative; the image generation endpoint is the
// fallback for models whose metadata does not list modalities yet.
// pricingSpeaksAudio reports whether a model answers with speech. Speech is
// billed per character or per call, never in tokens, so its traffic is counted
// in calls like the image board.
func pricingSpeaksAudio(pricing model.Pricing) bool {
	return slices.Contains(pricing.OutputModalities, "audio")
}

func pricingDrawsImages(pricing model.Pricing) bool {
	return slices.Contains(pricing.OutputModalities, "image") ||
		slices.Contains(pricing.SupportedEndpointTypes, constant.EndpointTypeImageGeneration)
}

// pricingIsDecision reports whether a model is the synchronous decision model
// such as "jev". The pricing catalogue marks it with a tag, because a decision
// ranking reads tokens like a chat model while its output is not text.
func pricingIsDecision(pricing model.Pricing) bool {
	for tag := range strings.SplitSeq(pricing.Tags, ",") {
		tag = strings.ToLower(strings.TrimSpace(tag))
		if strings.Contains(tag, "决策模型") || strings.Contains(tag, "decision") {
			return true
		}
	}
	return false
}

// splitRankingTotalsByKind sorts usage rows into the three leaderboard
// buckets. A decision model is decided first and ranked only on the decision
// board, so it never also counts as a text or image model.
func splitRankingTotalsByKind(totals []model.RankingQuotaTotal, meta map[string]rankingModelMeta) (text []model.RankingQuotaTotal, image []model.RankingQuotaTotal, audio []model.RankingQuotaTotal, decision []model.RankingQuotaTotal) {
	text = make([]model.RankingQuotaTotal, 0, len(totals))
	image = make([]model.RankingQuotaTotal, 0, len(totals))
	audio = make([]model.RankingQuotaTotal, 0, len(totals))
	decision = make([]model.RankingQuotaTotal, 0, len(totals))
	for _, item := range totals {
		switch kind := modelMeta(item.ModelName, meta); {
		case kind.decision:
			decision = append(decision, item)
		case kind.image:
			image = append(image, item)
		case kind.audio:
			audio = append(audio, item)
		default:
			text = append(text, item)
		}
	}
	return text, image, audio, decision
}

func splitRankingBucketsByKind(buckets []model.RankingQuotaBucket, meta map[string]rankingModelMeta) (text []model.RankingQuotaBucket, image []model.RankingQuotaBucket, audio []model.RankingQuotaBucket, decision []model.RankingQuotaBucket) {
	text = make([]model.RankingQuotaBucket, 0, len(buckets))
	image = make([]model.RankingQuotaBucket, 0, len(buckets))
	audio = make([]model.RankingQuotaBucket, 0, len(buckets))
	decision = make([]model.RankingQuotaBucket, 0, len(buckets))
	for _, item := range buckets {
		switch kind := modelMeta(item.ModelName, meta); {
		case kind.decision:
			decision = append(decision, item)
		case kind.image:
			image = append(image, item)
		case kind.audio:
			audio = append(audio, item)
		default:
			text = append(text, item)
		}
	}
	return text, image, audio, decision
}

func modelMeta(modelName string, meta map[string]rankingModelMeta) rankingModelMeta {
	if item, ok := meta[modelName]; ok && item.vendor != "" {
		return item
	}
	return rankingModelMeta{vendor: rankingUnknownVendor}
}

func buildRankedModels(totals []model.RankingQuotaTotal, totalTokens int64, previousRanks map[string]int, previousTokens map[string]int64, meta map[string]rankingModelMeta, showGrowth bool) []RankedModel {
	rows := make([]RankedModel, 0, len(totals))
	for idx, item := range totals {
		modelMeta := modelMeta(item.ModelName, meta)
		var previousRank *int
		if rank, ok := previousRanks[item.ModelName]; ok {
			rankCopy := rank
			previousRank = &rankCopy
		}
		growth := 0.0
		if showGrowth {
			growth = rankingGrowthPct(item.TotalTokens, previousTokens[item.ModelName])
		}
		rows = append(rows, RankedModel{
			Rank:          idx + 1,
			PreviousRank:  previousRank,
			ModelName:     item.ModelName,
			Vendor:        modelMeta.vendor,
			VendorIcon:    modelMeta.vendorIcon,
			Category:      "all",
			TotalTokens:   item.TotalTokens,
			TotalRequests: item.TotalRequests,
			Share:         rankingShare(item.TotalTokens, totalTokens),
			GrowthPct:     growth,
		})
	}
	return rows
}

// sortRankingTotalsByRequests orders usage rows the way the image leaderboard
// reads them: most calls first, ties broken by name so the order is stable.
func sortRankingTotalsByRequests(totals []model.RankingQuotaTotal) []model.RankingQuotaTotal {
	sorted := slices.Clone(totals)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].TotalRequests == sorted[j].TotalRequests {
			return sorted[i].ModelName < sorted[j].ModelName
		}
		return sorted[i].TotalRequests > sorted[j].TotalRequests
	})
	return sorted
}

// buildRankedImageModels ranks image generation models by call count. totals
// must already be ordered by requests.
func buildRankedImageModels(totals []model.RankingQuotaTotal, previousTotals []model.RankingQuotaTotal, meta map[string]rankingModelMeta, showGrowth bool) []RankedImageModel {
	previousRanks := make(map[string]int, len(previousTotals))
	previousRequests := make(map[string]int64, len(previousTotals))
	for idx, item := range sortRankingTotalsByRequests(previousTotals) {
		previousRanks[item.ModelName] = idx + 1
		previousRequests[item.ModelName] = item.TotalRequests
	}

	totalRequests := int64(0)
	for _, item := range totals {
		totalRequests += item.TotalRequests
	}

	rows := make([]RankedImageModel, 0, len(totals))
	for _, item := range totals {
		if item.TotalRequests <= 0 {
			continue
		}
		modelMeta := modelMeta(item.ModelName, meta)
		var previousRank *int
		if rank, ok := previousRanks[item.ModelName]; ok {
			rankCopy := rank
			previousRank = &rankCopy
		}
		growth := 0.0
		if showGrowth {
			growth = rankingGrowthPct(item.TotalRequests, previousRequests[item.ModelName])
		}
		rows = append(rows, RankedImageModel{
			Rank:          len(rows) + 1,
			PreviousRank:  previousRank,
			ModelName:     item.ModelName,
			Vendor:        modelMeta.vendor,
			VendorIcon:    modelMeta.vendorIcon,
			TotalRequests: item.TotalRequests,
			Share:         rankingShare(item.TotalRequests, totalRequests),
			GrowthPct:     growth,
		})
	}
	return limitRankedImageModels(rows, rankingLeaderboardLimit)
}

// buildImageHistory is buildModelHistory for the image board: the same top
// models and buckets, with call counts in place of tokens.
func buildImageHistory(buckets []model.RankingQuotaBucket, totals []model.RankingQuotaTotal, meta map[string]rankingModelMeta, config rankingPeriodConfig) ImageHistorySeries {
	topModels := make(map[string]struct{})
	models := make([]ModelHistoryModel, 0, minInt(len(totals), rankingHistoryLimit)+1)
	otherTotal := int64(0)
	for idx, item := range totals {
		if idx < rankingHistoryLimit {
			topModels[item.ModelName] = struct{}{}
			modelMeta := modelMeta(item.ModelName, meta)
			models = append(models, ModelHistoryModel{Name: item.ModelName, Vendor: modelMeta.vendor, Total: item.TotalRequests})
			continue
		}
		otherTotal += item.TotalRequests
	}
	if otherTotal > 0 {
		models = append(models, ModelHistoryModel{Name: rankingOthersLabel, Vendor: "Various", Total: otherTotal})
	}

	bucketSet := make(map[int64]struct{})
	requestsByBucketAndModel := make(map[int64]map[string]int64)
	for _, item := range buckets {
		modelName := item.ModelName
		if _, ok := topModels[modelName]; !ok {
			modelName = rankingOthersLabel
		}
		bucketSet[item.Bucket] = struct{}{}
		if _, ok := requestsByBucketAndModel[item.Bucket]; !ok {
			requestsByBucketAndModel[item.Bucket] = make(map[string]int64)
		}
		requestsByBucketAndModel[item.Bucket][modelName] += item.Requests
	}

	sortedBuckets := sortedRankingBuckets(bucketSet)
	points := make([]ImageHistoryPoint, 0, len(sortedBuckets)*len(models))
	for _, bucket := range sortedBuckets {
		for _, historyModel := range models {
			requests := requestsByBucketAndModel[bucket][historyModel.Name]
			if requests <= 0 {
				continue
			}
			points = append(points, ImageHistoryPoint{
				Ts:       rankingBucketTs(bucket),
				Label:    rankingBucketLabel(bucket, config),
				Model:    historyModel.Name,
				Vendor:   historyModel.Vendor,
				Requests: requests,
			})
		}
	}

	return ImageHistorySeries{
		Points:  points,
		Models:  models,
		Buckets: len(sortedBuckets),
	}
}

func limitRankedImageModels(rows []RankedImageModel, limit int) []RankedImageModel {
	if limit <= 0 || len(rows) <= limit {
		return rows
	}
	return rows[:limit]
}

func buildRankedVendors(currentTotals []model.RankingQuotaTotal, previousTotals []model.RankingQuotaTotal, totalTokens int64, meta map[string]rankingModelMeta, showGrowth bool) []RankedVendor {
	aggregates := make(map[string]*vendorAggregate)
	for _, item := range currentTotals {
		modelMeta := modelMeta(item.ModelName, meta)
		agg := ensureVendorAggregate(aggregates, modelMeta)
		agg.totalTokens += item.TotalTokens
		agg.models[item.ModelName] = struct{}{}
		if item.TotalTokens > agg.topModelTokens {
			agg.topModel = item.ModelName
			agg.topModelTokens = item.TotalTokens
		}
	}
	for _, item := range previousTotals {
		modelMeta := modelMeta(item.ModelName, meta)
		agg := ensureVendorAggregate(aggregates, modelMeta)
		agg.previousTokens += item.TotalTokens
	}

	rows := make([]RankedVendor, 0, len(aggregates))
	for _, agg := range aggregates {
		if agg.totalTokens <= 0 {
			continue
		}
		growth := 0.0
		if showGrowth {
			growth = rankingGrowthPct(agg.totalTokens, agg.previousTokens)
		}
		rows = append(rows, RankedVendor{
			Vendor:      agg.name,
			VendorIcon:  agg.icon,
			TotalTokens: agg.totalTokens,
			Share:       rankingShare(agg.totalTokens, totalTokens),
			GrowthPct:   growth,
			ModelsCount: len(agg.models),
			TopModel:    agg.topModel,
		})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].TotalTokens == rows[j].TotalTokens {
			return rows[i].Vendor < rows[j].Vendor
		}
		return rows[i].TotalTokens > rows[j].TotalTokens
	})
	for idx := range rows {
		rows[idx].Rank = idx + 1
	}
	return rows
}

func ensureVendorAggregate(aggregates map[string]*vendorAggregate, meta rankingModelMeta) *vendorAggregate {
	name := meta.vendor
	if name == "" {
		name = rankingUnknownVendor
	}
	agg, ok := aggregates[name]
	if !ok {
		agg = &vendorAggregate{
			name:   name,
			icon:   meta.vendorIcon,
			models: make(map[string]struct{}),
		}
		aggregates[name] = agg
	}
	if agg.icon == "" && meta.vendorIcon != "" {
		agg.icon = meta.vendorIcon
	}
	return agg
}

func buildModelHistory(buckets []model.RankingQuotaBucket, totals []model.RankingQuotaTotal, meta map[string]rankingModelMeta, config rankingPeriodConfig) ModelHistorySeries {
	topModels := make(map[string]struct{})
	models := make([]ModelHistoryModel, 0, minInt(len(totals), rankingHistoryLimit)+1)
	otherTotal := int64(0)
	for idx, item := range totals {
		if idx < rankingHistoryLimit {
			topModels[item.ModelName] = struct{}{}
			modelMeta := modelMeta(item.ModelName, meta)
			models = append(models, ModelHistoryModel{Name: item.ModelName, Vendor: modelMeta.vendor, Total: item.TotalTokens})
			continue
		}
		otherTotal += item.TotalTokens
	}
	if otherTotal > 0 {
		models = append(models, ModelHistoryModel{Name: rankingOthersLabel, Vendor: "Various", Total: otherTotal})
	}

	bucketSet := make(map[int64]struct{})
	tokensByBucketAndModel := make(map[int64]map[string]int64)
	for _, item := range buckets {
		modelName := item.ModelName
		if _, ok := topModels[modelName]; !ok {
			modelName = rankingOthersLabel
		}
		bucketSet[item.Bucket] = struct{}{}
		if _, ok := tokensByBucketAndModel[item.Bucket]; !ok {
			tokensByBucketAndModel[item.Bucket] = make(map[string]int64)
		}
		tokensByBucketAndModel[item.Bucket][modelName] += item.Tokens
	}

	sortedBuckets := sortedRankingBuckets(bucketSet)
	points := make([]ModelHistoryPoint, 0, len(sortedBuckets)*len(models))
	for _, bucket := range sortedBuckets {
		for _, historyModel := range models {
			tokens := tokensByBucketAndModel[bucket][historyModel.Name]
			if tokens <= 0 {
				continue
			}
			points = append(points, ModelHistoryPoint{
				Ts:     rankingBucketTs(bucket),
				Label:  rankingBucketLabel(bucket, config),
				Model:  historyModel.Name,
				Vendor: historyModel.Vendor,
				Tokens: tokens,
			})
		}
	}

	return ModelHistorySeries{
		Points:  points,
		Models:  models,
		Buckets: len(sortedBuckets),
	}
}

func buildVendorShareHistory(buckets []model.RankingQuotaBucket, vendors []RankedVendor, totalTokens int64, meta map[string]rankingModelMeta, config rankingPeriodConfig) VendorShareSeries {
	topVendors := make(map[string]struct{})
	vendorRows := make([]VendorShareVendor, 0, minInt(len(vendors), rankingVendorLimit)+1)
	otherTotal := int64(0)
	for idx, vendor := range vendors {
		if idx < rankingVendorLimit {
			topVendors[vendor.Vendor] = struct{}{}
			vendorRows = append(vendorRows, VendorShareVendor{Name: vendor.Vendor, Total: vendor.TotalTokens, Share: vendor.Share})
			continue
		}
		otherTotal += vendor.TotalTokens
	}
	if otherTotal > 0 {
		vendorRows = append(vendorRows, VendorShareVendor{Name: rankingOthersLabel, Total: otherTotal, Share: rankingShare(otherTotal, totalTokens)})
	}

	bucketSet := make(map[int64]struct{})
	tokensByBucketAndVendor := make(map[int64]map[string]int64)
	totalsByBucket := make(map[int64]int64)
	for _, item := range buckets {
		modelMeta := modelMeta(item.ModelName, meta)
		vendorName := modelMeta.vendor
		if _, ok := topVendors[vendorName]; !ok {
			vendorName = rankingOthersLabel
		}
		bucketSet[item.Bucket] = struct{}{}
		if _, ok := tokensByBucketAndVendor[item.Bucket]; !ok {
			tokensByBucketAndVendor[item.Bucket] = make(map[string]int64)
		}
		tokensByBucketAndVendor[item.Bucket][vendorName] += item.Tokens
		totalsByBucket[item.Bucket] += item.Tokens
	}

	sortedBuckets := sortedRankingBuckets(bucketSet)
	points := make([]VendorSharePoint, 0, len(sortedBuckets)*len(vendorRows))
	for _, bucket := range sortedBuckets {
		for _, vendor := range vendorRows {
			tokens := tokensByBucketAndVendor[bucket][vendor.Name]
			if tokens <= 0 {
				continue
			}
			points = append(points, VendorSharePoint{
				Ts:     rankingBucketTs(bucket),
				Label:  rankingBucketLabel(bucket, config),
				Vendor: vendor.Name,
				Share:  rankingShare(tokens, totalsByBucket[bucket]),
				Tokens: tokens,
			})
		}
	}

	return VendorShareSeries{
		Points:  points,
		Vendors: vendorRows,
		Buckets: len(sortedBuckets),
	}
}

func buildRankingMovers(models []RankedModel) ([]RankingMover, []RankingMover) {
	movers := make([]RankingMover, 0)
	droppers := make([]RankingMover, 0)
	for _, item := range models {
		if item.PreviousRank == nil {
			continue
		}
		delta := *item.PreviousRank - item.Rank
		if delta == 0 {
			continue
		}
		row := RankingMover{
			ModelName:   item.ModelName,
			Vendor:      item.Vendor,
			VendorIcon:  item.VendorIcon,
			RankDelta:   delta,
			CurrentRank: item.Rank,
			GrowthPct:   item.GrowthPct,
		}
		if delta > 0 {
			movers = append(movers, row)
		} else {
			droppers = append(droppers, row)
		}
	}
	sort.Slice(movers, func(i, j int) bool {
		if movers[i].RankDelta == movers[j].RankDelta {
			return movers[i].GrowthPct > movers[j].GrowthPct
		}
		return movers[i].RankDelta > movers[j].RankDelta
	})
	sort.Slice(droppers, func(i, j int) bool {
		if droppers[i].RankDelta == droppers[j].RankDelta {
			return droppers[i].GrowthPct < droppers[j].GrowthPct
		}
		return droppers[i].RankDelta < droppers[j].RankDelta
	})
	return limitRankingMovers(movers, rankingMoverLimit), limitRankingMovers(droppers, rankingMoverLimit)
}

func sortedRankingBuckets(bucketSet map[int64]struct{}) []int64 {
	buckets := make([]int64, 0, len(bucketSet))
	for bucket := range bucketSet {
		buckets = append(buckets, bucket)
	}
	slices.Sort(buckets)
	return buckets
}

func rankingBucketTs(bucket int64) string {
	return time.Unix(bucket, 0).UTC().Format(time.RFC3339)
}

func rankingBucketLabel(bucket int64, config rankingPeriodConfig) string {
	return time.Unix(bucket, 0).Format(config.labelLayout)
}

func rankingRankMap(totals []model.RankingQuotaTotal) map[string]int {
	ranks := make(map[string]int, len(totals))
	for idx, item := range totals {
		ranks[item.ModelName] = idx + 1
	}
	return ranks
}

func rankingTokenMap(totals []model.RankingQuotaTotal) map[string]int64 {
	tokens := make(map[string]int64, len(totals))
	for _, item := range totals {
		tokens[item.ModelName] = item.TotalTokens
	}
	return tokens
}

func sumRankingTokens(totals []model.RankingQuotaTotal) int64 {
	total := int64(0)
	for _, item := range totals {
		total += item.TotalTokens
	}
	return total
}

func rankingShare(value int64, total int64) float64 {
	if total <= 0 || value <= 0 {
		return 0
	}
	return roundRankingFloat(float64(value) / float64(total))
}

func rankingGrowthPct(current int64, previous int64) float64 {
	if previous <= 0 {
		if current > 0 {
			return 100
		}
		return 0
	}
	return roundRankingFloat((float64(current-previous) / float64(previous)) * 100)
}

func roundRankingFloat(value float64) float64 {
	return math.Round(value*10000) / 10000
}

func limitRankedModels(rows []RankedModel, limit int) []RankedModel {
	if limit <= 0 || len(rows) <= limit {
		return rows
	}
	return rows[:limit]
}

func limitRankingMovers(rows []RankingMover, limit int) []RankingMover {
	if limit <= 0 || len(rows) <= limit {
		return rows
	}
	return rows[:limit]
}

func minInt(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

// foldRankingAliasTotals counts usage logged under a name that is now an alias
// towards the name it points at, so that renaming a model keeps its history.
func foldRankingAliasTotals(totals []model.RankingQuotaTotal) []model.RankingQuotaTotal {
	merged := make([]model.RankingQuotaTotal, 0, len(totals))
	index := make(map[string]int, len(totals))
	folded := false
	for _, item := range totals {
		name := naming_setting.ResolveAlias(item.ModelName)
		folded = folded || name != item.ModelName
		if at, ok := index[name]; ok {
			merged[at].TotalTokens += item.TotalTokens
			merged[at].TotalRequests += item.TotalRequests
			continue
		}
		index[name] = len(merged)
		merged = append(merged, model.RankingQuotaTotal{ModelName: name, TotalTokens: item.TotalTokens, TotalRequests: item.TotalRequests})
	}
	if folded {
		sort.SliceStable(merged, func(i, j int) bool { return merged[i].TotalTokens > merged[j].TotalTokens })
	}
	return merged
}

// foldRankingAliasBuckets is foldRankingAliasTotals for the history buckets.
func foldRankingAliasBuckets(buckets []model.RankingQuotaBucket) []model.RankingQuotaBucket {
	type key struct {
		name   string
		bucket int64
	}
	merged := make([]model.RankingQuotaBucket, 0, len(buckets))
	index := make(map[key]int, len(buckets))
	for _, item := range buckets {
		k := key{naming_setting.ResolveAlias(item.ModelName), item.Bucket}
		if at, ok := index[k]; ok {
			merged[at].Tokens += item.Tokens
			merged[at].Requests += item.Requests
			continue
		}
		index[k] = len(merged)
		merged = append(merged, model.RankingQuotaBucket{ModelName: k.name, Bucket: item.Bucket, Tokens: item.Tokens, Requests: item.Requests})
	}
	return merged
}
