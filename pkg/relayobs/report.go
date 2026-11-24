package relayobs

import (
	"cmp"
	"fmt"
	"slices"

	"github.com/shopspring/decimal"
)

type Average struct {
	Samples int64    `json:"samples"`
	Value   *float64 `json:"value"`
	sum     int64
}

func (a *Average) Add(value *int64) {
	if value == nil || *value < 0 {
		return
	}
	a.Samples++
	a.sum += *value
	mean := float64(a.sum) / float64(a.Samples)
	a.Value = &mean
}

type CurrencyCost struct {
	Currency  string `json:"currency"`
	Reported  string `json:"reported"`
	Estimated string `json:"estimated"`
}

type AttemptMetrics struct {
	Attempts            int64          `json:"attempts"`
	Successful          int64          `json:"successful"`
	Errors              int64          `json:"errors"`
	Timeouts            int64          `json:"timeouts"`
	Cancelled           int64          `json:"cancelled"`
	Incomplete          int64          `json:"incomplete"`
	WithOutput          int64          `json:"with_output"`
	ResponseBytes       int64          `json:"response_bytes"`
	RequestBytes        int64          `json:"request_bytes"`
	RequestBytesKnown   int64          `json:"request_bytes_known"`
	FirstReasoningMS    Average        `json:"first_reasoning_ms"`
	FirstContentMS      Average        `json:"first_content_ms"`
	OutputTokens        int64          `json:"output_tokens"`
	OutputUsageKnown    int64          `json:"output_usage_known"`
	OutputTPS           *float64       `json:"output_tps"`
	TPSObservedAttempts int64          `json:"tps_observed_attempts"`
	CacheObserved       int64          `json:"cache_observed_attempts"`
	CacheHitAttempts    int64          `json:"cache_hit_attempts"`
	CacheRequestHitRate *float64       `json:"cache_request_hit_rate"`
	CacheReadTokens     int64          `json:"cache_read_tokens"`
	CacheInputTokens    int64          `json:"cache_input_tokens"`
	CacheTokenHitRate   *float64       `json:"cache_token_hit_rate"`
	CachePairedAttempts int64          `json:"cache_paired_attempts"`
	UnknownCostAttempts int64          `json:"unknown_cost_attempts"`
	Costs               []CurrencyCost `json:"costs"`
	generationMS        int64
	generationTokens    int64
}

func (m *AttemptMetrics) Add(attempt Attempt) {
	m.Attempts++
	m.ResponseBytes += attempt.ResponseBytes
	if attempt.RequestBytes != nil {
		m.RequestBytesKnown++
		m.RequestBytes += *attempt.RequestBytes
	}
	switch attempt.Outcome {
	case "success":
		m.Successful++
	case "timeout":
		m.Timeouts++
	case "client_cancelled":
		m.Cancelled++
	case "incomplete":
		m.Incomplete++
	default:
		m.Errors++
	}
	if FirstOutput(attempt.FirstReasoningMS, attempt.FirstContentMS) != nil {
		m.WithOutput++
	}
	m.FirstReasoningMS.Add(attempt.FirstReasoningMS)
	m.FirstContentMS.Add(attempt.FirstContentMS)
	u := attempt.Usage
	if u != nil && u.OutputTokens != nil {
		m.OutputUsageKnown++
		m.OutputTokens += *u.OutputTokens
		if attempt.GenerationMS != nil && *attempt.GenerationMS > 0 {
			m.TPSObservedAttempts++
			m.generationMS += *attempt.GenerationMS
			m.generationTokens += *u.OutputTokens
			tps := float64(m.generationTokens) * 1000 / float64(m.generationMS)
			m.OutputTPS = &tps
		}
	}
	if u != nil && u.CacheReadTokens != nil {
		m.CacheObserved++
		if *u.CacheReadTokens > 0 {
			m.CacheHitAttempts++
		}
		rate := float64(m.CacheHitAttempts) / float64(m.CacheObserved)
		m.CacheRequestHitRate = &rate
		if input := InputTotal(u); input != nil && *input >= *u.CacheReadTokens {
			m.CachePairedAttempts++
			m.CacheInputTokens += *input
			m.CacheReadTokens += *u.CacheReadTokens
			if m.CacheInputTokens > 0 {
				rate := float64(m.CacheReadTokens) / float64(m.CacheInputTokens)
				m.CacheTokenHitRate = &rate
			}
		}
	}
	if attempt.Cost.Amount == nil || attempt.Cost.Status != "reported" && attempt.Cost.Status != "estimated" {
		m.UnknownCostAttempts++
		return
	}
	value, err := decimal.NewFromString(*attempt.Cost.Amount)
	if err != nil || value.IsNegative() {
		m.UnknownCostAttempts++
		return
	}
	index := -1
	for i := range m.Costs {
		if m.Costs[i].Currency == attempt.Cost.Currency {
			index = i
			break
		}
	}
	if index < 0 {
		m.Costs = append(m.Costs, CurrencyCost{Currency: attempt.Cost.Currency, Reported: "0", Estimated: "0"})
		index = len(m.Costs) - 1
	}
	destination := &m.Costs[index].Reported
	if attempt.Cost.Status == "estimated" {
		destination = &m.Costs[index].Estimated
	}
	previous, _ := decimal.NewFromString(*destination)
	*destination = previous.Add(value).String()
}

type RequestMetrics struct {
	Requests          int64          `json:"requests"`
	WithUpstream      int64          `json:"with_upstream"`
	WithOutput        int64          `json:"with_output"`
	Completed         int64          `json:"completed"`
	Failed            int64          `json:"failed"`
	Cancelled         int64          `json:"cancelled"`
	LocalRejected     int64          `json:"local_rejected"`
	RoutingErrors     int64          `json:"routing_errors"`
	CapacityRejected  int64          `json:"capacity_rejected"`
	DeliveryErrors    int64          `json:"delivery_errors"`
	Incomplete        int64          `json:"incomplete"`
	FailoverRequests  int64          `json:"failover_requests"`
	FailoverSaved     int64          `json:"failover_saved"`
	CapacitySkipped   int64          `json:"capacity_skipped"`
	CandidateChecks   int64          `json:"candidate_checks"`
	TruncatedRequests int64          `json:"truncated_requests"`
	DownstreamBytes   int64          `json:"downstream_bytes"`
	FirstReasoningMS  Average        `json:"first_reasoning_ms"`
	FirstContentMS    Average        `json:"first_content_ms"`
	DurationMS        Average        `json:"duration_ms"`
	Upstream          AttemptMetrics `json:"upstream"`
}

func (m *RequestMetrics) Add(request Request) {
	m.Requests++
	m.CandidateChecks += int64(len(request.Candidates))
	for _, candidate := range request.Candidates {
		if candidate.Result == "capacity_skipped" {
			m.CapacitySkipped++
		}
	}
	if request.Truncated {
		m.TruncatedRequests++
	}
	m.DownstreamBytes += request.DownstreamBytes
	m.FirstReasoningMS.Add(request.FirstReasoningMS)
	m.FirstContentMS.Add(request.FirstContentMS)
	m.DurationMS.Add(&request.DurationMS)
	if FirstOutput(request.FirstReasoningMS, request.FirstContentMS) != nil {
		m.WithOutput++
	}
	switch request.Outcome {
	case "success":
		m.Completed++
	case "client_cancelled":
		m.Cancelled++
	case "local_rejection":
		m.LocalRejected++
	case "routing_error":
		m.RoutingErrors++
	case "capacity_rejected":
		m.CapacityRejected++
	case "delivery_error":
		m.DeliveryErrors++
	case "incomplete":
		m.Incomplete++
	default:
		m.Failed++
	}
	if len(request.Attempts) > 0 {
		m.WithUpstream++
	}
	if len(request.Attempts) > 1 {
		m.FailoverRequests++
		if request.Outcome == "success" {
			m.FailoverSaved++
		}
	}
	for _, attempt := range request.Attempts {
		m.Upstream.Add(attempt)
	}
}

type ChannelMetrics struct {
	ChannelID     int            `json:"channel_id"`
	UpstreamModel string         `json:"upstream_model"`
	Metrics       AttemptMetrics `json:"metrics"`
}

type ModelMetrics struct {
	Model   string         `json:"model"`
	Metrics RequestMetrics `json:"metrics"`
}

type Report struct {
	Totals    RequestMetrics   `json:"totals"`
	ByChannel []ChannelMetrics `json:"by_channel"`
	ByModel   []ModelMetrics   `json:"by_model"`
	Chains    []ModelChain     `json:"chains"`
	// ChannelNames resolves hop channel ids to their operator-facing names so
	// the chain view can say which channel each hop actually was.
	ChannelNames map[int]string `json:"channel_names,omitempty"`
}

func Summarize(requests []Request) Report {
	report := Report{ByChannel: []ChannelMetrics{}, ByModel: []ModelMetrics{}}
	channels := make(map[string]*ChannelMetrics)
	models := make(map[string]*ModelMetrics)
	for _, request := range requests {
		report.Totals.Add(request)
		if models[request.Model] == nil {
			models[request.Model] = &ModelMetrics{Model: request.Model}
		}
		models[request.Model].Metrics.Add(request)
		for _, attempt := range request.Attempts {
			key := fmt.Sprintf("%d:%s", attempt.ChannelID, attempt.UpstreamModel)
			if channels[key] == nil {
				channels[key] = &ChannelMetrics{ChannelID: attempt.ChannelID, UpstreamModel: attempt.UpstreamModel}
			}
			channels[key].Metrics.Add(attempt)
		}
	}
	for _, channel := range channels {
		report.ByChannel = append(report.ByChannel, *channel)
	}
	for _, model := range models {
		report.ByModel = append(report.ByModel, *model)
	}
	slices.SortFunc(report.ByChannel, func(a, b ChannelMetrics) int {
		if a.ChannelID == b.ChannelID {
			return cmp.Compare(a.UpstreamModel, b.UpstreamModel)
		}
		return cmp.Compare(a.ChannelID, b.ChannelID)
	})
	slices.SortFunc(report.ByModel, func(a, b ModelMetrics) int { return cmp.Compare(a.Model, b.Model) })
	report.Chains = summarizeChains(requests)
	return report
}
