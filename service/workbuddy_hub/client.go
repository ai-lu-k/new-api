package hub

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	workbuddy_hub "github.com/QuantumNous/new-api/setting/workbuddy_hub"
)

// Error is a hub reply that did not carry data. Status is the HTTP status the
// hub used, which the console maps onto its own wording.
type Error struct {
	Status  int
	Message string
}

func (e *Error) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return fmt.Sprintf("workbuddy hub returned %d", e.Status)
}

// ErrNotConfigured is returned when the console has no hub address or password.
var ErrNotConfigured = errors.New("workbuddy hub is not configured")

const (
	loginPath       = "/panel/login"
	defaultTimeout  = 60 * time.Second
	maxResponseSize = 64 << 20
)

// The hub is an operator-configured address on the private network, so the
// default transport applies; every call carries its own deadline.
var httpClient = &http.Client{}

var (
	sessionMu     sync.Mutex
	sessionToken  string
	sessionSecret string
)

// Call performs one hub request on behalf of the console. The hub only accepts
// its own panel session token, so the first call of a process logs in with the
// configured password and every later call reuses the token. A 401 (the hub
// restarted, or the password was rotated) drops the token and retries once.
//
// path must start with "/" and is always chosen by the caller from a fixed
// whitelist; query and body are forwarded verbatim.
func Call(ctx context.Context, method, path string, query url.Values, body []byte, timeout time.Duration) ([]byte, error) {
	cfg := workbuddy_hub.GetWorkBuddyHubSettings()
	if !cfg.Configured() {
		return nil, ErrNotConfigured
	}
	if timeout <= 0 {
		timeout = defaultTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	payload, status, err := callOnce(ctx, cfg, method, path, query, body)
	if status == http.StatusUnauthorized {
		dropSession()
		payload, status, err = callOnce(ctx, cfg, method, path, query, body)
	}
	if err != nil {
		return nil, err
	}
	if status < 200 || status >= 300 {
		return nil, &Error{Status: status, Message: hubErrorMessage(payload)}
	}
	return payload, nil
}

func callOnce(ctx context.Context, cfg *workbuddy_hub.Settings, method, path string, query url.Values, body []byte) ([]byte, int, error) {
	token, err := ensureSession(ctx, cfg)
	if err != nil {
		return nil, 0, err
	}
	target := cfg.Base() + path
	if len(query) > 0 {
		target += "?" + query.Encode()
	}
	var reader io.Reader
	if len(body) > 0 {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, target, reader)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("X-Panel-Token", token)
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseSize))
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return payload, resp.StatusCode, nil
}

// ensureSession returns a live panel token, logging in when there is none.
func ensureSession(ctx context.Context, cfg *workbuddy_hub.Settings) (string, error) {
	password := cfg.PanelPassword
	sessionMu.Lock()
	defer sessionMu.Unlock()
	if sessionToken != "" && sessionSecret == password {
		return sessionToken, nil
	}
	loginBody, err := common.Marshal(map[string]string{"password": password})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.Base()+loginPath, bytes.NewReader(loginBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return "", &Error{Status: http.StatusUnauthorized, Message: "invalid workbuddy hub panel password"}
	}
	if resp.StatusCode != http.StatusOK {
		return "", &Error{Status: resp.StatusCode, Message: hubErrorMessage(payload)}
	}
	var login struct {
		Token string `json:"token"`
	}
	if err := common.Unmarshal(payload, &login); err != nil {
		return "", err
	}
	if login.Token == "" {
		return "", &Error{Status: http.StatusBadGateway, Message: "workbuddy hub did not return a panel token"}
	}
	sessionToken = login.Token
	sessionSecret = password
	return sessionToken, nil
}

func dropSession() {
	sessionMu.Lock()
	sessionToken = ""
	sessionMu.Unlock()
}

// InvalidateSession forgets the cached token, e.g. after the password changed.
func InvalidateSession() {
	dropSession()
}

// hubErrorMessage digs the message out of the hub's error envelope, which is
// either {"error":{"message":...}} or a plain string field.
func hubErrorMessage(payload []byte) string {
	var envelope struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
		Message string `json:"message"`
		Detail  string `json:"detail"`
	}
	if err := common.Unmarshal(payload, &envelope); err != nil {
		return strings.TrimSpace(string(payload))
	}
	for _, candidate := range []string{envelope.Error.Message, envelope.Message, envelope.Detail} {
		if trimmed := strings.TrimSpace(candidate); trimmed != "" {
			return trimmed
		}
	}
	return strings.TrimSpace(string(payload))
}
