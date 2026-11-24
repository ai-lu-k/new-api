package relay

import (
	"bytes"
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/pkg/relaytrace"
	"github.com/QuantumNous/new-api/relay/channel"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
)

// HandleUpstreamResponse keeps protocol preludes private until meaningful
// output commits the attempt. Only an uncommitted first-output timeout retries;
// no output, usage settlement or concurrency reservation leaks into that retry.
func HandleUpstreamResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo, adaptor channel.Adaptor) (any, *types.NewAPIError) {
	trace := info.TransportTrace
	if !info.IsStream || trace == nil || !trace.HoldingPrelude() {
		return adaptor.DoResponse(c, resp, info)
	}
	writer := &latencyResponseWriter{ResponseWriter: c.Writer, trace: trace}
	original := c.Writer
	c.Writer = writer
	defer func() { c.Writer = original }()
	usage, apiErr := adaptor.DoResponse(c, resp, info)
	if trace.FirstOutputTimeout() && c.Request.Context().Err() == nil {
		return nil, types.NewErrorWithStatusCode(errors.New("upstream did not produce meaningful output before its latency deadline"), types.ErrorCode("upstream_first_output_timeout"), http.StatusBadGateway)
	}
	if apiErr != nil {
		return usage, apiErr
	}
	if trace.HoldingPrelude() && info.StreamStatus != nil && !info.StreamStatus.IsSuccessfulResponse() {
		return nil, types.NewErrorWithStatusCode(errors.New("upstream ended before meaningful output"), types.ErrorCodeEmptyResponse, http.StatusBadGateway)
	}
	if !trace.FirstOutputTimeout() {
		if err := writer.commit(); err != nil {
			return nil, types.NewError(err, types.ErrorCodeBadResponse, types.ErrOptionWithSkipRetry())
		}
	}
	return usage, nil
}

type latencyResponseWriter struct {
	gin.ResponseWriter
	trace   *relaytrace.Attempt
	prelude bytes.Buffer
	status  int
}

func (w *latencyResponseWriter) Write(data []byte) (int, error) {
	if bytes.Equal(data, []byte(": PING\n\n")) {
		return w.ResponseWriter.Write(data)
	}
	if w.trace.FirstOutputTimeout() {
		return len(data), nil
	}
	if w.trace.HoldingPrelude() && w.prelude.Len()+len(data) <= 65536 {
		return w.prelude.Write(data)
	}
	if w.trace.HoldingPrelude() {
		w.trace.Mark("unknown_event", "upstream", 0)
	}
	if err := w.commit(); err != nil {
		return 0, err
	}
	return w.ResponseWriter.Write(data)
}

func (w *latencyResponseWriter) WriteString(data string) (int, error) { return w.Write([]byte(data)) }
func (w *latencyResponseWriter) WriteHeader(status int) {
	if w.trace.HoldingPrelude() {
		w.status = status
		return
	}
	w.ResponseWriter.WriteHeader(status)
}
func (w *latencyResponseWriter) WriteHeaderNow() {
	if !w.trace.HoldingPrelude() {
		w.ResponseWriter.WriteHeaderNow()
	}
}
func (w *latencyResponseWriter) Flush() {
	if !w.trace.HoldingPrelude() || w.ResponseWriter.Written() {
		w.ResponseWriter.Flush()
	}
}
func (w *latencyResponseWriter) commit() error {
	if w.status > 0 {
		w.ResponseWriter.WriteHeader(w.status)
		w.status = 0
	}
	if w.prelude.Len() == 0 {
		return nil
	}
	_, err := w.ResponseWriter.Write(w.prelude.Bytes())
	w.prelude.Reset()
	return err
}
