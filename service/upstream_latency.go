package service

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"math/rand/v2"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/relaylatency"
	"github.com/QuantumNous/new-api/pkg/relaytrace"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

type UpstreamLatencySettings struct {
	EnforceScopes    []UpstreamLatencyScope `json:"enforce_scopes,omitempty"`
	Enabled          bool                   `json:"enabled"`
	Enforce          bool                   `json:"enforce"`
	Quantile         float64                `json:"quantile"`
	FallbackSeconds  int                    `json:"fallback_seconds"`
	MinSeconds       int                    `json:"min_seconds"`
	MaxSeconds       int                    `json:"max_seconds"`
	ReferencePercent int                    `json:"reference_percent"`
	ReferenceSeconds int                    `json:"reference_seconds"`
	MinimumSamples   int                    `json:"minimum_samples"`
	KeepAliveSeconds int                    `json:"keepalive_seconds"`
}

type UpstreamLatencyScope struct {
	ChannelID     int    `json:"channel_id"`
	UpstreamModel string `json:"upstream_model"`
}

var defaultUpstreamLatencySettings = UpstreamLatencySettings{Quantile: .99, FallbackSeconds: 60, MinSeconds: 10, MaxSeconds: 600, ReferencePercent: 1, ReferenceSeconds: 600, MinimumSamples: 500, KeepAliveSeconds: 10}
var upstreamLatencySettings = defaultUpstreamLatencySettings

type upstreamLatencyFunction struct {
	Channel       int                   `json:"channel_id"`
	UpstreamModel string                `json:"upstream_model"`
	Cutoff        int64                 `json:"cutoff"`
	Function      relaylatency.Function `json:"function"`
}

var upstreamLatencyFunctions atomic.Pointer[map[string]upstreamLatencyFunction]
var upstreamLatencyReports atomic.Pointer[[]model.UpstreamLatencyFunction]
var upstreamLatencyQueue = make(chan []model.UpstreamLatencyObservation, 512)
var upstreamLatencyDropped atomic.Uint64
var upstreamLatencyFailed atomic.Uint64
var upstreamLatencyWorkers sync.WaitGroup

// StartUpstreamLatency starts content-free observation writes and daily fitting.
// It is explicitly opt-in; enforcement can stay off during offline validation.
func StartUpstreamLatency(ctx context.Context) error {
	cfg := defaultUpstreamLatencySettings
	if value := os.Getenv("RELAY_LATENCY_ENFORCE_SCOPES"); value != "" {
		if common.UnmarshalJsonStr(value, &cfg.EnforceScopes) != nil || len(cfg.EnforceScopes) > 2000 {
			return fmt.Errorf("invalid RELAY_LATENCY_ENFORCE_SCOPES")
		}
		for _, scope := range cfg.EnforceScopes {
			if scope.ChannelID <= 0 || scope.UpstreamModel == "" || len(scope.UpstreamModel) > 200 {
				return fmt.Errorf("invalid RELAY_LATENCY_ENFORCE_SCOPES entry")
			}
		}
	}
	for _, field := range []struct {
		name   string
		target *bool
	}{{"RELAY_LATENCY_ENABLED", &cfg.Enabled}, {"RELAY_LATENCY_ENFORCE", &cfg.Enforce}} {
		if value := os.Getenv(field.name); value != "" {
			v, err := strconv.ParseBool(value)
			if err != nil {
				return fmt.Errorf("invalid %s", field.name)
			}
			*field.target = v
		}
	}
	for _, field := range []struct {
		name      string
		target    *int
		low, high int
	}{
		{"RELAY_LATENCY_FALLBACK_SECONDS", &cfg.FallbackSeconds, 1, 3600},
		{"RELAY_LATENCY_MIN_SECONDS", &cfg.MinSeconds, 1, 3600},
		{"RELAY_LATENCY_MAX_SECONDS", &cfg.MaxSeconds, 1, 7200},
		{"RELAY_LATENCY_REFERENCE_PERCENT", &cfg.ReferencePercent, 0, 10},
		{"RELAY_LATENCY_REFERENCE_SECONDS", &cfg.ReferenceSeconds, 1, 7200},
		{"RELAY_LATENCY_MINIMUM_SAMPLES", &cfg.MinimumSamples, 100, 20000},
		{"RELAY_LATENCY_KEEPALIVE_SECONDS", &cfg.KeepAliveSeconds, 0, 60},
	} {
		if value := os.Getenv(field.name); value != "" {
			v, err := strconv.Atoi(value)
			if err != nil || v < field.low || v > field.high {
				return fmt.Errorf("invalid %s", field.name)
			}
			*field.target = v
		}
	}
	if cfg.MinSeconds > cfg.FallbackSeconds || cfg.FallbackSeconds > cfg.MaxSeconds || cfg.ReferenceSeconds < cfg.MaxSeconds || cfg.Enforce && !cfg.Enabled {
		return fmt.Errorf("inconsistent adaptive latency settings")
	}
	upstreamLatencySettings = cfg
	if !cfg.Enabled {
		return nil
	}
	if err := reloadUpstreamLatencyFunctions(ctx, time.Now()); err != nil {
		return err
	}
	upstreamLatencyWorkers.Go(func() { writeUpstreamLatencyObservations(ctx) })
	upstreamLatencyWorkers.Go(func() { runUpstreamLatencyTraining(ctx) })
	return nil
}

func WaitUpstreamLatency() { upstreamLatencyWorkers.Wait() }

// SelectUpstreamLatency is keyed only by the selected channel and final mapped
// model. A different public alias or failover position cannot create a new fit.
func SelectUpstreamLatency(channel int, upstream, effort string, tokens int, requestID string) *relaytrace.LatencyBudget {
	cfg := upstreamLatencySettings
	if !cfg.Enabled || channel <= 0 || upstream == "" || len(upstream) > 200 {
		return nil
	}
	key := model.UpstreamLatencyKey(channel, upstream)
	b := &relaytrace.LatencyBudget{Seconds: float64(cfg.FallbackSeconds), Enforce: cfg.Enforce, Source: "fallback", KeepAliveSeconds: cfg.KeepAliveSeconds}
	if len(cfg.EnforceScopes) > 0 {
		b.Enforce = false
		for _, scope := range cfg.EnforceScopes {
			if scope.ChannelID == channel && scope.UpstreamModel == upstream {
				b.Enforce = cfg.Enforce
				break
			}
		}
	}
	if functions := upstreamLatencyFunctions.Load(); functions != nil {
		if fit, ok := (*functions)[key]; ok && fit.Channel == channel && fit.UpstreamModel == upstream && fit.Cutoff >= time.Now().AddDate(0, 0, -8).Unix() {
			if seconds, ok := fit.Function.Predict(effort, tokens); ok {
				b.Seconds = seconds
				b.Source = "fitted"
				b.Version = fit.Cutoff
			}
		}
	}
	b.Seconds = max(float64(cfg.MinSeconds), min(float64(cfg.MaxSeconds), b.Seconds))
	// Selection happens before the outcome is known, independently of aliases,
	// effort or eventual latency. Reference requests use the same upstream work,
	// not a detached duplicate, and remain subject to cancellation and capacity.
	hash := sha256.Sum256([]byte(requestID + "\x00" + key))
	if requestID != "" && binary.BigEndian.Uint64(hash[:8])%100 < uint64(cfg.ReferencePercent) {
		b.Reference = true
		b.Seconds = float64(cfg.ReferenceSeconds)
	}
	return b
}

// Context estimation never fetches media or changes the billing token count.
// Missing multimodal estimates use the fixed fallback, not an invented zero.
func UpstreamLatencyInputTokens(info *relaycommon.RelayInfo) int {
	if tokens := info.GetEstimatePromptTokens(); tokens > 0 {
		return tokens
	}
	if !upstreamLatencySettings.Enabled || info.Request == nil {
		return 0
	}
	meta := info.Request.GetTokenCountMeta()
	if meta == nil || len(meta.Files) > 0 {
		return 0
	}
	tokens := CountTextToken(meta.CombineText, info.UpstreamModelName)
	if info.GetFinalRequestRelayFormat() == "openai" {
		tokens += meta.ToolsCount*8 + meta.MessagesCount*3 + meta.NameCount*3 + 3
	}
	return max(1, tokens)
}

// UpstreamLatencyObservation retains exact first-output times even when the
// attempt subsequently fails. Hard upstream errors are not censored successes.
func UpstreamLatencyObservation(requestID string, s relaytrace.Summary, observedAt int64) (model.UpstreamLatencyObservation, bool) {
	if requestID == "" || !s.Streaming || s.Scope.Channel <= 0 || s.Scope.Model == "" || len(s.Scope.Model) > 200 || s.InputTokens == nil || *s.InputTokens <= 0 || s.FirstUnclassifiedMS != nil || s.FinishedAt == 0 && s.UnknownEvents > 0 {
		return model.UpstreamLatencyObservation{}, false
	}
	var first *int64
	for _, ms := range []*int64{s.FirstContentMS, s.FirstReasoningMS} {
		if ms != nil && (first == nil || *ms < *first) {
			first = ms
		}
	}
	elapsed, censored, reason := s.DurationMS, false, "observed"
	if first != nil {
		elapsed = max(1, *first)
	} else {
		if s.End != "timeout" && s.End != "client_cancelled" && s.End != "client_gone" {
			return model.UpstreamLatencyObservation{}, false
		}
		if s.Status != 0 && (s.Status < 200 || s.Status >= 300) {
			return model.UpstreamLatencyObservation{}, false
		}
		censored, reason = true, s.End
	}
	if elapsed <= 0 || elapsed > 86400000 {
		return model.UpstreamLatencyObservation{}, false
	}
	key := model.UpstreamLatencyKey(s.Scope.Channel, s.Scope.Model)
	id := fmt.Sprintf("%x", sha256.Sum256(fmt.Appendf(nil, "%s\x00%d\x00%s", requestID, s.Attempt, key)))
	if s.FinishedAt > 0 {
		observedAt = s.FinishedAt
	}
	reference := s.LatencyBudget != nil && s.LatencyBudget.Reference
	return model.UpstreamLatencyObservation{ID: id, FitKey: key, ObservedAt: observedAt, ChannelID: s.Scope.Channel, UpstreamModel: s.Scope.Model, Effort: s.Effort, InputTokens: *s.InputTokens, ElapsedMS: elapsed, Censored: censored, Reason: reason, Reference: reference}, true
}

func RecordUpstreamLatency(requestID string, info *relaycommon.RelayInfo) {
	if !upstreamLatencySettings.Enabled || info == nil {
		return
	}
	var rows []model.UpstreamLatencyObservation
	for _, trace := range info.TransportAttempts {
		if trace != nil {
			if row, ok := UpstreamLatencyObservation(requestID, trace.Snapshot(), time.Now().Unix()); ok {
				rows = append(rows, row)
			}
		}
	}
	if len(rows) == 0 {
		return
	}
	select {
	case upstreamLatencyQueue <- rows:
	default:
		upstreamLatencyDropped.Add(uint64(len(rows)))
	}
}

func writeUpstreamLatencyObservations(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case rows := <-upstreamLatencyQueue:
			writeCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
			err := model.SaveUpstreamLatencyObservations(writeCtx, rows)
			cancel()
			if err != nil {
				upstreamLatencyFailed.Add(uint64(len(rows)))
				logger.LogWarn(ctx, "upstream latency observation write failed")
			}
		}
	}
}

func reloadUpstreamLatencyFunctions(ctx context.Context, now time.Time) error {
	rows, err := model.LoadUpstreamLatencyFunctions(ctx, now.AddDate(0, 0, -8).Unix())
	if err != nil {
		return err
	}
	functions := make(map[string]upstreamLatencyFunction)
	var reports []model.UpstreamLatencyFunction
	seen := make(map[string]bool)
	for _, row := range rows {
		if !seen[row.FitKey] {
			reports = append(reports, row)
			seen[row.FitKey] = true
		}
		if _, ok := functions[row.FitKey]; ok || row.FitKey != model.UpstreamLatencyKey(row.ChannelID, row.UpstreamModel) {
			continue
		}
		var f relaylatency.Function
		if common.UnmarshalJsonStr(row.Parameters, &f) != nil || f.Version != relaylatency.Version || f.TailScale <= 0 {
			continue
		}
		functions[row.FitKey] = upstreamLatencyFunction{Channel: row.ChannelID, UpstreamModel: row.UpstreamModel, Cutoff: row.Cutoff, Function: f}
	}
	upstreamLatencyFunctions.Store(&functions)
	upstreamLatencyReports.Store(&reports)
	return nil
}

// NextUpstreamLatencyMidnight is independent of the machine's local timezone.
func NextUpstreamLatencyMidnight(now time.Time) time.Time {
	local := now.In(time.FixedZone("Asia/Shanghai", 8*60*60))
	return time.Date(local.Year(), local.Month(), local.Day()+1, 0, 0, 0, 0, local.Location())
}

func runUpstreamLatencyTraining(ctx context.Context) {
	cutoff := NextUpstreamLatencyMidnight(time.Now()).AddDate(0, 0, -1)
	if common.IsMasterNode {
		jobCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
		if err := TrainUpstreamLatency(jobCtx, cutoff, true); err != nil {
			logger.LogWarn(ctx, "upstream latency training did not complete")
		}
		cancel()
	}
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	next := time.NewTimer(time.Until(NextUpstreamLatencyMidnight(time.Now())))
	defer next.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			loadCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			_ = reloadUpstreamLatencyFunctions(loadCtx, time.Now())
			cancel()
		case <-next.C:
			if common.IsMasterNode {
				jobCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
				if err := TrainUpstreamLatency(jobCtx, NextUpstreamLatencyMidnight(time.Now()).AddDate(0, 0, -1), true); err != nil {
					logger.LogWarn(ctx, "upstream latency nightly fit failed; retaining previous functions")
				}
				cancel()
			}
			next.Reset(time.Until(NextUpstreamLatencyMidnight(time.Now())))
		}
	}
}

// TrainUpstreamLatency uses the seven days preceding a fixed midnight cutoff.
// Existing versions are immutable; repeated/cross-instance runs are idempotent.
func TrainUpstreamLatency(ctx context.Context, cutoff time.Time, importHistory bool) error {
	if importHistory {
		if err := importUpstreamLatencyHistory(ctx, cutoff.AddDate(0, 0, -7).Unix(), cutoff.Unix()); err != nil {
			return err
		}
	}
	keys, err := model.UpstreamLatencyTrainingKeys(ctx, cutoff.AddDate(0, 0, -7).Unix(), cutoff.Unix())
	if err != nil {
		return err
	}
	for _, key := range keys {
		if err := ctx.Err(); err != nil {
			return err
		}
		var samples []relaylatency.Sample
		seen := 0
		seed := sha256.Sum256([]byte(key.FitKey))
		random := rand.New(rand.NewPCG(binary.BigEndian.Uint64(seed[:8]), uint64(cutoff.Unix())))
		err := model.ReadUpstreamLatencySamples(ctx, key.FitKey, cutoff.AddDate(0, 0, -7).Unix(), cutoff.Unix(), func(rows []model.UpstreamLatencyObservation) {
			for _, r := range rows {
				seen++
				s := relaylatency.Sample{At: r.ObservedAt, Effort: r.Effort, InputTokens: r.InputTokens, Milliseconds: r.ElapsedMS, Censored: r.Censored}
				if len(samples) < 20000 {
					samples = append(samples, s)
				} else if index := random.IntN(seen); index < len(samples) {
					samples[index] = s
				}
			}
		})
		if err != nil {
			return err
		}
		f, err := relaylatency.Fit(samples, upstreamLatencySettings.Quantile, upstreamLatencySettings.MinimumSamples)
		if err != nil {
			if writeErr := model.RecordUpstreamLatencyFitRejection(ctx, key.ChannelID, key.UpstreamModel, cutoff.Unix(), err.Error()); writeErr != nil {
				return writeErr
			}
			continue
		}
		if err := model.PublishUpstreamLatencyFunction(ctx, key.ChannelID, key.UpstreamModel, cutoff.Unix(), f); err != nil {
			return err
		}
	}
	for _, table := range []any{&model.UpstreamLatencyObservation{}, &model.UpstreamLatencyFunction{}} {
		column := "observed_at"
		if _, ok := table.(*model.UpstreamLatencyFunction); ok {
			column = "cutoff"
		}
		// Indexed, bounded batches avoid a long retention transaction.
		for {
			var ids []string
			if column == "observed_at" {
				if err := model.DB.WithContext(ctx).Model(table).Where("observed_at < ?", cutoff.AddDate(0, 0, -8).Unix()).Limit(500).Pluck("id", &ids).Error; err != nil {
					return err
				}
				if len(ids) == 0 {
					break
				}
				if err := model.DB.WithContext(ctx).Where("id IN ?", ids).Delete(table).Error; err != nil {
					return err
				}
			} else {
				if err := model.DB.WithContext(ctx).Where("cutoff < ?", cutoff.AddDate(0, 0, -14).Unix()).Delete(table).Error; err != nil {
					return err
				}
				break
			}
		}
	}
	return reloadUpstreamLatencyFunctions(ctx, time.Now())
}

func importUpstreamLatencyHistory(ctx context.Context, start, end int64) error {
	var last int64
	var offset int
	clickHouse := common.UsingLogDatabase(common.DatabaseTypeClickHouse)
	for {
		var logs []struct {
			ID        int64
			RequestID string
			CreatedAt int64
			Other     string
		}
		query := model.LOG_DB.WithContext(ctx).Model(&model.Log{}).Select("id, request_id, created_at, other").Where("created_at >= ? AND created_at < ? AND type IN ?", start, end, []int{model.LogTypeConsume, model.LogTypeError}).Limit(250)
		if clickHouse {
			// ClickHouse log IDs default to zero; unlike the primary SQL
			// engines they cannot be used as a unique pagination cursor.
			// The cutoff freezes the historical window; repeated imports are
			// idempotent and include late-arriving records on the next run.
			query = query.Order("created_at, request_id, id").Offset(offset)
		} else {
			query = query.Where("id > ?", last).Order("id")
		}
		if err := query.Find(&logs).Error; err != nil {
			return err
		}
		if len(logs) == 0 {
			return nil
		}
		offset += len(logs)
		var observations []model.UpstreamLatencyObservation
		for _, entry := range logs {
			last = max(last, entry.ID)
			if len(entry.Other) > 65536 {
				continue
			}
			var other struct {
				Admin struct {
					Diagnostics struct {
						Attempts []relaytrace.Summary `json:"attempts"`
					} `json:"relay_diagnostics"`
				} `json:"admin_info"`
			}
			if common.UnmarshalJsonStr(entry.Other, &other) != nil {
				continue
			}
			for _, s := range other.Admin.Diagnostics.Attempts {
				if row, ok := UpstreamLatencyObservation(entry.RequestID, s, entry.CreatedAt); ok {
					observations = append(observations, row)
				}
			}
		}
		if err := model.SaveUpstreamLatencyObservations(ctx, observations); err != nil {
			return err
		}
	}
}

func UpstreamLatencyStatus() map[string]any {
	functions := 0
	if current := upstreamLatencyFunctions.Load(); current != nil {
		functions = len(*current)
	}
	var reports any = []model.UpstreamLatencyFunction{}
	if current := upstreamLatencyReports.Load(); current != nil {
		reports = *current
	}
	return map[string]any{"settings": upstreamLatencySettings, "functions": functions, "latest_fits": reports, "queued": len(upstreamLatencyQueue), "dropped": upstreamLatencyDropped.Load(), "failed": upstreamLatencyFailed.Load(), "timezone": "Asia/Shanghai"}
}
