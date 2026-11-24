package relaytrace

import (
	"context"
	"errors"
	"github.com/go-redis/redis/v8"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestReasoningBudgetSelectionPreservesDefaultsAndSpecificity(t *testing.T) {
	oldHeader, oldTotal, oldIdle := common.RelayResponseHeaderTimeout, common.RelayTimeout, constant.StreamingTimeout
	common.RelayResponseHeaderTimeout = 120
	common.RelayTimeout = 600
	constant.StreamingTimeout = 60
	t.Cleanup(func() {
		common.RelayResponseHeaderTimeout = oldHeader
		common.RelayTimeout = oldTotal
		constant.StreamingTimeout = oldIdle
	})
	headers := 900
	idle := 420
	cfg := Config{Enabled: true, MaxSeconds: 1800, Rules: []Rule{
		{Model: "model", Headers: &headers},
		{Channel: 18, Model: "model", Effort: "max", Idle: &idle},
	}}
	require.NoError(t, cfg.Validate())
	for _, tc := range []struct {
		effort string
		want   Budgets
	}{
		{"low", Budgets{120, 60, 60, 600, "reasoning_default"}},
		{"high", Budgets{240, 120, 120, 1200, "reasoning_default"}},
		{"max", Budgets{360, 180, 180, 1800, "reasoning_default"}},
	} {
		assert.Equal(t, tc.want, cfg.Select(1, "other", tc.effort))
	}
	assert.Equal(t, Budgets{360, 180, 420, 1800, "rule:2"}, cfg.Select(18, "model", "max"), "specific rule inherits global reasoning defaults, not unrelated rule fields")
	cfg.Enabled = false
	assert.Equal(t, Budgets{120, 0, 60, 600, "global"}, cfg.Select(18, "model", "max"))
	cfg.Enabled = true
	cfg.Rules[0].Headers = new(int)
	require.Error(t, cfg.Validate(), "zero budgets cannot disable protection")
}

func TestHTTPPhasesDistinguishHeadersFirstByteIdleAndTotal(t *testing.T) {
	scope := Scope{18, "model", "/v1/responses"}
	for _, phase := range []string{"headers", "first_byte", "idle", "total", "client_cancelled"} {
		t.Run(phase, func(t *testing.T) {
			registry := NewRegistry()
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = io.Copy(io.Discard, r.Body)
				if phase == "headers" {
					<-r.Context().Done()
					return
				}
				w.Header().Set("Content-Type", "text/event-stream")
				w.WriteHeader(http.StatusOK)
				w.(http.Flusher).Flush()
				if phase == "idle" {
					_, _ = io.WriteString(w, ": heartbeat\n\n")
					w.(http.Flusher).Flush()
				}
				if phase == "total" {
					ticker := time.NewTicker(20 * time.Millisecond)
					defer ticker.Stop()
					for {
						select {
						case <-ticker.C:
							_, _ = io.WriteString(w, ": heartbeat\n\n")
							w.(http.Flusher).Flush()
						case <-r.Context().Done():
							return
						}
					}
				}
				<-r.Context().Done()
			}))
			defer server.Close()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			req, err := http.NewRequestWithContext(ctx, http.MethodPost, server.URL, strings.NewReader(`{"prompt":"must-not-be-logged"}`))
			require.NoError(t, err)
			budgets := Budgets{Headers: 1, FirstByte: 1, Idle: 1, Total: 4}
			if phase == "total" {
				budgets.Total = 1
				budgets.Idle = 3
				budgets.FirstByte = 3
			}
			a := NewAttempt(registry, Summary{Scope: scope, Budgets: budgets, Streaming: true}, "request", time.Now())
			req = a.Prepare(req, time.Now(), true)
			response, err := http.DefaultClient.Do(req)
			if phase == "headers" {
				require.Error(t, err)
				a.Finish("transport_error", err)
			} else {
				require.NoError(t, err)
				a.Headers(response, true)
				if phase == "client_cancelled" {
					cancel()
				}
				_, err = io.ReadAll(response.Body)
				require.Error(t, err)
				require.NoError(t, response.Body.Close())
			}
			summary := a.Snapshot()
			windows, _, _ := registry.Status(time.Now())
			if phase == "client_cancelled" {
				assert.Equal(t, "client_cancelled", summary.End)
				assert.Empty(t, windows)
				assert.Empty(t, summary.TimeoutPhase)
			} else {
				assert.Equal(t, phase, summary.TimeoutPhase)
				assert.Equal(t, "timeout", summary.End)
				require.Len(t, windows, 1)
			}
			if phase == "idle" || phase == "total" {
				require.NotNil(t, summary.FirstByteMS)
				assert.Greater(t, summary.Bytes, int64(0))
			} else {
				assert.Nil(t, summary.FirstByteMS)
			}
		})
	}
}

func TestRetryUsesOriginalTotalDeadline(t *testing.T) {
	a := NewAttempt(NewRegistry(), Summary{Budgets: Budgets{Total: 1}}, "request", time.Now())
	req := httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	req = a.Prepare(req, time.Now().Add(-2*time.Second), true)
	<-req.Context().Done()
	var timeout *TimeoutError
	require.True(t, errors.As(context.Cause(req.Context()), &timeout))
	assert.Equal(t, "total", timeout.Phase)
	a.Finish("transport_error", req.Context().Err())
}

func TestTraceSeparatesHeartbeatLifecycleContentAndReasoningWithoutPayloads(t *testing.T) {
	registry := NewRegistry()
	a := NewAttempt(registry, Summary{Scope: Scope{18, "model", "/v1/responses"}}, "request", time.Now())
	a.Mark("heartbeat", "upstream", 12)
	a.Mark("ping", "downstream", 0)
	a.ObserveSSE(`{"type":"response.created","response":{"instructions":"secret-system-prompt"}}`)
	first := a.Snapshot()
	require.NotNil(t, first.FirstEventMS)
	assert.Nil(t, first.FirstContentMS)
	a.ObserveSSE(`{"type":"response.reasoning_text.delta","delta":"secret-reasoning"}`)
	a.ObserveSSE(`{"choices":[{"delta":{"content":"secret-answer"}}]}`)
	a.ObserveSSE(strings.Repeat("secret-image", 2000))
	a.Finish("timeout", &TimeoutError{Phase: "idle"})
	summary := a.Snapshot()
	require.NotNil(t, summary.FirstReasoningMS)
	require.NotNil(t, summary.FirstContentMS)
	assert.Equal(t, 1, summary.Heartbeats)
	assert.Equal(t, 1, summary.Pings)
	assert.Equal(t, 1, summary.UnknownEvents)
	data, err := common.Marshal(summary)
	require.NoError(t, err)
	assert.NotContains(t, string(data), "secret-")
	assert.NotContains(t, PublicSummary(a), "scope")
	assert.NotContains(t, PublicSummary(a), "timeline")
}

func TestWindowExpiresRenewsSuppressesAndExhaustsBudgets(t *testing.T) {
	oldConfig, oldRedis := configuration, common.RedisEnabled
	configuration.WindowSeconds = 600
	configuration.SamplePercent = 100
	common.RedisEnabled = false
	t.Cleanup(func() { configuration = oldConfig; common.RedisEnabled = oldRedis })
	registry := NewRegistry()
	now := time.Now()
	scope := Scope{18, "model", "/v1/responses"}
	require.True(t, registry.Set(scope, "timeout", false, now))
	require.True(t, registry.Set(scope, "timeout", false, now.Add(9*time.Minute)))
	windows, _, _ := registry.Status(now.Add(11 * time.Minute))
	require.Len(t, windows, 1)
	require.True(t, registry.Set(scope, "manual", true, now.Add(12*time.Minute)))
	require.True(t, registry.Set(scope, "timeout", false, now.Add(13*time.Minute)))
	admitted, state := registry.Admit(scope, "request", now.Add(14*time.Minute))
	assert.False(t, admitted)
	assert.Equal(t, "inactive", state)
	require.True(t, registry.Set(scope, "manual", false, now.Add(14*time.Minute)))
	for range MaxDetailedPerWindow {
		admitted, _ = registry.Admit(scope, "request", now.Add(15*time.Minute))
		require.True(t, admitted)
		registry.Release()
	}
	require.True(t, registry.Set(scope, "timeout", false, now.Add(16*time.Minute)))
	admitted, state = registry.Admit(scope, "request", now.Add(17*time.Minute))
	assert.False(t, admitted)
	assert.Equal(t, "budget_exhausted", state)
	windows, _, _ = registry.Status(now.Add(27 * time.Minute))
	assert.Empty(t, windows)
}

func TestTraceLimitsConcurrentScopesAndEvents(t *testing.T) {
	oldConfig, oldRedis := configuration, common.RedisEnabled
	configuration.SamplePercent = 100
	common.RedisEnabled = false
	t.Cleanup(func() { configuration = oldConfig; common.RedisEnabled = oldRedis })
	registry := NewRegistry()
	scope := Scope{18, "model", "/v1/responses"}
	now := time.Now()
	require.True(t, registry.Set(scope, "manual", false, now))
	attempts := make([]*Attempt, 0, MaxConcurrent)
	for range MaxConcurrent {
		a := NewAttempt(registry, Summary{Scope: scope}, "request", now)
		assert.True(t, a.Snapshot().Detailed)
		attempts = append(attempts, a)
	}
	last := NewAttempt(registry, Summary{Scope: scope}, "request", now)
	assert.False(t, last.Snapshot().Detailed)
	for _, a := range attempts {
		a.Finish("done", nil)
	}
	a := NewAttempt(registry, Summary{Scope: scope}, "request", now)
	for range MaxEvents + 1 {
		a.Mark("heartbeat", "upstream", 12)
	}
	summary := a.Snapshot()
	assert.Len(t, summary.Timeline, MaxEvents)
	assert.True(t, summary.Truncated)
	a.Finish("done", nil)
	for i := range MaxScopes {
		registry.Set(Scope{i + 100, "model", "/v1/responses"}, "timeout", false, now)
	}
	windows, _, drops := registry.Status(now)
	assert.Len(t, windows, MaxScopes)
	assert.Greater(t, drops, uint64(0))
}

func BenchmarkStreamDiagnostics(b *testing.B) {
	for _, detailed := range []bool{false, true} {
		name := "summary"
		if detailed {
			name = "trace"
		}
		b.Run(name, func(b *testing.B) {
			a := &Attempt{start: time.Now(), last: time.Now(), detailed: detailed}
			event := `{"choices":[{"delta":{"content":"a representative output token"}}]}`
			b.ReportAllocs()
			for b.Loop() {
				a.ObserveSSE(event)
			}
		})
	}
}

func TestSharedTraceWindowsAndStorageBudgetWithRedis(t *testing.T) {
	addr := os.Getenv("TEST_DIAGNOSTIC_REDIS_ADDR")
	if addr == "" {
		t.Skip("real Redis address not configured")
	}
	oldClient, oldEnabled, oldConfig := common.RDB, common.RedisEnabled, configuration
	client := redis.NewClient(&redis.Options{Addr: addr, DB: 15})
	common.RDB = client
	common.RedisEnabled = true
	configuration.SamplePercent = 100
	ctx := context.Background()
	require.NoError(t, client.FlushDB(ctx).Err())
	t.Cleanup(func() {
		require.NoError(t, client.FlushDB(ctx).Err())
		require.NoError(t, client.Close())
		common.RDB = oldClient
		common.RedisEnabled = oldEnabled
		configuration = oldConfig
	})
	first, second := NewRegistry(), NewRegistry()
	now := time.Now()
	scope := Scope{18, "model", "/v1/responses"}
	require.True(t, first.Set(scope, "timeout", false, now))
	first.publish(<-first.queue)
	first.sync(now)
	second.sync(now)
	for _, r := range []*Registry{first, second} {
		windows, shared, _ := r.Status(now)
		require.True(t, shared)
		require.Len(t, windows, 1)
		admitted, _ := r.Admit(scope, "request", now)
		require.True(t, admitted)
		r.Release()
	}
	// A manual stop on another node propagates and survives a racing timeout.
	require.True(t, second.Set(scope, "manual", true, now.Add(time.Millisecond)))
	second.publish(<-second.queue)
	require.True(t, first.Set(scope, "timeout", false, now.Add(2*time.Millisecond)))
	first.publish(<-first.queue)
	first.sync(now)
	second.sync(now)
	admitted, state := first.Admit(scope, "request", now)
	assert.False(t, admitted)
	assert.Equal(t, "inactive", state)
	require.True(t, second.Set(scope, "manual", false, now.Add(3*time.Millisecond)))
	second.publish(<-second.queue)
	first.sync(now)
	admitted, _ = first.Admit(scope, "request", now)
	require.True(t, admitted)
	first.Release()
	// Atomically reserve only the remaining global storage slots across nodes.
	require.NoError(t, client.Set(ctx, "new-api:relay-trace:storage:v1", MaxStoredTraces-5, 0).Err())
	first.mu.Lock()
	first.credits[scope.Key()] = 0
	first.mu.Unlock()
	second.mu.Lock()
	second.credits[scope.Key()] = 0
	second.mu.Unlock()
	first.sync(now)
	second.sync(now)
	total := 0
	for _, r := range []*Registry{first, second} {
		for range 6 {
			admitted, _ = r.Admit(scope, "request", now)
			if admitted {
				total++
				r.Release()
			}
		}
	}
	assert.Equal(t, 5, total)
	// An expired shared window is omitted without contacting Redis on relay paths.
	expired := Window{Scope: scope, Until: now.Add(-time.Second).UnixMilli(), Reason: "timeout", Updated: now.UnixMilli()}
	encoded, err := common.Marshal(expired)
	require.NoError(t, err)
	require.NoError(t, client.HSet(ctx, "new-api:relay-trace:v1", scope.Key(), string(encoded)).Err())
	fresh := NewRegistry()
	fresh.sync(now)
	windows, _, _ := fresh.Status(now)
	assert.Empty(t, windows)
}

// BenchmarkHTTPRelayDiagnostics uses a real keep-alive HTTP server and body
// reads. Registry/window fixture setup is excluded from measured request time.
func BenchmarkHTTPRelayDiagnostics(b *testing.B) {
	oldConfig, oldEnabled := configuration, common.RedisEnabled
	configuration.SamplePercent = 100
	common.RedisEnabled = false
	defer func() { configuration = oldConfig; common.RedisEnabled = oldEnabled }()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"choices":[{"delta":{"content":"representative output"}}]}`)
	}))
	defer server.Close()
	client := server.Client()
	for _, mode := range []string{"baseline", "summary", "detailed"} {
		b.Run(mode, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				b.StopTimer()
				registry := NewRegistry()
				now := time.Now()
				scope := Scope{18, "model", "/v1/chat/completions"}
				if mode == "detailed" {
					registry.Set(scope, "manual", false, now)
				}
				req, _ := http.NewRequest(http.MethodPost, server.URL, strings.NewReader(`{}`))
				b.StartTimer()
				var a *Attempt
				if mode != "baseline" {
					a = NewAttempt(registry, Summary{Scope: scope, Budgets: Budgets{Headers: 2, FirstByte: 2, Idle: 2, Total: 5}}, "request", now)
					req = a.Prepare(req, now, true)
				}
				resp, err := client.Do(req)
				if err != nil {
					b.Fatal(err)
				}
				if a != nil {
					a.Headers(resp, true)
				}
				body, err := io.ReadAll(resp.Body)
				if err != nil {
					b.Fatal(err)
				}
				if a != nil {
					a.ObserveSSE(string(body))
				}
				if err := resp.Body.Close(); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}
