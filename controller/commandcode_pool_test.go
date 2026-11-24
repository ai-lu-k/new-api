package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	pool "github.com/QuantumNous/new-api/service/commandcode_pool"
	commandcode_pool "github.com/QuantumNous/new-api/setting/commandcode_pool"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// pointConsoleAtPool aims the console at a fake CommandCode proxy for one test.
func pointConsoleAtPool(t *testing.T, serverURL string) {
	t.Helper()
	settings := commandcode_pool.GetCommandCodePoolSettings()
	previousURL, previousEnabled := settings.BaseURL, settings.Enabled
	settings.BaseURL = serverURL
	settings.Enabled = true
	t.Cleanup(func() {
		settings.BaseURL = previousURL
		settings.Enabled = previousEnabled
	})
}

// commandCodePoolTestRouter mirrors the console routes registered in
// router/api-router.go, so a test proves the handler-to-proxy mapping the page
// relies on.
func commandCodePoolTestRouter() *gin.Engine {
	router := gin.New()
	group := router.Group("/api/commandcode-pool")
	group.GET("/status", GetCommandCodePoolStatus)
	group.GET("/overview", GetCommandCodePoolOverview)
	group.GET("/pool", GetCommandCodePoolState)
	group.GET("/keys/:id/credits", GetCommandCodePoolKeyCredits)
	group.POST("/keys", CreateCommandCodePoolKey)
	group.POST("/keys/refresh-credits", RefreshCommandCodePoolCredits)
	group.PATCH("/keys/:id", UpdateCommandCodePoolKey)
	group.DELETE("/keys/:id", DeleteCommandCodePoolKey)
	group.PUT("/lb", UpdateCommandCodePoolLB)
	group.PUT("/settings", UpdateCommandCodePoolSettings)
	return router
}

type poolCall struct {
	method string
	path   string
	body   string
}

// TestCommandCodePoolForwardsFixedProxyPaths protects the console's security
// boundary: the browser picks a console route, the server owns the proxy path.
func TestCommandCodePoolForwardsFixedProxyPaths(t *testing.T) {
	var calls []poolCall
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := make([]byte, r.ContentLength)
		if r.ContentLength > 0 {
			_, _ = r.Body.Read(body)
		}
		calls = append(calls, poolCall{method: r.Method, path: r.URL.Path, body: string(body)})
		if r.Method == http.MethodDelete {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.URL.Path == "/admin/api/keys" && r.Method == http.MethodGet {
			_, _ = w.Write([]byte(`{"apiBase":"https://api.commandcode.ai","keys":[{"id":"k1","enabled":true},{"id":"k2","enabled":false}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()
	pointConsoleAtPool(t, server.URL)

	gin.SetMode(gin.TestMode)
	router := commandCodePoolTestRouter()

	cases := []struct {
		name   string
		method string
		target string
		body   string
		want   poolCall
	}{
		{"pool snapshot", http.MethodGet, "/api/commandcode-pool/pool", "", poolCall{http.MethodGet, "/admin/api/keys", ""}},
		{"pool overview", http.MethodGet, "/api/commandcode-pool/overview", "", poolCall{http.MethodGet, "/admin/api/overview", ""}},
		{"add key", http.MethodPost, "/api/commandcode-pool/keys", `{"key":"user_abc"}`, poolCall{http.MethodPost, "/admin/api/keys", `{"key":"user_abc"}`}},
		{"edit key", http.MethodPatch, "/api/commandcode-pool/keys/k1", `{"enabled":false}`, poolCall{http.MethodPatch, "/admin/api/keys/k1", `{"enabled":false}`}},
		{"delete key", http.MethodDelete, "/api/commandcode-pool/keys/k1", "", poolCall{http.MethodDelete, "/admin/api/keys/k1", ""}},
		{"key credits", http.MethodGet, "/api/commandcode-pool/keys/k1/credits", "", poolCall{http.MethodGet, "/admin/api/keys/k1/credits", ""}},
		{"refresh all credits", http.MethodPost, "/api/commandcode-pool/keys/refresh-credits", "", poolCall{http.MethodPost, "/admin/api/keys/refresh-credits", ""}},
		{"load balancing", http.MethodPut, "/api/commandcode-pool/lb", `{"strategy":"sticky"}`, poolCall{http.MethodPut, "/admin/api/lb", `{"strategy":"sticky"}`}},
		{"settings", http.MethodPut, "/api/commandcode-pool/settings", `{"mode":"request"}`, poolCall{http.MethodPut, "/admin/api/settings", `{"mode":"request"}`}},
	}
	for _, tc := range cases {
		calls = nil
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(tc.method, tc.target, strings.NewReader(tc.body))
		if tc.body != "" {
			request.Header.Set("Content-Type", "application/json")
		}
		router.ServeHTTP(recorder, request)

		require.Equal(t, http.StatusOK, recorder.Code, tc.name)
		assert.Contains(t, recorder.Body.String(), `"success":true`, tc.name)
		require.Len(t, calls, 1, tc.name)
		assert.Equal(t, tc.want, calls[0], tc.name)
	}

	// A delete carries no payload, so the console gets an empty success rather
	// than a JSON parse failure.
	assert.Contains(t, lastPoolEnvelope(t, router, http.MethodDelete, "/api/commandcode-pool/keys/k1"), `"data":null`)
}

func lastPoolEnvelope(t *testing.T, router *gin.Engine, method, target string) string {
	t.Helper()
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(method, target, nil))
	return recorder.Body.String()
}

// TestCommandCodePoolRejectsUnlistedKeyIDs keeps a dashboard session from
// addressing another proxy admin path through the key id.
func TestCommandCodePoolRejectsUnlistedKeyIDs(t *testing.T) {
	var requested []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requested = append(requested, r.URL.Path)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()
	pointConsoleAtPool(t, server.URL)

	gin.SetMode(gin.TestMode)
	router := commandCodePoolTestRouter()

	// Ids the router accepts but the proxy never generates are refused here; an
	// encoded separator does not even match the route.
	for _, id := range []string{"a.b", "a%20b"} {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPatch, "/api/commandcode-pool/keys/"+id, strings.NewReader(`{}`)))
		assert.Contains(t, recorder.Body.String(), `"success":false`, id)
	}
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPatch, "/api/commandcode-pool/keys/a%2Fb", strings.NewReader(`{}`)))
	assert.NotEqual(t, http.StatusOK, recorder.Code, "an encoded separator must not match the key route")
	assert.Empty(t, requested, "an invalid key id must never reach the proxy")
}

// TestCommandCodePoolKeepsProxyWording checks that the proxy's own explanation
// travels back to the console instead of a generic failure.
func TestCommandCodePoolKeepsProxyWording(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusConflict)
		_, _ = w.Write([]byte(`{"error":{"message":"key already exists","type":"conflict"}}`))
	}))
	defer server.Close()
	pointConsoleAtPool(t, server.URL)

	gin.SetMode(gin.TestMode)
	router := commandCodePoolTestRouter()

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/commandcode-pool/keys", strings.NewReader(`{"key":"user_abc"}`)))
	assert.Contains(t, recorder.Body.String(), `"success":false`)
	assert.Contains(t, recorder.Body.String(), "key already exists")
}

// TestCommandCodePoolStatusCountsKeys covers the console's health strip: the
// console needs to know whether the proxy answers and how big the pool is.
func TestCommandCodePoolStatusCountsKeys(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/admin/api/keys", r.URL.Path)
		_, _ = w.Write([]byte(`{"apiBase":"https://api.commandcode.ai","keys":[{"enabled":true},{"enabled":true},{"enabled":false}]}`))
	}))
	defer server.Close()
	pointConsoleAtPool(t, server.URL)

	gin.SetMode(gin.TestMode)
	router := commandCodePoolTestRouter()

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/commandcode-pool/status", nil))
	body := recorder.Body.String()
	assert.Contains(t, body, `"reachable":true`)
	assert.Contains(t, body, `"keys_total":3`)
	assert.Contains(t, body, `"keys_enabled":2`)
	assert.Contains(t, body, "https://api.commandcode.ai")

	// A proxy that is down is reported, not hidden behind a success page.
	settings := commandcode_pool.GetCommandCodePoolSettings()
	settings.BaseURL = "http://127.0.0.1:1"
	recorder = httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/commandcode-pool/status", nil))
	assert.Contains(t, recorder.Body.String(), `"reachable":false`)
	assert.Contains(t, recorder.Body.String(), "commandcode pool is unreachable")

	// An unconfigured pool answers the same call without guessing an address.
	settings.Enabled = false
	recorder = httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/commandcode-pool/pool", nil))
	assert.Contains(t, recorder.Body.String(), "commandcode pool is not configured")
}

// TestCommandCodePoolErrorNames checks the messages the console shows for the
// three failures it can meet.
func TestCommandCodePoolErrorNames(t *testing.T) {
	assert.Equal(t, "commandcode pool is not configured", commandCodePoolErrorMessage(pool.ErrNotConfigured))
	assert.Equal(t, "upstream is down", commandCodePoolErrorMessage(&pool.Error{Status: http.StatusBadGateway, Message: "upstream is down"}))
	assert.Contains(t, commandCodePoolErrorMessage(errString("boom")), "commandcode pool is unreachable: boom")
}

type errString string

func (e errString) Error() string { return string(e) }
