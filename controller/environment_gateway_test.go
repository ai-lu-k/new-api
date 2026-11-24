package controller

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

const environmentTestOrigin = "https://gateway.example"

// environmentTestGateway mounts the production side of the environment gateway
// in front of a handler standing in for the production build, with a real
// database so a selection can be validated against its login session. It is a
// real HTTP server because the gateway proxies through a reverse proxy, which
// needs a live connection.
func environmentTestGateway(t *testing.T, trustCertificate bool) (*httptest.Server, *http.Cookie) {
	t.Helper()
	previousDB, previousRedis, previousSecret := model.DB, common.RedisEnabled, common.SessionSecret
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}))
	model.DB, common.RedisEnabled, common.SessionSecret = db, false, "environment-gateway-test-secret"
	t.Cleanup(func() {
		model.DB, common.RedisEnabled, common.SessionSecret = previousDB, previousRedis, previousSecret
	})

	admin := &model.User{Username: "admin", Password: "unused", Role: common.RoleAdminUser,
		Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1}
	require.NoError(t, db.Create(admin).Error)
	session, err := service.CreateLoginSession(admin.Id, "password", "127.0.0.1", "agent")
	require.NoError(t, err)
	stored, err := model.GetUserSessionBySID(session.Session.SID)
	require.NoError(t, err)

	parent := service.EnvParent{
		Identity: model.AuthSessionIdentity{UserID: admin.Id, SessionID: stored.SID,
			UserAuthVersion: stored.UserAuthVersion, SessionVersion: stored.Version},
		Username:  admin.Username,
		Role:      common.RoleAdminUser,
		ExpiresAt: time.Now().Add(time.Hour).Unix(),
	}
	raw, _, err := service.IssueEnvironmentSelection(parent, "stage-session-1", "fixture-build", environmentTestOrigin)
	require.NoError(t, err)

	staging := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("staging"))
	}))
	t.Cleanup(staging.Close)
	if trustCertificate {
		trustTestEnvironmentCertificate(t, staging)
	}
	upstream, err := url.Parse(staging.URL)
	require.NoError(t, err)

	config := &service.EnvironmentConfig{
		Role:     "production",
		Upstream: upstream,
		Origin:   environmentTestOrigin,
		UserMap:  map[string]string{admin.Username: admin.Username},
	}
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(EnvironmentGateway(config))
	engine.Any("/*path", func(c *gin.Context) {
		c.String(http.StatusOK, "production")
	})
	server := httptest.NewServer(engine)
	t.Cleanup(server.Close)
	return server, &http.Cookie{Name: "__Host-new_api_environment", Value: raw}
}

func trustTestEnvironmentCertificate(t *testing.T, staging *httptest.Server) {
	t.Helper()
	previous := http.DefaultTransport
	http.DefaultTransport = staging.Client().Transport
	t.Cleanup(func() { http.DefaultTransport = previous })
}

func environmentGet(t *testing.T, server *httptest.Server, path string, cookie *http.Cookie, tag string) (*http.Response, string) {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, server.URL+path, http.NoBody)
	require.NoError(t, err)
	request.AddCookie(cookie)
	request.Header.Set("Origin", environmentTestOrigin)
	request.Header.Set("Sec-Fetch-Site", "same-origin")
	if tag != "" {
		request.Header.Set(service.EnvironmentHeader, tag)
	}
	response, err := server.Client().Do(request)
	require.NoError(t, err)
	defer response.Body.Close()
	body := make([]byte, 64)
	n, _ := response.Body.Read(body)
	return response, string(body[:n])
}

// A request from a page that still declares production must be answered by
// production without deleting the browser's staging selection. Switching
// reloads the page while the outgoing one still has requests in flight; when
// those cleared the cookie, the reloaded staging page fetched its own scripts
// and stylesheets without a selection, they fell through to the production
// build, and the page died on 404s whenever staging was ahead.
func TestEnvironmentGatewayKeepsSelectionForInFlightProductionRequests(t *testing.T) {
	server, cookie := environmentTestGateway(t, true)

	response, body := environmentGet(t, server, "/api/status", cookie, "production")
	assert.Equal(t, http.StatusOK, response.StatusCode)
	assert.Equal(t, "production", body, "production still answers its own page")
	for _, issued := range response.Cookies() {
		if issued.Name == cookie.Name {
			assert.NotEqual(t, -1, issued.MaxAge, "the staging selection must survive")
		}
	}

	// The reloaded staging document then fetches its assets with that selection,
	// and the gateway hands them to the test build rather than to production.
	_, assetBody := environmentGet(t, server, "/static/js/index.fixture.js", cookie, "")
	assert.Equal(t, "staging", assetBody,
		"an asset requested with a staging selection is not served by the production build")
}

func TestEnvironmentGatewayVerifiesStagingCertificate(t *testing.T) {
	defaultTransport := http.DefaultTransport
	providerTransport := defaultTransport.(*http.Transport).Clone()
	providerTransport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	http.DefaultTransport = providerTransport
	t.Cleanup(func() { http.DefaultTransport = defaultTransport })

	server, cookie := environmentTestGateway(t, false)
	response, body := environmentGet(t, server, "/static/js/index.fixture.js", cookie, "")

	assert.Equal(t, http.StatusBadGateway, response.StatusCode)
	assert.Contains(t, body, "ENVIRONMENT_UNAVAILABLE")
}

// Returning to production is still what drops the selection.
func TestEnvironmentGatewayDropsSelectionOnExplicitReturn(t *testing.T) {
	server, cookie := environmentTestGateway(t, true)

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api/environment", http.NoBody)
	require.NoError(t, err)
	request.AddCookie(cookie)
	request.Header.Set("Origin", environmentTestOrigin)
	request.Header.Set("Sec-Fetch-Site", "same-origin")
	request.Header.Set("Content-Type", "application/json")
	response, err := server.Client().Do(request)
	require.NoError(t, err)
	defer response.Body.Close()

	assert.Equal(t, http.StatusBadRequest, response.StatusCode,
		"the body still has to name an environment")
}

// The test environment renders the bundle the browser adopts as its identity,
// so an administrator previewing the ordinary-user view must be rendered as a
// user there too. Otherwise the switched page keeps its administrator
// navigation while every administrator request is refused.
func TestEnvironmentStagingBundleHonoursTheOrdinaryUserPreview(t *testing.T) {
	previousDB, previousRedis, previousSecret := model.DB, common.RedisEnabled, common.SessionSecret
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}))
	model.DB, common.RedisEnabled, common.SessionSecret = db, false, "environment-preview-test-secret"
	t.Cleanup(func() {
		model.DB, common.RedisEnabled, common.SessionSecret = previousDB, previousRedis, previousSecret
	})

	admin := &model.User{Username: "admin", Password: "unused", Role: common.RoleAdminUser,
		Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1}
	require.NoError(t, db.Create(admin).Error)

	parent := service.EnvParent{
		Identity: model.AuthSessionIdentity{UserID: admin.Id, SessionID: "production-session",
			UserAuthVersion: 1, SessionVersion: 1},
		Username:  admin.Username,
		Role:      common.RoleAdminUser,
		ExpiresAt: time.Now().Add(time.Hour).Unix(),
	}
	loadConfig := func(role string) *service.EnvironmentConfig {
		t.Setenv("APP_ENVIRONMENT_ROLE", role)
		t.Setenv("APP_ENVIRONMENT_ORIGIN", environmentTestOrigin)
		t.Setenv("APP_ENVIRONMENT_BRIDGE_SECRET", "controller-environment-preview-test-key-32")
		t.Setenv("APP_ENVIRONMENT_UPSTREAM", "")
		t.Setenv("APP_ENVIRONMENT_USER_MAP", "")
		if role == "production" {
			t.Setenv("APP_ENVIRONMENT_UPSTREAM", "https://staging.example.test")
			t.Setenv("APP_ENVIRONMENT_USER_MAP", `{"admin":"admin"}`)
		}
		config, err := service.LoadEnvironmentConfig()
		require.NoError(t, err)
		return config
	}
	productionConfig := loadConfig("production")
	stagingConfig := loadConfig("staging")
	gateway := &environmentGateway{config: stagingConfig, client: &http.Client{Timeout: time.Second}}

	tests := []struct {
		name       string
		preview    bool
		wantRole   float64
		wantActive bool
	}{
		{name: "ordinary view", preview: true, wantRole: float64(common.RoleCommonUser), wantActive: true},
		{name: "administrator view", preview: false, wantRole: float64(common.RoleAdminUser)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, environmentTestOrigin+environmentBootstrapPath, http.NoBody)
			if tt.preview {
				request.Header.Set(middleware.PreviewRoleHeader, "user")
			}
			ticket, err := service.SignEnvironmentRequest(productionConfig, request, nil, parent)
			require.NoError(t, err)
			request.Header.Set(service.EnvironmentTicketHeader, ticket)

			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = request

			gateway.receive(ctx)

			require.Equal(t, http.StatusOK, recorder.Code)
			var body struct {
				Success bool              `json:"success"`
				Data    environmentBundle `json:"data"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &body))
			require.True(t, body.Success)
			assert.Equal(t, tt.wantRole, body.Data.User["role"])
			assert.Equal(t, tt.wantActive, body.Data.User["preview_active"])
		})
	}
}
