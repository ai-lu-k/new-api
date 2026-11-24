// Package relaytrace records bounded, content-free transport diagnostics.
package relaytrace

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
)

type Budgets struct {
	Headers   int    `json:"headers_seconds"`
	FirstByte int    `json:"first_byte_seconds"`
	Idle      int    `json:"idle_seconds"`
	Total     int    `json:"total_seconds"`
	Source    string `json:"source"`
}

type Rule struct {
	Channel   int    `json:"channel_id"`
	Model     string `json:"model"`
	Effort    string `json:"effort"`
	Headers   *int   `json:"headers_seconds"`
	FirstByte *int   `json:"first_byte_seconds"`
	Idle      *int   `json:"idle_seconds"`
	Total     *int   `json:"total_seconds"`
}

type Config struct {
	Enabled       bool   `json:"enabled"`
	MaxSeconds    int    `json:"max_seconds"`
	WindowSeconds int    `json:"window_seconds"`
	SamplePercent int    `json:"sample_percent"`
	Rules         []Rule `json:"rules"`
}

var configuration = Config{MaxSeconds: 3600, WindowSeconds: 600, SamplePercent: 25}

// Configure runs once at startup. Invalid operator rules fail startup instead of
// silently deploying a policy that differs from the one the operator requested.
func Configure() error {
	cfg := configuration
	var err error
	if value := os.Getenv("RELAY_PHASE_TIMEOUT_ENABLED"); value != "" {
		cfg.Enabled, err = strconv.ParseBool(value)
		if err != nil {
			return fmt.Errorf("invalid RELAY_PHASE_TIMEOUT_ENABLED")
		}
	}
	for _, field := range []struct {
		name      string
		target    *int
		low, high int
	}{
		{"RELAY_PHASE_TIMEOUT_MAX_SECONDS", &cfg.MaxSeconds, 1, 7200},
		{"RELAY_TRACE_WINDOW_SECONDS", &cfg.WindowSeconds, 1, 3600},
		{"RELAY_TRACE_SAMPLE_PERCENT", &cfg.SamplePercent, 0, 100},
	} {
		if value := os.Getenv(field.name); value != "" {
			n, parseErr := strconv.Atoi(value)
			if parseErr != nil || n < field.low || n > field.high {
				return fmt.Errorf("invalid %s", field.name)
			}
			*field.target = n
		}
	}
	if raw := os.Getenv("RELAY_TIMEOUT_RULES"); raw != "" {
		if len(raw) > 65536 || common.UnmarshalJsonStr(raw, &cfg.Rules) != nil {
			return fmt.Errorf("invalid RELAY_TIMEOUT_RULES")
		}
	}
	if err := cfg.Validate(); err != nil {
		return err
	}
	configuration = cfg
	return nil
}

func (c Config) Validate() error {
	if len(c.Rules) > 128 {
		return fmt.Errorf("at most 128 relay timeout rules are allowed")
	}
	for _, r := range c.Rules {
		if r.Channel < 0 || len(r.Model) > 200 || strings.ContainsAny(r.Model, "\r\n") || !validEffort(r.Effort) {
			return fmt.Errorf("invalid relay timeout rule selector")
		}
		for _, seconds := range []*int{r.Headers, r.FirstByte, r.Idle, r.Total} {
			if seconds != nil && (*seconds < 1 || *seconds > c.MaxSeconds) {
				return fmt.Errorf("relay timeout budgets must be between 1 and %d seconds", c.MaxSeconds)
			}
		}
	}
	return nil
}

func validEffort(e string) bool {
	switch e {
	case "", "none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra":
		return true
	}
	return false
}

func CurrentConfig() Config { return configuration }

// Select preserves global defaults until phase timeouts are explicitly enabled.
// Rules match exact final model / effective effort and use most-specific-wins;
// later rules win ties. No request body parsing or token recounting is needed.
func (c Config) Select(channel int, model, effort string) Budgets {
	b := Budgets{Headers: common.RelayResponseHeaderTimeout, FirstByte: 0, Idle: constant.StreamingTimeout, Total: common.RelayTimeout, Source: "global"}
	if !c.Enabled {
		return b
	}
	b.FirstByte = constant.StreamingTimeout
	multiplier := 1
	switch effort {
	case "high":
		multiplier = 2
	case "xhigh", "max", "ultra":
		multiplier = 3
	}
	b.Source = "reasoning_default"
	for _, target := range []*int{&b.Headers, &b.FirstByte, &b.Idle} {
		if *target <= 0 {
			*target = c.MaxSeconds
		} else {
			*target = min(c.MaxSeconds, min(c.MaxSeconds, *target)*multiplier)
		}
	}
	if b.Total <= 0 {
		b.Total = c.MaxSeconds
	} else {
		b.Total = min(c.MaxSeconds, min(c.MaxSeconds, b.Total)*multiplier)
	}
	defaults := b
	best := -1
	for i, r := range c.Rules {
		if r.Channel != 0 && r.Channel != channel || r.Model != "" && r.Model != model || r.Effort != "" && r.Effort != effort {
			continue
		}
		score := 0
		if r.Channel != 0 {
			score++
		}
		if r.Model != "" {
			score++
		}
		if r.Effort != "" {
			score++
		}
		if score < best {
			continue
		}
		best = score
		// Every matching rule replaces the complete budget, rather than inheriting
		// fields from a less-specific rule encountered earlier.
		selected := defaults
		for j, target := range []*int{&selected.Headers, &selected.FirstByte, &selected.Idle, &selected.Total} {
			source := []*int{r.Headers, r.FirstByte, r.Idle, r.Total}[j]
			if source != nil {
				*target = *source
			}
		}
		selected.Source = fmt.Sprintf("rule:%d", i+1)
		b = selected
	}
	return b
}

func Seconds(n int) time.Duration { return time.Duration(n) * time.Second }
