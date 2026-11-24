package openai

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestObserveStreamChoicesDedupesFunctionCallNames(t *testing.T) {
	info := &relaycommon.RelayInfo{StreamStatus: relaycommon.NewStreamStatus()}
	seen := make(map[string]struct{})
	var names []string

	chunks := []string{
		`{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"c1","type":"function","function":{"name":"get_weather","arguments":""}}]}}]}`,
		`{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"q\":"}}]}}]}`,
		`{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"x\"}"}}]}}]}`,
		`{"choices":[{"index":0,"delta":{"tool_calls":[{"index":1,"id":"c2","type":"function","function":{"name":"get_time","arguments":""}}]}}]}`,
		`{"choices":[{"index":0,"delta":{"tool_calls":[{"index":1,"function":{"arguments":"{}"}}]}}]}`,
	}
	for _, chunk := range chunks {
		observeStreamChoices(info, chunk, seen, &names)
	}

	require.Len(t, names, 2)
	assert.Equal(t, []string{"get_weather", "get_time"}, names)
	assert.Empty(t, info.StreamStatus.ResponseOutcome(), "tool call deltas carry no finish reason")

	observeStreamChoices(info, `{"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}`, seen, &names)
	assert.Equal(t, "completed", info.StreamStatus.ResponseOutcome())
	assert.False(t, info.PerformanceBusinessRejection)

	filtered := &relaycommon.RelayInfo{StreamStatus: relaycommon.NewStreamStatus()}
	observeStreamChoices(filtered, `{"choices":[{"index":0,"delta":{},"finish_reason":"content_filter"}]}`, map[string]struct{}{}, &names)
	assert.True(t, filtered.PerformanceBusinessRejection)
}

func TestChatStreamFailureAccounting(t *testing.T) {
	previousTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = previousTimeout })
	for _, tc := range []struct {
		name, frames, outcome, code string
		prompt, completion          int
	}{
		{"error terminal has no proven usage", `{"choices":[{"delta":{},"finish_reason":"error"}]}`, "failed", "upstream_finish_reason_error", 0, 0},
		{"error envelope has no proven usage", `{"error":{"code":"secret","message":"private conversation"}}`, "failed", "upstream_stream_error", 0, 0},
		{"flat error event is a failure", `{"type":"error","message":"private conversation"}`, "failed", "upstream_stream_error", 0, 0},
		{"unknown finish is not success", `{"choices":[{"delta":{},"finish_reason":"private conversation"}]}`, "failed", "unsupported_finish_reason", 0, 0},
		{"done alone is not a response", ``, "incomplete", "", 0, 0},
		{"role alone is not generated output", `{"choices":[{"delta":{"role":"assistant"}}]}`, "incomplete", "", 0, 0},
		{"normal empty completion retains prompt estimate", `{"choices":[{"delta":{},"finish_reason":"stop"}]}`, "completed", "", 100, 0},
		{"failure after output retains observed estimate", `{"choices":[{"delta":{"content":"hello"},"finish_reason":"error"}]}`, "failed", "upstream_finish_reason_error", 100, 2},
		{"failure after reasoning retains observed estimate", `{"choices":[{"delta":{"reasoning_content":"hello"},"finish_reason":"error"}]}`, "failed", "upstream_finish_reason_error", 100, 2},
		{"truncated output retains observed estimate", `{"choices":[{"delta":{"content":"hello"}}]}`, "incomplete", "", 100, 2},
		{"error preserves reported input usage", `{"usage":{"prompt_tokens":12,"completion_tokens":0,"total_tokens":12},"choices":[{"delta":{},"finish_reason":"error"}]}`, "failed", "upstream_finish_reason_error", 12, 0},
		{"error does not erase earlier usage", `{"usage":{"prompt_tokens":12,"completion_tokens":3,"total_tokens":15}}
{"choices":[]}
{"choices":[{"delta":{},"finish_reason":"error"}]}
{"choices":[]}`, "failed", "upstream_finish_reason_error", 12, 3},
		{"later stop cannot hide failure", `{"choices":[{"delta":{},"finish_reason":"error"}]}
{"choices":[{"delta":{},"finish_reason":"stop"}]}`, "failed", "upstream_finish_reason_error", 0, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var body strings.Builder
			for frame := range strings.SplitSeq(tc.frames, "\n") {
				if frame != "" {
					body.WriteString("data: " + frame + "\n\n")
				}
			}
			body.WriteString("data: [DONE]\n\n")
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
			info := &relaycommon.RelayInfo{
				ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "gpt-4o"},
				RelayMode:   relayconstant.RelayModeChatCompletions, RelayFormat: types.RelayFormatOpenAI, IsStream: true,
			}
			info.SetEstimatePromptTokens(100)
			response := &http.Response{StatusCode: http.StatusOK, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body.String()))}
			usage, apiErr := OaiStreamHandler(ctx, info, response)
			require.Nil(t, apiErr, "a committed SSE failure must not cause a replay")
			require.NotNil(t, usage)
			assert.Equal(t, tc.prompt, usage.PromptTokens)
			assert.Equal(t, tc.completion, usage.CompletionTokens)
			assert.Equal(t, tc.prompt+tc.completion, usage.TotalTokens)
			outcome := info.StreamStatus.OutcomeSnapshot()
			assert.Equal(t, tc.outcome, string(outcome.Response))
			assert.Equal(t, tc.code, outcome.ErrorCode)
			assert.NotContains(t, info.StreamStatus.Summary(), "private conversation")
			if strings.Contains(tc.frames, `"finish_reason":"error"`) {
				assert.Contains(t, recorder.Body.String(), `"finish_reason":"error"`, "usage filtering must not hide an error terminal")
			}
		})
	}
}

func TestChatStreamDisconnectAccounting(t *testing.T) {
	for _, tc := range []struct {
		name, delta, needle string
		prompt, completion  int
	}{
		{"role only", `{"role":"assistant"}`, "assistant", 0, 0},
		{"partial output", `{"content":"hello"}`, "hello", 100, 2},
	} {
		t.Run(tc.name, func(t *testing.T) {
			// The second frame flushes the buffered first frame, whose downstream
			// write cancels the client while the controlled upstream is still open.
			body := "data: {\"choices\":[{\"delta\":" + tc.delta + "}]}\n\ndata: {\"choices\":[{\"delta\":{}}]}\n\n"
			ctx, _, response, info := newDisconnectingImageStream(t, body, tc.needle)
			info.RelayMode, info.RelayFormat = relayconstant.RelayModeChatCompletions, types.RelayFormatOpenAI
			info.UpstreamModelName = "gpt-4o"
			info.SetEstimatePromptTokens(100)
			usage, apiErr := OaiStreamHandler(ctx, info, response)
			require.Nil(t, apiErr)
			require.NotNil(t, usage)
			assert.Equal(t, relaycommon.StreamEndReasonClientGone, info.StreamStatus.EndReason)
			assert.Equal(t, tc.prompt, usage.PromptTokens)
			assert.Equal(t, tc.completion, usage.CompletionTokens)
		})
	}
}
