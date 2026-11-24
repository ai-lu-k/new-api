package relayobs

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/pkg/relaytrace"
	"github.com/shopspring/decimal"
)

// CostProfile is an explicit procurement price, never a customer billing ratio.
// Decimal strings preserve a reported zero and avoid binary floating arithmetic.
type CostProfile struct {
	ChannelID            int    `json:"channel_id"`
	UpstreamModel        string `json:"upstream_model"`
	Currency             string `json:"currency"`
	InputPerMillion      string `json:"input_per_million"`
	OutputPerMillion     string `json:"output_per_million"`
	CacheReadPerMillion  string `json:"cache_read_per_million,omitempty"`
	CacheWritePerMillion string `json:"cache_write_per_million,omitempty"`
}

func (p CostProfile) Validate() error {
	if p.ChannelID <= 0 || p.UpstreamModel == "" || len(p.UpstreamModel) > 200 || len(p.Currency) != 3 || strings.Trim(p.Currency, "ABCDEFGHIJKLMNOPQRSTUVWXYZ") != "" {
		return fmt.Errorf("invalid procurement profile identity or currency")
	}
	for i, value := range []string{p.InputPerMillion, p.OutputPerMillion, p.CacheReadPerMillion, p.CacheWritePerMillion} {
		if i > 1 && value == "" {
			continue
		}
		if len(value) > 40 {
			return fmt.Errorf("invalid procurement rate")
		}
		rate, err := decimal.NewFromString(value)
		if err != nil || rate.Exponent() < -18 || rate.Exponent() > 9 || rate.IsNegative() || rate.GreaterThan(decimal.NewFromInt(1000000000)) {
			return fmt.Errorf("invalid procurement rate")
		}
	}
	return nil
}

func ProcurementCost(usage *relaytrace.ReportedUsage, profile *CostProfile) Cost {
	unknown := Cost{Status: "unknown", Source: "unavailable", Reason: "upstream_cost_not_reported"}
	if usage != nil && usage.CostAmount != "" && len(usage.CostAmount) <= 40 && len(usage.CostCurrency) == 3 && strings.Trim(usage.CostCurrency, "ABCDEFGHIJKLMNOPQRSTUVWXYZ") == "" {
		amount, err := decimal.NewFromString(usage.CostAmount)
		if err == nil && amount.Exponent() >= -18 && amount.Exponent() <= 15 && !amount.IsNegative() && amount.LessThanOrEqual(decimal.NewFromInt(1000000000000000)) {
			value := amount.String()
			return Cost{Status: "reported", Amount: &value, Currency: usage.CostCurrency, Source: "upstream_usage"}
		}
	}
	if profile == nil {
		return unknown
	}
	if profile.Validate() != nil || usage == nil || usage.InputTokens == nil || usage.OutputTokens == nil {
		unknown.Reason = "usage_or_procurement_rate_unavailable"
		return unknown
	}
	for _, count := range []*int64{usage.InputTokens, usage.OutputTokens, usage.CacheReadTokens, usage.CacheWriteTokens} {
		if count != nil && (*count < 0 || *count > relaytrace.MaxReportedTokens) {
			unknown.Reason = "invalid_upstream_usage"
			return unknown
		}
	}
	inputRate, _ := decimal.NewFromString(profile.InputPerMillion)
	outputRate, _ := decimal.NewFromString(profile.OutputPerMillion)
	input := *usage.InputTokens
	cacheCost := decimal.Zero
	for _, cache := range []struct {
		count *int64
		rate  string
	}{
		{usage.CacheReadTokens, profile.CacheReadPerMillion},
		{usage.CacheWriteTokens, profile.CacheWritePerMillion},
	} {
		if cache.count == nil {
			if cache.rate != "" || usage.InputSemantic == "additive" {
				unknown.Reason = "cache_usage_unavailable"
				return unknown
			}
			continue
		}
		rate := inputRate
		if cache.rate != "" {
			rate, _ = decimal.NewFromString(cache.rate)
		}
		cacheCost = cacheCost.Add(rate.Mul(decimal.NewFromInt(*cache.count)))
		if usage.InputSemantic != "additive" {
			input -= *cache.count
		}
	}
	amount := inputRate.Mul(decimal.NewFromInt(max(0, input))).Add(cacheCost).
		Add(outputRate.Mul(decimal.NewFromInt(*usage.OutputTokens))).Div(decimal.NewFromInt(1000000)).String()
	snapshot := *profile
	return Cost{Status: "estimated", Amount: &amount, Currency: profile.Currency, Source: "configured_procurement_rates", RateSnapshot: &snapshot}
}
