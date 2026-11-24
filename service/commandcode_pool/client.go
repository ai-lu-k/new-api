package commandcode_pool

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	commandcode_pool "github.com/QuantumNous/new-api/setting/commandcode_pool"
)

// Error is a proxy reply that did not carry data. Status is the HTTP status the
// proxy used, which the console maps onto its own wording.
type Error struct {
	Status  int
	Message string
}

func (e *Error) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return fmt.Sprintf("commandcode proxy returned %d", e.Status)
}

// ErrNotConfigured is returned when the console has no proxy address.
var ErrNotConfigured = errors.New("commandcode pool is not configured")

const (
	defaultTimeout  = 60 * time.Second
	maxResponseSize = 8 << 20
)

// The proxy is an operator-configured address on the private network, so the
// default transport applies; every call carries its own deadline.
var httpClient = &http.Client{}

// Call performs one proxy admin request on behalf of the console. The proxy's
// admin API lives inside the private docker network and accepts no credential,
// so every path here is chosen by the caller from a fixed list; query and body
// are forwarded verbatim.
//
// An empty reply (204 from a delete) comes back as an empty slice.
func Call(ctx context.Context, method, path string, body []byte, timeout time.Duration) ([]byte, error) {
	cfg := commandcode_pool.GetCommandCodePoolSettings()
	if !cfg.Configured() {
		return nil, ErrNotConfigured
	}
	if timeout <= 0 {
		timeout = defaultTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	var reader io.Reader
	if len(body) > 0 {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, cfg.Base()+path, reader)
	if err != nil {
		return nil, err
	}
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseSize))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &Error{Status: resp.StatusCode, Message: proxyErrorMessage(payload)}
	}
	return payload, nil
}

// proxyErrorMessage digs the message out of the proxy's error envelope, which is
// {"error":{"message":...}}. Anything else is cut to a short excerpt: a reverse
// proxy in front of the pool can answer with a whole HTML page, and the console
// only has room for the gist of it.
func proxyErrorMessage(payload []byte) string {
	var envelope struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
		Message string `json:"message"`
	}
	if err := common.Unmarshal(payload, &envelope); err != nil {
		return excerpt(payload)
	}
	for _, candidate := range []string{envelope.Error.Message, envelope.Message} {
		if trimmed := strings.TrimSpace(candidate); trimmed != "" {
			return trimmed
		}
	}
	return excerpt(payload)
}

// excerpt keeps the beginning of a non-JSON reply, bounded so a large body
// cannot be replayed through the console.
func excerpt(payload []byte) string {
	const limit = 300
	text := strings.TrimSpace(string(payload))
	if len(text) <= limit {
		return text
	}
	return text[:limit] + "…"
}
