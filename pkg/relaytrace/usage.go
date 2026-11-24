package relaytrace

import (
	"math"
	"strings"

	"github.com/tidwall/gjson"
)

// Operational counters above this bound are unavailable, not usable token
// facts. This also keeps bounded report sums within int64 across 10,000 rows.
const MaxReportedTokens int64 = 1000000000000

// ReportedUsage contains upstream facts only. Missing fields remain nil;
// estimates used for customer billing must never become procurement facts.
type ReportedUsage struct {
	InputTokens      *int64 `json:"input_tokens"`
	OutputTokens     *int64 `json:"output_tokens"`
	ReasoningTokens  *int64 `json:"reasoning_tokens"`
	CacheReadTokens  *int64 `json:"cache_read_tokens"`
	CacheWriteTokens *int64 `json:"cache_write_tokens"`
	InputSemantic    string `json:"input_semantic"`
	Source           string `json:"source"`
	CostAmount       string `json:"cost_amount,omitempty"`
	CostCurrency     string `json:"cost_currency,omitempty"`
}

func (a *Attempt) ObserveUsage(data string) {
	if a == nil {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	observeReportedUsage(data, &a.summary)
}

func reportedToken(value gjson.Result) *int64 {
	if value.Type != gjson.Number {
		return nil
	}
	n := value.Float()
	if n < 0 || n > float64(MaxReportedTokens) || math.IsNaN(n) || math.IsInf(n, 0) || math.Trunc(n) != n {
		return nil
	}
	count := int64(n)
	return &count
}

func observeReportedUsage(data string, summary *Summary) {
	if !gjson.Valid(data) {
		return
	}
	root := gjson.Parse(data)
	u := root.Get("usage")
	if !u.IsObject() {
		u = root.Get("response.usage")
	}
	if !u.IsObject() {
		u = root.Get("message.usage")
	}
	gemini := false
	if !u.IsObject() {
		u = root.Get("usageMetadata")
		gemini = u.IsObject()
	}
	if !u.IsObject() {
		return
	}
	current := ReportedUsage{InputSemantic: "inclusive", Source: "upstream"}
	if summary.Usage != nil {
		current = *summary.Usage
	}
	input, output := u.Get("prompt_tokens"), u.Get("completion_tokens")
	read, write := u.Get("prompt_tokens_details.cached_tokens"), u.Get("prompt_tokens_details.cache_write_tokens")
	reasoning := u.Get("completion_tokens_details.reasoning_tokens")
	if u.Get("input_tokens").Exists() || u.Get("output_tokens").Exists() {
		input, output = u.Get("input_tokens"), u.Get("output_tokens")
		read, write = u.Get("input_tokens_details.cached_tokens"), u.Get("input_tokens_details.cache_write_tokens")
		reasoning = u.Get("output_tokens_details.reasoning_tokens")
	}
	if root.Get("type").Str == "message_start" || root.Get("type").Str == "message_delta" || strings.Contains(summary.Format, "claude") || u.Get("cache_read_input_tokens").Exists() || u.Get("cache_creation_input_tokens").Exists() {
		current.InputSemantic = "additive"
		input, output = u.Get("input_tokens"), u.Get("output_tokens")
		read, write = u.Get("cache_read_input_tokens"), u.Get("cache_creation_input_tokens")
	}
	if u.Get("prompt_cache_hit_tokens").Exists() {
		read = u.Get("prompt_cache_hit_tokens")
	}
	if gemini {
		input, output = u.Get("promptTokenCount"), u.Get("candidatesTokenCount")
		read, reasoning = u.Get("cachedContentTokenCount"), u.Get("thoughtsTokenCount")
	}
	for _, field := range []struct {
		value gjson.Result
		dest  **int64
	}{
		{input, &current.InputTokens}, {output, &current.OutputTokens},
		{reasoning, &current.ReasoningTokens}, {read, &current.CacheReadTokens}, {write, &current.CacheWriteTokens},
	} {
		if value := reportedToken(field.value); value != nil && (*field.dest == nil || *value >= **field.dest) {
			*field.dest = value
		}
	}
	if gemini && current.OutputTokens != nil {
		// Gemini candidates exclude thoughts; OpenAI output already includes them.
		if candidates := reportedToken(output); candidates != nil {
			total := *candidates
			if current.ReasoningTokens != nil {
				total += *current.ReasoningTokens
			}
			current.OutputTokens = &total
		}
	}
	// A bare usage.cost has no guaranteed currency and is not a verified bill.
	if amount, currency := u.Get("cost"), u.Get("cost_currency"); amount.Type == gjson.Number && len(currency.Str) == 3 && strings.Trim(currency.Str, "ABCDEFGHIJKLMNOPQRSTUVWXYZ") == "" {
		if value := amount.Float(); value >= 0 && value <= 1e15 && !math.IsNaN(value) && !math.IsInf(value, 0) {
			current.CostAmount, current.CostCurrency = amount.Raw, currency.Str
		}
	}
	if current.InputTokens != nil || current.OutputTokens != nil || current.CacheReadTokens != nil || current.CacheWriteTokens != nil || current.CostAmount != "" {
		summary.Usage = &current
	}
}
