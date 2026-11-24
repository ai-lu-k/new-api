package relaytrace

import (
	"context"
	"crypto/tls"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptrace"
	"strings"
	"sync"
	"time"

	"github.com/tidwall/gjson"
)

type Event struct {
	Sequence  int    `json:"sequence"`
	AtMS      int64  `json:"at_ms"`
	Kind      string `json:"kind"`
	Direction string `json:"direction"`
	Bytes     int    `json:"bytes,omitempty"`
}

type Summary struct {
	StartedAtMS            int64          `json:"started_at_ms"`
	UpstreamRequestID      string         `json:"upstream_request_id,omitempty"`
	Usage                  *ReportedUsage `json:"usage,omitempty"`
	LastOutputMS           *int64         `json:"last_output_ms,omitempty"`
	RequestBytes           *int64         `json:"request_bytes"`
	RetryAllUpstreamErrors bool           `json:"retry_all_upstream_errors,omitempty"`
	LatencyBudget          *LatencyBudget `json:"latency_budget,omitempty"`
	FinishedAt             int64          `json:"finished_at,omitempty"`
	FirstUnclassifiedMS    *int64         `json:"first_unclassified_ms,omitempty"`
	ReusedConnection       bool           `json:"reused_connection"`
	Retry                  int            `json:"retry"`
	Attempt                int            `json:"attempt"`
	Scope                  Scope          `json:"scope"`
	Effort                 string         `json:"effort,omitempty"`
	Streaming              bool           `json:"streaming"`
	Format                 string         `json:"format"`
	InputTokens            *int           `json:"input_tokens,omitempty"`
	Budgets                Budgets        `json:"budgets"`
	ConnectedMS            *int64         `json:"connected_ms"`
	HeaderByteMS           *int64         `json:"header_byte_ms"`
	HeadersMS              *int64         `json:"headers_ms"`
	FirstByteMS            *int64         `json:"first_byte_ms"`
	FirstEventMS           *int64         `json:"first_event_ms"`
	FirstContentMS         *int64         `json:"first_content_ms"`
	FirstReasoningMS       *int64         `json:"first_reasoning_ms"`
	LastDataMS             *int64         `json:"last_data_ms"`
	MaxSilenceMS           int64          `json:"max_silence_ms"`
	DurationMS             int64          `json:"duration_ms"`
	Bytes                  int64          `json:"bytes"`
	Events                 int            `json:"event_count"`
	Heartbeats             int            `json:"upstream_heartbeats"`
	Pings                  int            `json:"downstream_pings"`
	UnknownEvents          int            `json:"unclassified_events"`
	Status                 int            `json:"status"`
	Protocol               string         `json:"protocol,omitempty"`
	End                    string         `json:"end_reason"`
	TimeoutPhase           string         `json:"timeout_phase,omitempty"`
	Detailed               bool           `json:"detailed"`
	DetailState            string         `json:"detail_state"`
	Truncated              bool           `json:"truncated,omitempty"`
	Timeline               []Event        `json:"timeline,omitempty"`
}

type LatencyBudget struct {
	Seconds          float64 `json:"seconds"`
	Enforce          bool    `json:"enforce"`
	Reference        bool    `json:"reference"`
	Source           string  `json:"source"`
	Version          int64   `json:"version,omitempty"`
	KeepAliveSeconds int     `json:"keepalive_seconds,omitempty"`
}

type Attempt struct {
	mu           sync.Mutex
	start        time.Time
	last         time.Time
	summary      Summary
	timeline     []Event
	totalEvents  int
	finished     bool
	released     bool
	detailed     bool
	cancel       context.CancelCauseFunc
	timers       map[string]*time.Timer
	ctx          context.Context
	stopClient   func() bool
	registry     *Registry
	jsonBody     []byte
	jsonTooLarge bool
	inspectJSON  bool
}

type TimeoutError struct{ Phase string }

func (e *TimeoutError) Error() string   { return "relay " + e.Phase + " timeout" }
func (e *TimeoutError) Timeout() bool   { return true }
func (e *TimeoutError) Temporary() bool { return false }

func NewAttempt(registry *Registry, summary Summary, requestID string, now time.Time) *Attempt {
	summary.StartedAtMS = now.UnixMilli()
	detailed, state := registry.Admit(summary.Scope, requestID, now)
	if !validEffort(summary.Effort) {
		summary.Effort = ""
	}
	summary.Detailed = detailed
	summary.DetailState = state
	return &Attempt{start: now, last: now, summary: summary, detailed: detailed, registry: registry, timers: make(map[string]*time.Timer)}
}

// Prepare supplies per-request phase timers without modifying shared clients or
// connection pools. The total deadline starts at the original request start and
// is not refreshed by retries, upstream heartbeats or downstream pings.
func (a *Attempt) Prepare(req *http.Request, requestStart time.Time, enabled bool, clientContexts ...context.Context) *http.Request {
	ctx, cancel := context.WithCancelCause(req.Context())
	a.mu.Lock()
	a.ctx = ctx
	a.cancel = cancel
	if len(clientContexts) > 0 {
		clientCtx := clientContexts[0]
		a.stopClient = context.AfterFunc(clientCtx, func() { cancel(context.Cause(clientCtx)) })
	}
	if b := a.summary.LatencyBudget; b != nil && b.Enforce && a.summary.Streaming && b.Seconds > 0 {
		a.arm("first_meaningful", time.Duration(b.Seconds*float64(time.Second)))
	}
	if enabled && a.summary.Budgets.Total > 0 {
		elapsed := time.Since(requestStart)
		if requestStart.IsZero() {
			elapsed = 0
		}
		a.arm("total", Seconds(a.summary.Budgets.Total)-elapsed)
	}
	a.mu.Unlock()
	trace := &httptrace.ClientTrace{
		GetConn:  func(_ string) { a.Mark("connection_wait", "upstream", 0) },
		GotConn:  func(_ httptrace.GotConnInfo) { a.markTime("connected") },
		DNSStart: func(_ httptrace.DNSStartInfo) { a.Mark("dns", "upstream", 0) },
		TLSHandshakeDone: func(_ tls.ConnectionState, err error) {
			if err == nil {
				a.Mark("tls_ready", "upstream", 0)
			}
		},
		WroteRequest: func(info httptrace.WroteRequestInfo) {
			if info.Err != nil {
				return
			}
			a.mu.Lock()
			defer a.mu.Unlock()
			a.last = time.Now()
			if req.ContentLength > 0 || req.Body == nil || req.Body == http.NoBody {
				size := req.ContentLength
				a.summary.RequestBytes = &size
			}
			a.event("request_sent", "upstream", 0, a.last)
			if enabled && a.summary.HeadersMS == nil {
				a.arm("headers", Seconds(a.summary.Budgets.Headers))
			}
		},
		GotFirstResponseByte: func() { a.markTime("header_byte") },
	}
	return req.WithContext(httptrace.WithClientTrace(ctx, trace))
}

// arm is called while holding mu. Timer callbacks recheck the current timer
// identity, so a reset timer cannot cancel a request after new bytes arrive.
func (a *Attempt) arm(phase string, delay time.Duration) {
	if a.finished {
		return
	}
	if old := a.timers[phase]; old != nil {
		old.Stop()
	}
	var timer *time.Timer
	timer = time.AfterFunc(max(delay, time.Nanosecond), func() {
		a.mu.Lock()
		defer a.mu.Unlock()
		if a.finished || a.summary.TimeoutPhase != "" || a.timers[phase] != timer {
			return
		}
		a.summary.TimeoutPhase = phase
		a.summary.End = "timeout"
		a.event("timeout", "upstream", 0, time.Now())
		a.cancel(&TimeoutError{Phase: phase})
	})
	a.timers[phase] = timer
}

func (a *Attempt) stop(phase string) {
	if timer := a.timers[phase]; timer != nil {
		timer.Stop()
		delete(a.timers, phase)
	}
}

func (a *Attempt) Headers(resp *http.Response, enabled bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.stop("headers")
	now := time.Now()
	ms := now.Sub(a.start).Milliseconds()
	a.summary.HeadersMS = &ms
	a.summary.Status = resp.StatusCode
	a.summary.Protocol = resp.Proto
	a.inspectJSON = !strings.HasPrefix(resp.Header.Get("Content-Type"), "text/event-stream")
	for _, header := range []string{"X-Oneapi-Request-Id", "Request-Id", "X-Request-Id", "X-Upstream-Request-Id"} {
		id := resp.Header.Get(header)
		if id != "" && len(id) <= 128 && !strings.ContainsAny(id, "\r\n") {
			a.summary.UpstreamRequestID = id
			break
		}
	}
	a.summary.MaxSilenceMS = max(a.summary.MaxSilenceMS, now.Sub(a.last).Milliseconds())
	a.last = now
	a.event("headers", "upstream", 0, now)
	if enabled {
		a.arm("first_byte", Seconds(a.summary.Budgets.FirstByte))
	}
	resp.Body = &observedBody{ReadCloser: resp.Body, attempt: a, enabled: enabled}
	if resp.StatusCode == 408 || resp.StatusCode == 504 || resp.StatusCode == 524 {
		a.summary.End = "upstream_timeout_status"
		a.summary.TimeoutPhase = "upstream"
		a.registry.Set(a.summary.Scope, "timeout", false, now)
	}
}

func (a *Attempt) markTime(kind string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	ms := time.Since(a.start).Milliseconds()
	switch kind {
	case "connected":
		if a.summary.ConnectedMS == nil {
			a.summary.ConnectedMS = &ms
		}
	case "header_byte":
		if a.summary.HeaderByteMS == nil {
			a.summary.HeaderByteMS = &ms
		}
	}
	a.event(kind, "upstream", 0, time.Now())
}

// Mark accepts only fixed internal classifications; payloads, arbitrary event
// names, headers and URLs never enter a trace.
func (a *Attempt) Mark(kind, direction string, bytes int) {
	if a == nil {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	switch kind {
	case "ping":
		a.summary.Pings++
	case "heartbeat", "empty_event":
		a.summary.Heartbeats++
	case "content", "reasoning", "lifecycle", "done", "unknown_event", "upstream_error":
		a.summary.Events++
		if a.summary.FirstEventMS == nil {
			ms := time.Since(a.start).Milliseconds()
			a.summary.FirstEventMS = &ms
		}
		if kind == "content" && a.summary.FirstContentMS == nil {
			ms := time.Since(a.start).Milliseconds()
			a.summary.FirstContentMS = &ms
		}
		if kind == "reasoning" && a.summary.FirstReasoningMS == nil {
			ms := time.Since(a.start).Milliseconds()
			a.summary.FirstReasoningMS = &ms
		}
		if kind == "content" || kind == "reasoning" {
			ms := time.Since(a.start).Milliseconds()
			a.summary.LastOutputMS = &ms
		}
		if kind == "unknown_event" {
			a.summary.UnknownEvents++
			if a.summary.FirstUnclassifiedMS == nil && a.summary.FirstContentMS == nil && a.summary.FirstReasoningMS == nil {
				ms := time.Since(a.start).Milliseconds()
				a.summary.FirstUnclassifiedMS = &ms
			}
		}
		if kind == "content" || kind == "reasoning" || kind == "unknown_event" {
			a.stop("first_meaningful")
		}
	case "connection_wait", "dns", "tls_ready":
	default:
		return
	}
	a.event(kind, direction, bytes, time.Now())
}

func (a *Attempt) KeepaliveInterval() time.Duration {
	if a == nil {
		return 0
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if b := a.summary.LatencyBudget; b != nil && b.Enforce && b.KeepAliveSeconds > 0 {
		return time.Duration(b.KeepAliveSeconds) * time.Second
	}
	return 0
}

func (a *Attempt) event(kind, direction string, bytes int, now time.Time) {
	a.totalEvents++
	limit := 8
	if a.detailed {
		limit = MaxEvents
	}
	e := Event{Sequence: a.totalEvents, AtMS: now.Sub(a.start).Milliseconds(), Kind: kind, Direction: direction, Bytes: bytes}
	if len(a.timeline) == limit {
		copy(a.timeline, a.timeline[1:])
		a.timeline[len(a.timeline)-1] = e
		a.summary.Truncated = true
		return
	}
	a.timeline = append(a.timeline, e)
}

// ObserveSSE only inspects bounded event envelopes. Large/unknown events are
// explicitly unclassified. No text is retained, hashed or written to logs.
func (a *Attempt) ObserveSSE(data string) string {
	if a == nil {
		return ""
	}
	if len(data) <= 16384 {
		a.ObserveUsage(data)
	}
	kind := ClassifySSE(data)
	a.Mark(kind, "upstream", len(data))
	return kind
}

// ClassifySSE classifies bounded protocol envelopes without retaining content.
func ClassifySSE(data string) string {
	kind := "unknown_event"
	if data == "" {
		return "empty_event"
	}
	if data == "[DONE]" {
		return "done"
	}
	if len(data) <= 16384 {
		paths := [...]string{"type", "choices.0.delta.content", "choices.0.delta.reasoning_content", "choices.0.delta.reasoning", "choices.0.delta.tool_calls.0.function.arguments", "delta.text", "delta.thinking", "delta.partial_json", "candidates.0.content.parts.0.text", "candidates.0.content.parts.0.thought", "choices.0.delta.tool_calls.0.function.name", "content_block.type", "content_block.name", "item.type", "item.name", "candidates.0.content.parts.0.functionCall.name"}
		var values [len(paths)]gjson.Result
		for i, path := range paths {
			values[i] = gjson.Get(data, path)
		}

		switch values[0].Str {
		case "error":
			kind = "upstream_error"
		case "response.output_text.delta", "response.function_call_arguments.delta":
			kind = "lifecycle"
			if gjson.Get(data, "delta").Str != "" {
				kind = "content"
			}
		case "response.reasoning_summary_text.delta", "response.reasoning_text.delta":
			kind = "lifecycle"
			if gjson.Get(data, "delta").Str != "" {
				kind = "reasoning"
			}
		case "response.created", "response.in_progress", "response.completed", "response.failed", "response.incomplete", "response.output_item.added", "response.content_part.added", "message_start", "message_delta", "message_stop", "content_block_start", "content_block_stop":
			kind = "lifecycle"
		case "ping":
			kind = "heartbeat"
		}
		if values[1].Str != "" || values[4].Str != "" || values[5].Str != "" || values[7].Str != "" {
			kind = "content"
		}
		if values[2].Str != "" || values[3].Str != "" || values[6].Str != "" {
			kind = "reasoning"
		}
		if values[8].Str != "" {
			kind = "content"
			if values[9].Bool() {
				kind = "reasoning"
			}
		}
		if values[10].Str != "" || values[11].Str == "tool_use" && values[12].Str != "" || values[13].Str == "function_call" && values[14].Str != "" || values[15].Str != "" {
			kind = "content"
		}
		if kind == "unknown_event" || kind == "lifecycle" {
			if value := gjson.Get(data, "error"); value.Exists() && value.Type != gjson.Null {
				kind = "upstream_error"
			}
			if gjson.Get(data, "choices.0.finish_reason").Str == "error" {
				kind = "upstream_error"
			}
		}
		if kind == "unknown_event" {
			delta := gjson.Get(data, "choices.0.delta")
			prelude := delta.IsObject()
			delta.ForEach(func(key, value gjson.Result) bool {
				switch key.Str {
				case "role":
				case "content", "reasoning_content", "reasoning":
					prelude = value.Type == gjson.Null || value.Type == gjson.String && value.Str == ""
				case "tool_calls":
					prelude = value.IsArray() && len(value.Array()) == 0
				default:
					prelude = false
				}
				return prelude
			})
			if prelude {
				kind = "lifecycle"
			}
		}
	}
	return kind
}

func (a *Attempt) Finish(reason string, err error) {
	if a == nil {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.finished {
		return
	}
	now := time.Now()
	if a.ctx != nil {
		var timeout *TimeoutError
		cause := context.Cause(a.ctx)
		if errors.As(cause, &timeout) {
			a.summary.TimeoutPhase = timeout.Phase
			reason = "timeout"
		} else if errors.Is(cause, context.Canceled) {
			reason = "client_cancelled"
		}
	}
	var netErr net.Error
	if err != nil && errors.As(err, &netErr) && netErr.Timeout() {
		reason = "timeout"
		if a.summary.TimeoutPhase == "" {
			a.summary.TimeoutPhase = "transport"
			if a.summary.Budgets.Total > 0 && time.Since(a.start) >= Seconds(a.summary.Budgets.Total) {
				a.summary.TimeoutPhase = "total"
			} else if a.summary.HeadersMS == nil {
				a.summary.TimeoutPhase = "headers"
				if a.summary.ConnectedMS == nil {
					a.summary.TimeoutPhase = "connection"
				}
			}
		}
	}
	if a.summary.End == "" || reason == "timeout" {
		a.summary.End = reason
	}
	a.summary.DurationMS = now.Sub(a.start).Milliseconds()
	a.summary.FinishedAt = now.Unix()
	a.summary.MaxSilenceMS = max(a.summary.MaxSilenceMS, now.Sub(a.last).Milliseconds())
	a.event("end", "upstream", 0, now)
	a.finished = true
	for phase := range a.timers {
		a.stop(phase)
	}
	if a.stopClient != nil {
		a.stopClient()
	}
	if a.cancel != nil {
		a.cancel(nil)
	}
	if a.detailed && !a.released {
		a.registry.Release()
		a.released = true
	}
	if reason == "timeout" {
		a.registry.Set(a.summary.Scope, "timeout", false, now)
	}
}

func (a *Attempt) Snapshot() Summary {
	a.mu.Lock()
	defer a.mu.Unlock()
	s := a.summary
	if !a.finished {
		s.DurationMS = time.Since(a.start).Milliseconds()
		s.MaxSilenceMS = max(s.MaxSilenceMS, time.Since(a.last).Milliseconds())
	}
	if a.detailed || s.End == "timeout" || s.End == "upstream_timeout_status" {
		s.Timeline = append([]Event(nil), a.timeline...)
	}
	return s
}

// HoldingPrelude permits only bounded protocol prelude buffering. Unknown
// payloads commit the attempt conservatively, so they can never be replayed.
func (a *Attempt) HoldingPrelude() bool {
	if a == nil {
		return false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	buffered := a.summary.RetryAllUpstreamErrors || a.summary.LatencyBudget != nil && a.summary.LatencyBudget.Enforce
	return buffered && a.summary.FirstContentMS == nil && a.summary.FirstReasoningMS == nil && a.summary.FirstUnclassifiedMS == nil
}

func (a *Attempt) FirstOutputTimeout() bool {
	if a == nil {
		return false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.summary.TimeoutPhase == "first_meaningful" && a.summary.FirstContentMS == nil && a.summary.FirstReasoningMS == nil && a.summary.FirstUnclassifiedMS == nil
}

func (a *Attempt) Outcome(reason string) {
	if a == nil {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.summary.TimeoutPhase != "" || a.summary.End == "upstream_timeout_status" {
		return
	}
	a.summary.End = reason
	if reason == "timeout" {
		a.summary.TimeoutPhase = "stream_idle"
		a.registry.Set(a.summary.Scope, "timeout", false, time.Now())
	}
}

type observedBody struct {
	io.ReadCloser
	attempt *Attempt
	enabled bool
}

func (b *observedBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	a := b.attempt
	if n > 0 {
		a.mu.Lock()
		now := time.Now()
		ms := now.Sub(a.start).Milliseconds()
		if a.summary.FirstByteMS == nil {
			a.summary.FirstByteMS = &ms
			a.stop("first_byte")
		}
		a.summary.LastDataMS = &ms
		a.summary.Bytes += int64(n)
		// Inspect only bounded non-stream JSON. The buffer is never persisted,
		// and large responses deliberately leave unavailable usage unknown.
		if a.inspectJSON && !a.jsonTooLarge {
			if len(a.jsonBody)+n <= 65536 {
				a.jsonBody = append(a.jsonBody, p[:n]...)
			} else {
				a.jsonBody = nil
				a.jsonTooLarge = true
			}
		}
		a.summary.MaxSilenceMS = max(a.summary.MaxSilenceMS, now.Sub(a.last).Milliseconds())
		a.last = now
		a.event("bytes", "upstream", n, now)
		if b.enabled {
			a.arm("idle", Seconds(a.summary.Budgets.Idle))
		}
		a.mu.Unlock()
	}
	if err != nil {
		if err == io.EOF {
			a.mu.Lock()
			if len(a.jsonBody) > 0 {
				observeReportedUsage(string(a.jsonBody), &a.summary)
			}
			a.jsonBody = nil
			a.mu.Unlock()
		}
		reason := "read_error"
		if err == io.EOF {
			reason = "eof"
		}
		a.Finish(reason, err)
	}
	return n, err
}
func (b *observedBody) Close() error {
	err := b.ReadCloser.Close()
	b.attempt.mu.Lock()
	if len(b.attempt.jsonBody) > 0 {
		observeReportedUsage(string(b.attempt.jsonBody), &b.attempt.summary)
	}
	b.attempt.jsonBody = nil
	b.attempt.mu.Unlock()
	b.attempt.Finish("closed", err)
	return err
}

// PublicSummary deliberately has no channel, model, retries or detailed timeline.
func PublicSummary(attempt *Attempt) map[string]any {
	s := attempt.Snapshot()
	return map[string]any{"end_reason": s.End, "timeout_phase": s.TimeoutPhase, "duration_ms": s.DurationMS, "max_silence_ms": s.MaxSilenceMS, "first_content_ms": s.FirstContentMS}
}

func IsTimeout(s Summary) bool { return s.End == "timeout" || s.End == "upstream_timeout_status" }

func ValidScope(s Scope) bool {
	if s.Channel <= 0 || s.Model == "" || len(s.Model) > 200 || strings.ContainsAny(s.Model, "\r\n") {
		return false
	}
	switch s.Path {
	case "/v1/chat/completions", "/v1/responses", "/v1/responses/compact", "/v1/messages", "/v1/completions", "/v1/images/generations", "/v1/images/edits", "/v1/embeddings", "/v1/audio/speech", "/v1/audio/transcriptions", "/v1/audio/translations", "/v1/rerank", "/v1/gemini":
		return true
	}
	return false
}
