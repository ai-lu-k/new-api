package service

import (
	"bytes"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/relayobs"
	"github.com/QuantumNous/new-api/pkg/relaytrace"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

const observationContextKey = "relay_observation"

var procurementProfiles atomic.Pointer[[]relayobs.CostProfile]

func ConfigureRelayObservations() error {
	profiles := []relayobs.CostProfile{}
	if raw := os.Getenv("RELAY_OBSERVATION_COST_PROFILES"); raw != "" {
		if len(raw) > 262144 || common.UnmarshalJsonStr(raw, &profiles) != nil || len(profiles) > 1000 {
			return errors.New("invalid RELAY_OBSERVATION_COST_PROFILES")
		}
	}
	seen := make(map[string]bool)
	for _, profile := range profiles {
		if err := profile.Validate(); err != nil {
			return err
		}
		key := fmt.Sprintf("%d:%s", profile.ChannelID, profile.UpstreamModel)
		if seen[key] {
			return errors.New("duplicate procurement profile")
		}
		seen[key] = true
	}
	procurementProfiles.Store(&profiles)
	return nil
}

type RelayObservationState struct {
	mu          sync.Mutex
	request     relayobs.Request
	start       time.Time
	writer      *observationResponseWriter
	traces      map[*relaytrace.Attempt]bool
	writeFailed bool
}

func BeginRelayObservation(c *gin.Context, format types.RelayFormat) *RelayObservationState {
	if format == types.RelayFormatOpenAIRealtime {
		return nil
	}
	start := common.GetContextKeyTime(c, constant.ContextKeyGatewayStartTime)
	if start.IsZero() {
		start = time.Now()
	}
	state := &RelayObservationState{start: start, traces: make(map[*relaytrace.Attempt]bool)}
	state.request = relayobs.Request{SchemaVersion: relayobs.SchemaVersion,
		RequestID: c.GetString(common.RequestIdKey), StartedAtMS: start.UnixMilli(),
		Model: common.GetContextKeyString(c, constant.ContextKeyOriginalModel),
		Path:  c.Request.URL.Path, Format: string(format), TrafficKind: "user",
		Candidates: []relayobs.Candidate{}, Attempts: []relayobs.Attempt{}}
	if strings.HasPrefix(state.request.Path, "/v1beta/") || strings.HasPrefix(state.request.Path, "/v1/models/") {
		state.request.Path = "/v1/gemini"
	}
	state.writer = &observationResponseWriter{ResponseWriter: c.Writer, state: state}
	c.Writer = state.writer
	c.Set(observationContextKey, state)
	return state
}

func RecordRelayCandidate(c *gin.Context, channelID int, group, result string) {
	value, ok := c.Get(observationContextKey)
	if !ok {
		return
	}
	state := value.(*RelayObservationState)
	state.mu.Lock()
	defer state.mu.Unlock()
	if len(state.request.Candidates) >= 128 {
		state.request.Truncated = true
		return
	}
	state.request.Candidates = append(state.request.Candidates, relayobs.Candidate{ChannelID: channelID, Group: group, Result: result})
}

// RecordRelayAttempt observes a completed HTTP attempt before retry state is
// reset. A local failure that never created a new transport trace is not an
// upstream attempt and must not inherit the previous channel's usage.
func RecordRelayAttempt(c *gin.Context, info *relaycommon.RelayInfo, previous *relaytrace.Attempt, apiErr *types.NewAPIError) {
	value, ok := c.Get(observationContextKey)
	if !ok || info == nil || info.TransportTrace == nil || info.TransportTrace == previous {
		return
	}
	state := value.(*RelayObservationState)
	trace := info.TransportTrace
	summary := trace.Snapshot()
	attempt := relayobs.Attempt{ChannelID: summary.Scope.Channel, UpstreamModel: summary.Scope.Model,
		UpstreamRequestID: summary.UpstreamRequestID, Format: summary.Format, Effort: summary.Effort, ContextTokensEstimate: summary.InputTokens,
		StartedAtMS: summary.StartedAtMS, DurationMS: summary.DurationMS, FirstReasoningMS: summary.FirstReasoningMS,
		FirstContentMS: summary.FirstContentMS, ResponseBytes: summary.Bytes, RequestBytes: summary.RequestBytes, Status: summary.Status,
		Outcome: "success", EndReason: summary.End, TimeoutPhase: summary.TimeoutPhase, Usage: summary.Usage}
	if apiErr != nil || summary.Status >= 400 || summary.Status == 0 || !info.StreamStatus.IsSuccessfulResponse() {
		attempt.Outcome = "error"
	}
	if apiErr != nil {
		attempt.ErrorCode = observationErrorCode(string(apiErr.GetErrorCode()))
		attempt.ErrorSource = "upstream_response"
		if summary.Status == 0 {
			attempt.ErrorSource = "transport"
		}
	} else if info.StreamStatus != nil {
		attempt.ErrorCode = observationErrorCode(info.StreamStatus.OutcomeSnapshot().ErrorCode)
		if attempt.ErrorCode != "" {
			attempt.ErrorSource = "upstream_response"
		}
	}
	if summary.TimeoutPhase != "" {
		attempt.Outcome = "timeout"
	} else if c.Request.Context().Err() != nil || summary.End == "client_cancelled" {
		attempt.Outcome = "client_cancelled"
	} else if info.StreamStatus != nil && info.StreamStatus.ResponseOutcome() == "incomplete" {
		attempt.Outcome = "incomplete"
		attempt.IncompleteReason = observationErrorCode(info.StreamStatus.OutcomeSnapshot().IncompleteReason)
	}
	if first := relayobs.FirstOutput(summary.FirstReasoningMS, summary.FirstContentMS); first != nil && summary.LastOutputMS != nil && *summary.LastOutputMS > *first {
		generation := *summary.LastOutputMS - *first
		attempt.GenerationMS = &generation
		if summary.Usage != nil && summary.Usage.OutputTokens != nil {
			tps := float64(*summary.Usage.OutputTokens) * 1000 / float64(generation)
			attempt.OutputTPS = &tps
		}
	}
	var profile *relayobs.CostProfile
	if profiles := procurementProfiles.Load(); profiles != nil {
		for i := range *profiles {
			candidate := &(*profiles)[i]
			if candidate.ChannelID == attempt.ChannelID && candidate.UpstreamModel == attempt.UpstreamModel {
				profile = candidate
				break
			}
		}
	}
	attempt.Cost = relayobs.ProcurementCost(summary.Usage, profile)
	state.mu.Lock()
	defer state.mu.Unlock()
	if state.traces[trace] {
		return
	}
	state.traces[trace] = true
	if len(state.request.Attempts) >= 64 {
		state.request.Truncated = true
		return
	}
	attempt.Number = len(state.request.Attempts) + 1
	state.request.Attempts = append(state.request.Attempts, attempt)
}

func observationErrorCode(code string) string {
	if len(code) > 80 {
		return "unclassified_error"
	}
	for _, char := range code {
		valid := char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z' || char >= '0' && char <= '9' || strings.ContainsRune("_.-", char)
		if !valid {
			return "unclassified_error"
		}
	}
	return code
}

func (state *RelayObservationState) Finish(c *gin.Context, info *relaycommon.RelayInfo, apiErr *types.NewAPIError, panicked bool) {
	if state == nil {
		return
	}
	// A panic can leave a started transport outside the normal attempt boundary.
	RecordRelayAttempt(c, info, nil, apiErr)
	state.mu.Lock()
	state.request.DurationMS = time.Since(state.start).Milliseconds()
	state.request.Outcome = "success"
	if info != nil {
		state.request.Model, state.request.Group = info.OriginModelName, info.UsingGroup
		state.request.Streaming = info.IsStream
		if info.IsChannelTest {
			state.request.TrafficKind = "probe"
		}
		if !info.StreamStatus.IsSuccessfulResponse() {
			state.request.Outcome = "incomplete"
			stream := info.StreamStatus.OutcomeSnapshot()
			if stream.Response == relaycommon.ResponseOutcomeFailed || stream.HasErrors {
				state.request.Outcome = "error"
			}
			if stream.Response == relaycommon.ResponseOutcomeCancelled || stream.EndReason == relaycommon.StreamEndReasonClientGone {
				state.request.Outcome = "client_cancelled"
			}
		}
	}
	if apiErr != nil {
		state.request.Outcome = "error"
		state.request.ErrorCode = observationErrorCode(string(apiErr.GetErrorCode()))
		if len(state.request.Attempts) == 0 {
			state.request.Outcome = "local_rejection"
			switch apiErr.GetErrorCode() {
			case types.ErrorCodeGetChannelFailed, types.ErrorCodeChannelConcurrencyUnavailable:
				state.request.Outcome = "routing_error"
			case types.ErrorCodeChannelConcurrencyExceeded:
				state.request.Outcome = "capacity_rejected"
			}
		}
	}
	if c.Request.Context().Err() != nil {
		state.request.Outcome = "client_cancelled"
	}
	if state.writeFailed && c.Request.Context().Err() == nil {
		state.request.Outcome = "delivery_error"
	}
	if panicked {
		state.request.Outcome = "error"
		state.request.ErrorCode = "relay_panic"
	}
	request := state.request
	if len(request.Attempts) == 0 {
		for _, candidate := range request.Candidates {
			if candidate.Result == "admitted" {
				// SDK-owned or uninstrumented transports are unknown, never free.
				request.Truncated = true
				break
			}
		}
	}
	state.mu.Unlock()
	c.Writer = state.writer.ResponseWriter
	model.EnqueueRelayObservation(request)
}

// This writer measures successful downstream writes, not upstream receipt.
// Comment heartbeats and role/usage frames cannot produce a user-facing TTFT.
type observationResponseWriter struct {
	gin.ResponseWriter
	state    *RelayObservationState
	line     []byte
	data     []byte
	oversize bool
}

func (w *observationResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

func (w *observationResponseWriter) WriteString(data string) (int, error) {
	return w.Write([]byte(data))
}

func (w *observationResponseWriter) Write(data []byte) (int, error) {
	w.state.mu.Lock()
	defer w.state.mu.Unlock()
	n, err := w.ResponseWriter.Write(data)
	if err != nil || n != len(data) {
		w.state.writeFailed = true
	}
	w.state.request.DownstreamBytes += int64(n)
	ms := time.Since(w.state.start).Milliseconds()
	if strings.HasPrefix(w.Header().Get("Content-Type"), "text/event-stream") {
		for _, char := range data[:n] {
			if char != '\n' {
				if len(w.line) < 16384 {
					w.line = append(w.line, char)
				} else {
					w.oversize = true
					w.state.request.Truncated = true
				}
				continue
			}
			line := bytes.TrimSuffix(w.line, []byte("\r"))
			if len(line) == 0 {
				if !w.oversize && len(w.data) > 0 {
					w.mark(relaytrace.ClassifySSE(string(bytes.TrimSpace(w.data))), ms)
				}
				w.data, w.oversize = nil, false
			} else if bytes.HasPrefix(line, []byte("data:")) {
				if len(w.data)+len(line) <= 16384 {
					w.data = append(w.data, line[5:]...)
					w.data = append(w.data, '\n')
				} else {
					w.oversize = true
					w.state.request.Truncated = true
				}
			}
			w.line = w.line[:0]
		}
	} else if n > 0 && n <= 65536 && gjson.ValidBytes(data[:n]) && w.Status() >= http.StatusOK && w.Status() < http.StatusBadRequest {
		// A non-streaming JSON response has no token arrival timeline. Its
		// content delivery is observed at the complete JSON write only.
		for _, path := range []string{"choices.0.message.content", "choices.0.text", "content.0.text", "output.0.content.0.text", "candidates.0.content.parts.0.text"} {
			if gjson.GetBytes(data[:n], path).Str != "" {
				w.mark("content", ms)
				break
			}
		}
	}
	return n, err
}

func (w *observationResponseWriter) mark(kind string, ms int64) {
	if kind == "content" && w.state.request.FirstContentMS == nil {
		w.state.request.FirstContentMS = &ms
	}
	if kind == "reasoning" && w.state.request.FirstReasoningMS == nil {
		w.state.request.FirstReasoningMS = &ms
	}
}
