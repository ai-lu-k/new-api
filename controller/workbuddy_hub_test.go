package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	hub "github.com/QuantumNous/new-api/service/workbuddy_hub"
	workbuddy_hub "github.com/QuantumNous/new-api/setting/workbuddy_hub"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// pointConsoleAtHub aims the console at a fake hub for one test.
func pointConsoleAtHub(t *testing.T, serverURL string) {
	t.Helper()
	settings := workbuddy_hub.GetWorkBuddyHubSettings()
	previousURL, previousPassword, previousEnabled := settings.BaseURL, settings.PanelPassword, settings.Enabled
	settings.BaseURL = serverURL
	settings.PanelPassword = "panel-password"
	settings.Enabled = true
	hub.InvalidateSession()
	t.Cleanup(func() {
		settings.BaseURL = previousURL
		settings.PanelPassword = previousPassword
		settings.Enabled = previousEnabled
		hub.InvalidateSession()
	})
}

// TestWorkbuddyHubCallForwardsOnlyWhitelistedKeys protects the console's whole
// security boundary: the browser names a key, the server owns the path, so a
// dashboard session cannot walk the hub's API.
func TestWorkbuddyHubCallForwardsOnlyWhitelistedKeys(t *testing.T) {
	var requested []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/panel/login" {
			_, _ = w.Write([]byte(`{"ok":true,"token":"session-1"}`))
			return
		}
		requested = append(requested, r.URL.Path)
		_, _ = w.Write([]byte(`{"accounts":[]}`))
	}))
	defer server.Close()
	pointConsoleAtHub(t, server.URL)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Any("/api/workbuddy/call/:key", WorkbuddyHubCall)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/workbuddy/call/accounts?realm=all", nil))
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.JSONEq(t, `{"success":true,"message":"","data":{"accounts":[]}}`, recorder.Body.String())
	assert.Equal(t, []string{"/accounts"}, requested)

	// A key the console never registers stops here instead of being turned into
	// a hub path.
	recorder = httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/workbuddy/call/settings.reveal.nope", nil))
	assert.Contains(t, recorder.Body.String(), `"success":false`)
	assert.Contains(t, recorder.Body.String(), "unknown workbuddy hub call")
	assert.Equal(t, []string{"/accounts"}, requested, "an unlisted key must never reach the hub")
}

// TestWorkbuddyHubCallKeepsTextPayloads covers /logs/export, which answers with
// a text attachment rather than JSON.
func TestWorkbuddyHubCallKeepsTextPayloads(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/panel/login" {
			_, _ = w.Write([]byte(`{"ok":true,"token":"session-1"}`))
			return
		}
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("[INFO] one line\n"))
	}))
	defer server.Close()
	pointConsoleAtHub(t, server.URL)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Any("/api/workbuddy/call/:key", WorkbuddyHubCall)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/workbuddy/call/logs.export", nil))
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.JSONEq(t, `{"success":true,"message":"","data":{"text":"[INFO] one line\n"}}`, recorder.Body.String())
}
