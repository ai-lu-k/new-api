package service

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestResetStatusCode(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name             string
		statusCode       int
		statusCodeConfig string
		expectedCode     int
	}{
		{
			name:             "map string value",
			statusCode:       429,
			statusCodeConfig: `{"429":"503"}`,
			expectedCode:     503,
		},
		{
			name:             "map int value",
			statusCode:       429,
			statusCodeConfig: `{"429":503}`,
			expectedCode:     503,
		},
		{
			name:             "skip invalid string value",
			statusCode:       429,
			statusCodeConfig: `{"429":"bad-code"}`,
			expectedCode:     429,
		},
		{
			name:             "skip status code 200",
			statusCode:       200,
			statusCodeConfig: `{"200":503}`,
			expectedCode:     200,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			newAPIError := &types.NewAPIError{
				StatusCode: tc.statusCode,
			}
			ResetStatusCode(newAPIError, tc.statusCodeConfig)
			require.Equal(t, tc.expectedCode, newAPIError.StatusCode)
		})
	}
}

func TestRelayErrorHandlerTruncatesInvalidJSONBodyInLog(t *testing.T) {
	withDebugEnabled(t, false)

	body := strings.Repeat("b", common.LocalLogContentLimit+256)
	var logBuffer bytes.Buffer

	common.LogWriterMu.Lock()
	oldWriter := gin.DefaultErrorWriter
	gin.DefaultErrorWriter = &logBuffer
	common.LogWriterMu.Unlock()
	t.Cleanup(func() {
		common.LogWriterMu.Lock()
		gin.DefaultErrorWriter = oldWriter
		common.LogWriterMu.Unlock()
	})

	resp := &http.Response{
		StatusCode: http.StatusInternalServerError,
		Body:       io.NopCloser(strings.NewReader(body)),
	}

	newAPIError := RelayErrorHandler(context.Background(), resp, false)

	require.NotNil(t, newAPIError)
	require.Equal(t, "bad response status code 500", newAPIError.Error())
	require.Contains(t, logBuffer.String(), "[truncated")
	require.Contains(t, logBuffer.String(), fmt.Sprintf("original_length=%d", len(body)))
	require.NotContains(t, logBuffer.String(), strings.Repeat("b", common.LocalLogContentLimit+1))
}

func TestRelayErrorHandlerKeepsStructuredErrorMessage(t *testing.T) {
	message := strings.Repeat("c", common.LocalLogContentLimit+256)
	body := `{"message":"` + message + `"}`
	resp := &http.Response{
		StatusCode: http.StatusInternalServerError,
		Body:       io.NopCloser(strings.NewReader(body)),
	}

	newAPIError := RelayErrorHandler(context.Background(), resp, false)

	require.NotNil(t, newAPIError)
	require.Equal(t, message, newAPIError.Error())
}

func TestRelayErrorHandlerKeepsOpenAIErrorMessage(t *testing.T) {
	message := strings.Repeat("d", common.LocalLogContentLimit+256)
	body := `{"error":{"message":"` + message + `","type":"server_error","code":"server_error"}}`
	resp := &http.Response{
		StatusCode: http.StatusInternalServerError,
		Body:       io.NopCloser(strings.NewReader(body)),
	}

	newAPIError := RelayErrorHandler(context.Background(), resp, false)

	require.NotNil(t, newAPIError)
	require.Equal(t, message, newAPIError.Error())
}

func TestRelayErrorHandlerClarifies413Message(t *testing.T) {
	t.Parallel()

	// The upstream body may carry the provider's own wording or a masked
	// "temporarily unavailable" note, and a relay may report the same rejection
	// as a 5xx. Either way the client must see the real cause and status.
	const clarified = "请求体过大（通常是历史消息或图片过多），请减少后重试 / request payload too large"
	testCases := []struct {
		name          string
		status        int
		body          string
		wantClarified bool
		wantMessage   string
	}{
		{
			name:          "413 masked wording",
			status:        http.StatusRequestEntityTooLarge,
			body:          `{"error":{"message":"暂时不可用，请稍后重试","type":"invalid_request_error","code":"bad_response_status_code"}}`,
			wantClarified: true,
			wantMessage:   clarified,
		},
		{
			name:          "413 provider wording",
			status:        http.StatusRequestEntityTooLarge,
			body:          `{"error":{"message":"Payload Too Large","type":"server_error"}}`,
			wantClarified: true,
			wantMessage:   clarified,
		},
		{
			name:          "502 wrapped JSON wording",
			status:        http.StatusBadGateway,
			body:          `{"message":"Payload too large. The maximum request body is 4 MB, which is a limit on the encoded request.","type":"upstream_error","code":"bad_response_status_code"}`,
			wantClarified: true,
			wantMessage:   clarified,
		},
		{
			// A relay can answer with a bare-text body; the wording is the only
			// signal left once the JSON decoder has nothing to parse.
			name:          "502 bare text wording",
			status:        http.StatusBadGateway,
			body:          "Payload too large. The maximum request body is 4 MB.",
			wantClarified: true,
			wantMessage:   clarified,
		},
		{
			name:          "502 Chinese wording",
			status:        http.StatusBadGateway,
			body:          `{"error":{"message":"请求体过大，最大 4MB","type":"server_error"}}`,
			wantClarified: true,
			wantMessage:   clarified,
		},
		{
			// Response-side limits are not fixed by shrinking the request.
			name:          "502 response-side limit",
			status:        http.StatusBadGateway,
			body:          `{"error":{"message":"upstream response payload too large","type":"server_error"}}`,
			wantClarified: false,
			wantMessage:   "upstream response payload too large",
		},
		{
			name:          "502 unrelated failure",
			status:        http.StatusBadGateway,
			body:          `{"error":{"message":"upstream connection reset","type":"server_error"}}`,
			wantClarified: false,
			wantMessage:   "upstream connection reset",
		},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			resp := &http.Response{
				StatusCode: tc.status,
				Body:       io.NopCloser(strings.NewReader(tc.body)),
			}

			newAPIError := RelayErrorHandler(context.Background(), resp, false)

			require.NotNil(t, newAPIError)
			require.Equal(t, tc.wantMessage, newAPIError.Error())
			if !tc.wantClarified {
				require.Equal(t, tc.status, newAPIError.StatusCode)
				return
			}
			require.Equal(t, http.StatusRequestEntityTooLarge, newAPIError.StatusCode)
			// The client-facing JSON serializes RelayError's OpenAIError, so the
			// rewrite must land there too, not only on the error string.
			require.Equal(t, clarified, newAPIError.ToOpenAIError().Message)
		})
	}
}

func TestRelayErrorHandlerKeepsInvalidJSONBodyInDebugLog(t *testing.T) {
	withDebugEnabled(t, true)

	body := strings.Repeat("e", common.LocalLogContentLimit+256)
	var logBuffer bytes.Buffer

	common.LogWriterMu.Lock()
	oldWriter := gin.DefaultErrorWriter
	gin.DefaultErrorWriter = &logBuffer
	common.LogWriterMu.Unlock()
	t.Cleanup(func() {
		common.LogWriterMu.Lock()
		gin.DefaultErrorWriter = oldWriter
		common.LogWriterMu.Unlock()
	})

	resp := &http.Response{
		StatusCode: http.StatusInternalServerError,
		Body:       io.NopCloser(strings.NewReader(body)),
	}

	newAPIError := RelayErrorHandler(context.Background(), resp, false)

	require.NotNil(t, newAPIError)
	require.NotContains(t, logBuffer.String(), "[truncated")
	require.Contains(t, logBuffer.String(), body)
}

func TestClientErrorHidesUpstreamIdentity(t *testing.T) {
	t.Parallel()

	relay := func(t *testing.T, statusCode int, body string) types.OpenAIError {
		t.Helper()
		response := &http.Response{
			StatusCode: statusCode,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(body)),
		}
		newAPIError := RelayErrorHandler(context.Background(), response, false)
		require.NotNil(t, newAPIError)
		require.Equal(t, statusCode, newAPIError.StatusCode)
		return newAPIError.ToOpenAIError()
	}

	// A provider's own error type and code name the software it runs; the
	// caller gets the neutral vocabulary instead, while the message it can act
	// on is still delivered.
	got := relay(t, http.StatusBadGateway, `{"error":{"message":"account 42 exhausted","type":"workbuddy_error","code":"11128"}}`)
	require.Equal(t, "upstream_error", got.Type)
	require.Equal(t, "bad_response_status_code", got.Code)
	require.Equal(t, "account 42 exhausted", got.Message)

	// Names the client already understands survive, so clients that branch on
	// them keep working.
	got = relay(t, http.StatusBadRequest, `{"error":{"message":"context too long","type":"invalid_request_error","code":"context_length_exceeded"}}`)
	require.Equal(t, "invalid_request_error", got.Type)
	require.Equal(t, "context_length_exceeded", got.Code)
	require.Equal(t, "context too long", got.Message)
}

func withDebugEnabled(t *testing.T, enabled bool) {
	t.Helper()

	oldDebug := common.DebugEnabled
	common.DebugEnabled = enabled
	t.Cleanup(func() {
		common.DebugEnabled = oldDebug
	})
}
