// Package relayobs defines content-free request and upstream-attempt observations.
package relayobs

import "github.com/QuantumNous/new-api/pkg/relaytrace"

const SchemaVersion = 1

type Cost struct {
	Status       string       `json:"status"`
	Amount       *string      `json:"amount"`
	Currency     string       `json:"currency,omitempty"`
	Source       string       `json:"source"`
	Reason       string       `json:"reason,omitempty"`
	RateSnapshot *CostProfile `json:"rate_snapshot,omitempty"`
}

type Candidate struct {
	ChannelID int    `json:"channel_id"`
	Group     string `json:"group"`
	Result    string `json:"result"`
}

type Attempt struct {
	Number                int                       `json:"number"`
	ChannelID             int                       `json:"channel_id"`
	UpstreamModel         string                    `json:"upstream_model"`
	UpstreamRequestID     string                    `json:"upstream_request_id,omitempty"`
	Format                string                    `json:"format"`
	Effort                string                    `json:"effort,omitempty"`
	ContextTokensEstimate *int                      `json:"context_tokens_estimate"`
	StartedAtMS           int64                     `json:"started_at_ms"`
	DurationMS            int64                     `json:"duration_ms"`
	FirstReasoningMS      *int64                    `json:"first_reasoning_ms"`
	FirstContentMS        *int64                    `json:"first_content_ms"`
	GenerationMS          *int64                    `json:"generation_ms"`
	OutputTPS             *float64                  `json:"output_tps"`
	ResponseBytes         int64                     `json:"response_bytes"`
	RequestBytes          *int64                    `json:"request_bytes"`
	Status                int                       `json:"status"`
	Outcome               string                    `json:"outcome"`
	ErrorCode             string                    `json:"error_code,omitempty"`
	ErrorSource           string                    `json:"error_source,omitempty"`
	IncompleteReason      string                    `json:"incomplete_reason,omitempty"`
	EndReason             string                    `json:"end_reason"`
	TimeoutPhase          string                    `json:"timeout_phase,omitempty"`
	Usage                 *relaytrace.ReportedUsage `json:"usage"`
	Cost                  Cost                      `json:"cost"`
}

type Request struct {
	SchemaVersion        int            `json:"schema_version"`
	RequestID            string         `json:"request_id"`
	StartedAtMS          int64          `json:"started_at_ms"`
	DurationMS           int64          `json:"duration_ms"`
	Model                string         `json:"model"`
	RoutingPolicyVersion *string        `json:"routing_policy_version"`
	Group                string         `json:"group"`
	Path                 string         `json:"path"`
	Format               string         `json:"format"`
	TrafficKind          string         `json:"traffic_kind"`
	Streaming            bool           `json:"streaming"`
	Outcome              string         `json:"outcome"`
	ErrorCode            string         `json:"error_code,omitempty"`
	FirstReasoningMS     *int64         `json:"first_reasoning_ms"`
	FirstContentMS       *int64         `json:"first_content_ms"`
	DownstreamBytes      int64          `json:"downstream_bytes"`
	Candidates           []Candidate    `json:"candidates"`
	Attempts             []Attempt      `json:"attempts"`
	Truncated            bool           `json:"truncated"`
	ProcurementCosts     []CurrencyCost `json:"procurement_costs"`
	UnknownCostAttempts  int64          `json:"unknown_cost_attempts"`
	CostComplete         bool           `json:"cost_complete"`
}

func FirstOutput(reasoning, content *int64) *int64 {
	if reasoning == nil {
		return content
	}
	if content == nil || *reasoning < *content {
		return reasoning
	}
	return content
}

// InputTotal normalizes Anthropic's additive cache input without counting
// OpenAI's inclusive cache tokens twice. Incomplete additive usage stays unknown.
func InputTotal(usage *relaytrace.ReportedUsage) *int64 {
	if usage == nil || usage.InputTokens == nil {
		return nil
	}
	total := *usage.InputTokens
	if usage.InputSemantic == "additive" {
		if usage.CacheReadTokens == nil || usage.CacheWriteTokens == nil {
			return nil
		}
		total += *usage.CacheReadTokens + *usage.CacheWriteTokens
	}
	return &total
}
