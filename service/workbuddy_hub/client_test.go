package hub

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync/atomic"
	"testing"

	workbuddy_hub "github.com/QuantumNous/new-api/setting/workbuddy_hub"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// useHub points the package at a test server for the duration of one test.
func useHub(t *testing.T, serverURL, password string) {
	t.Helper()
	settings := workbuddy_hub.GetWorkBuddyHubSettings()
	previousURL, previousPassword, previousEnabled := settings.BaseURL, settings.PanelPassword, settings.Enabled
	settings.BaseURL = serverURL
	settings.PanelPassword = password
	settings.Enabled = true
	InvalidateSession()
	t.Cleanup(func() {
		settings.BaseURL = previousURL
		settings.PanelPassword = previousPassword
		settings.Enabled = previousEnabled
		InvalidateSession()
	})
}

// TestCallLogsInOnceAndReusesTheSession covers the whole reason this client
// exists: the hub only accepts its own panel token, so the console logs in with
// the password and then keeps using that token for every later call.
func TestCallLogsInOnceAndReusesTheSession(t *testing.T) {
	var logins atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/panel/login":
			logins.Add(1)
			_, _ = w.Write([]byte(`{"ok":true,"token":"session-1"}`))
		case "/accounts":
			assert.Equal(t, "session-1", r.Header.Get("X-Panel-Token"))
			if realms := r.URL.Query()["realm"]; len(realms) > 0 {
				assert.Equal(t, []string{"cn"}, realms)
			}
			_, _ = w.Write([]byte(`{"accounts":[]}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()
	useHub(t, server.URL, "panel-password")

	payload, err := Call(context.Background(), http.MethodGet, "/accounts", url.Values{"realm": {"cn"}}, nil, 0)
	require.NoError(t, err)
	assert.JSONEq(t, `{"accounts":[]}`, string(payload))
	_, err = Call(context.Background(), http.MethodGet, "/accounts", nil, nil, 0)
	require.NoError(t, err)
	assert.EqualValues(t, 1, logins.Load(), "the console must not log in again while its token still works")
}

// TestCallReloginsAfterUnauthorized covers a hub restart or a rotated password:
// the stored token stops working and one retry must recover instead of failing
// every console call until the process restarts.
func TestCallReloginsAfterUnauthorized(t *testing.T) {
	var logins, calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/panel/login" {
			logins.Add(1)
			_, _ = w.Write([]byte(`{"ok":true,"token":"fresh"}`))
			return
		}
		if calls.Add(1) == 1 {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":{"message":"panel password required"}}`))
			return
		}
		assert.Equal(t, "fresh", r.Header.Get("X-Panel-Token"))
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()
	useHub(t, server.URL, "panel-password")

	payload, err := Call(context.Background(), http.MethodPost, "/accounts/test", nil, []byte(`{"uid":"a"}`), 0)
	require.NoError(t, err)
	assert.JSONEq(t, `{"ok":true}`, string(payload))
	assert.EqualValues(t, 2, logins.Load())
}

// TestCallSurfacesHubErrors keeps the hub's own explanation, which is what the
// console shows the operator.
func TestCallSurfacesHubErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/panel/login" {
			_, _ = w.Write([]byte(`{"ok":true,"token":"session-1"}`))
			return
		}
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"message":"account not found"}}`))
	}))
	defer server.Close()
	useHub(t, server.URL, "panel-password")

	_, err := Call(context.Background(), http.MethodPost, "/accounts/set", nil, []byte(`{}`), 0)
	var hubErr *Error
	require.ErrorAs(t, err, &hubErr)
	assert.Equal(t, http.StatusBadRequest, hubErr.Status)
	assert.Equal(t, "account not found", hubErr.Error())
}

// TestCallRefusesWithoutConfiguration keeps a half-configured console from
// dialling anything at all.
func TestCallRefusesWithoutConfiguration(t *testing.T) {
	settings := workbuddy_hub.GetWorkBuddyHubSettings()
	previousPassword := settings.PanelPassword
	settings.PanelPassword = ""
	t.Cleanup(func() { settings.PanelPassword = previousPassword })

	_, err := Call(context.Background(), http.MethodGet, "/health", nil, nil, 0)
	assert.True(t, errors.Is(err, ErrNotConfigured))
}
