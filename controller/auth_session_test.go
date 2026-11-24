package controller

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestAuthLogoutRejectsRefreshCookieSessionMismatch(t *testing.T) {
	previousDB := model.DB
	previousRedis := common.RedisEnabled
	previousSecret := common.SessionSecret
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}))
	model.DB = db
	common.RedisEnabled = false
	common.SessionSecret = "auth-logout-mismatch-test-secret"
	t.Cleanup(func() {
		model.DB = previousDB
		common.RedisEnabled = previousRedis
		common.SessionSecret = previousSecret
	})

	user := &model.User{
		Username: "logout-mismatch-user", Password: "unused", Role: common.RoleCommonUser,
		Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1,
	}
	require.NoError(t, db.Create(user).Error)
	sessionA, err := service.CreateLoginSession(user.Id, "password", "127.0.0.1", "agent-a")
	require.NoError(t, err)
	sessionB, err := service.CreateLoginSession(user.Id, "password", "127.0.0.1", "agent-b")
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/user/auth/logout", nil)
	c.Request.Header.Set("Authorization", "Bearer "+sessionA.AccessToken)
	c.Request.Header.Set("X-Auth-Session", sessionA.Session.SID)
	c.Request.AddCookie(&http.Cookie{Name: service.RefreshCookieName, Value: sessionB.RefreshToken})

	AuthLogout(c)

	assert.Equal(t, http.StatusConflict, recorder.Code)
	var response struct {
		Success bool   `json:"success"`
		Code    string `json:"code"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
	assert.Equal(t, "AUTH_SESSION_MISMATCH", response.Code)
	for _, sid := range []string{sessionA.Session.SID, sessionB.Session.SID} {
		stored, err := model.GetUserSessionBySID(sid)
		require.NoError(t, err)
		assert.Equal(t, model.UserSessionStatusActive, stored.Status)
	}
}

func TestEnvironmentGatewayBrowserIsolation(t *testing.T) {
	ordinary, _ := setupSecurityEnrollmentTest(t)
	admin := &model.User{Username: "production-admin", Role: common.RoleRootUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "env-production"}
	stageAdmin := &model.User{Username: "staging-admin", Password: ordinary.Password, Role: common.RoleRootUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "env-staging"}
	require.NoError(t, model.DB.Create(admin).Error)
	require.NoError(t, model.DB.Create(stageAdmin).Error)
	productionLogin, err := service.CreateLoginSession(admin.Id, "password", "127.0.0.1", "environment-test")
	require.NoError(t, err)
	ordinaryLogin, err := service.CreateLoginSession(ordinary.Id, "password", "127.0.0.1", "environment-test")
	require.NoError(t, err)

	const origin = "http://127.0.0.1:5342"
	t.Setenv("APP_ENVIRONMENT_ORIGIN", origin)
	t.Setenv("APP_ENVIRONMENT_BRIDGE_SECRET", "environment-gateway-independent-key-32-bytes")
	t.Setenv("APP_ENVIRONMENT_ROLE", "staging")
	t.Setenv("APP_ENVIRONMENT_UPSTREAM", "")
	t.Setenv("APP_ENVIRONMENT_USER_MAP", "")
	staging, err := service.LoadEnvironmentConfig()
	require.NoError(t, err)
	stageRouter := gin.New()
	stageRouter.Use(EnvironmentGateway(staging))
	stageRouter.POST("/api/user/auth/logout", AuthLogout)
	stageRouter.POST("/api/probe", middleware.UserAuth(), func(c *gin.Context) {
		assert.Empty(t, c.GetHeader("Cookie"))
		assert.Empty(t, c.GetHeader(service.EnvironmentTicketHeader))
		c.Header("Set-Cookie", "stage_credential=must-not-escape; Path=/")
		c.JSON(http.StatusOK, gin.H{"user_id": c.GetInt("id"), "environment": "staging"})
	})
	stageRouter.POST("/api/proof", middleware.UserAuth(), func(c *gin.Context) {
		if middleware.RequireSecurityProof(c, service.VerificationOperation{Scope: service.VerificationScopeTokenPlanKeyRead}) == nil {
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
	})
	stageRouter.GET("/", func(c *gin.Context) { c.String(http.StatusOK, "staging document") })
	for _, path := range []string{"/dashboard/overview", "/assets/environment-test.js"} {
		stageRouter.GET(path, func(c *gin.Context) { c.String(http.StatusOK, "staging document") })
		stageRouter.HEAD(path, func(c *gin.Context) { c.Status(http.StatusOK) })
	}
	stageServer := httptest.NewTLSServer(stageRouter)
	t.Cleanup(stageServer.Close)
	trustTestEnvironmentCertificate(t, stageServer)
	t.Setenv("APP_ENVIRONMENT_ROLE", "production")
	t.Setenv("APP_ENVIRONMENT_UPSTREAM", "https://staging.example.test")
	t.Setenv("APP_ENVIRONMENT_USER_MAP", `{"production-admin":"staging-admin"}`)
	production, err := service.LoadEnvironmentConfig()
	require.NoError(t, err)
	production.Upstream, err = url.Parse(stageServer.URL)
	require.NoError(t, err)
	productionRouter := gin.New()
	productionRouter.Use(EnvironmentGateway(production))
	productionWrites := 0
	productionRouter.POST("/api/probe", func(c *gin.Context) {
		productionWrites++
		c.String(http.StatusOK, "production write")
	})
	productionRouter.POST("/v1/chat/completions", func(c *gin.Context) { c.String(http.StatusOK, "production API") })
	productionRouter.GET("/", func(c *gin.Context) { c.String(http.StatusOK, "production document") })

	for _, path := range []string{"/dashboard/overview", "/assets/environment-test.js", "/dashboard/billing/subscription", "/dashboard/billing/usage"} {
		productionRouter.GET(path, func(c *gin.Context) { c.String(http.StatusOK, "production document") })
		productionRouter.HEAD(path, func(c *gin.Context) { c.Status(http.StatusOK) })
	}

	// Tag alone, foreign origin, ordinary users and API keys cannot select staging.
	for _, test := range []struct {
		bearer, requestOrigin, tag string
		status                     int
	}{
		{ordinaryLogin.AccessToken, origin, "production", http.StatusForbidden},
		{"sk-fake-api-key", origin, "production", http.StatusUnauthorized},
		{productionLogin.AccessToken, "https://foreign.example", "production", http.StatusForbidden},
		{productionLogin.AccessToken, origin, "staging", http.StatusConflict},
	} {
		request := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/environment", strings.NewReader(`{"environment":"staging"}`))
		request.Header.Set("Origin", test.requestOrigin)
		request.Header.Set(service.EnvironmentHeader, test.tag)
		request.Header.Set("Authorization", "Bearer "+test.bearer)
		response := httptest.NewRecorder()
		productionRouter.ServeHTTP(response, request)
		assert.Equal(t, test.status, response.Code)
	}
	request := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/environment", strings.NewReader(`{"environment":"staging"}`))
	request.Header.Set("Origin", origin)
	request.Header.Set("Authorization", "Bearer "+productionLogin.AccessToken)
	request.AddCookie(&http.Cookie{Name: service.RefreshCookieName, Value: productionLogin.RefreshToken})
	response := httptest.NewRecorder()
	productionRouter.ServeHTTP(response, request)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	require.Len(t, response.Result().Cookies(), 1)
	selection := response.Result().Cookies()[0]
	assert.Equal(t, environmentSelectionCookie, selection.Name)
	assert.True(t, selection.HttpOnly)
	assert.Equal(t, http.SameSiteStrictMode, selection.SameSite)
	assert.NotContains(t, response.Body.String(), "access_token")

	// Console documents and assets must follow the selected environment, while
	// compatibility billing APIs keep the production destination.
	for _, path := range []string{"/dashboard/overview", "/assets/environment-test.js", "/dashboard/billing/subscription", "/dashboard/billing/usage"} {
		for _, method := range []string{http.MethodGet, http.MethodHead} {
			request = httptest.NewRequestWithContext(t.Context(), method, path, nil)
			request.Header.Set("Accept", "text/html")
			request.AddCookie(selection)
			response = httptest.NewRecorder()
			productionRouter.ServeHTTP(response, request)
			assert.Equal(t, http.StatusOK, response.Code, path)
			if strings.HasPrefix(path, "/dashboard/billing/") {
				assert.Empty(t, response.Header().Get(service.EnvironmentHeader), path)
				if method == http.MethodGet {
					assert.Equal(t, "production document", response.Body.String(), path)
				}
			} else {
				assert.Equal(t, "staging", response.Header().Get(service.EnvironmentHeader), path)
				if method == http.MethodGet {
					assert.Equal(t, "staging document", response.Body.String(), path)
				}
			}
		}
	}

	for _, test := range []struct {
		cookie, requestOrigin, tag string
		status                     int
	}{
		{"invalid-selection", origin, "", http.StatusSeeOther},
		{"", origin, "staging", http.StatusConflict},
		{selection.Value, "https://foreign.example", "", http.StatusForbidden},
	} {
		request = httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/dashboard/overview", nil)
		request.Header.Set("Origin", test.requestOrigin)
		request.Header.Set(service.EnvironmentHeader, test.tag)
		if test.cookie != "" {
			request.AddCookie(&http.Cookie{Name: selection.Name, Value: test.cookie})
		}
		response = httptest.NewRecorder()
		productionRouter.ServeHTTP(response, request)
		assert.Equal(t, test.status, response.Code)
	}

	// Reload obtains a local staging JWT through the existing production refresh.
	request = httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/user/auth/refresh", nil)
	request.Header.Set("Origin", origin)
	request.Header.Set(service.EnvironmentHeader, "staging")
	request.AddCookie(selection)
	request.AddCookie(&http.Cookie{Name: service.RefreshCookieName, Value: productionLogin.RefreshToken})
	response = httptest.NewRecorder()
	productionRouter.ServeHTTP(response, request)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	var refreshed struct {
		Success bool              `json:"success"`
		Data    environmentBundle `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &refreshed))
	require.True(t, refreshed.Success)
	stageBundle := refreshed.Data
	stageIdentity, err := service.ParseAccessToken(stageBundle.AccessToken)
	require.NoError(t, err)
	assert.Equal(t, stageAdmin.Id, stageIdentity.UserID)
	assert.NotEqual(t, admin.Id, stageIdentity.UserID)
	var refreshCookie *http.Cookie
	for _, cookie := range response.Result().Cookies() {
		if cookie.Name == environmentSelectionCookie {
			selection = cookie
		}
		if cookie.Name == service.RefreshCookieName {
			refreshCookie = cookie
		}
	}
	require.NotNil(t, refreshCookie)
	refreshSID, ok := service.RefreshTokenSID(refreshCookie.Value)
	require.True(t, ok)
	assert.Equal(t, productionLogin.Session.SID, refreshSID)

	for _, test := range []struct {
		tag, bearer string
		status      int
	}{
		{"staging", stageBundle.AccessToken, http.StatusOK},
		{"staging", productionLogin.AccessToken, http.StatusUnauthorized},
		{"staging", "sk-fake-api-key", http.StatusForbidden},
	} {
		request = httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/probe", strings.NewReader(`{"write":true}`))
		request.Header.Set("Origin", origin)
		request.Header.Set(service.EnvironmentHeader, test.tag)
		request.Header.Set("Authorization", "Bearer "+test.bearer)
		request.AddCookie(selection)
		request.AddCookie(refreshCookie)
		response = httptest.NewRecorder()
		productionRouter.ServeHTTP(response, request)
		assert.Equal(t, test.status, response.Code, response.Body.String())
		assert.Empty(t, response.Result().Cookies())
		if test.status == http.StatusOK {
			assert.Contains(t, response.Body.String(), `"environment":"staging"`)
			assert.Equal(t, "private, no-store", response.Header().Get("Cache-Control"))
		}
	}
	assert.Zero(t, productionWrites)

	// A production page that still carries a staging selection is served from
	// production, and the selection survives. Answering 409 here made the
	// browser reload, send the same tagged requests again, and loop until the
	// host blocked the address. Deleting the cookie fixed the loop but broke the
	// switch: the outgoing page still has requests in flight while the reloaded
	// staging document is parsing, and those requests removed the selection the
	// document's own scripts and stylesheets needed, so they fell through to the
	// production build and 404'd whenever staging ran a newer build.
	request = httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/probe", strings.NewReader(`{"write":true}`))
	request.Header.Set("Origin", origin)
	request.Header.Set(service.EnvironmentHeader, "production")
	request.Header.Set("Authorization", "Bearer "+productionLogin.AccessToken)
	request.AddCookie(selection)
	request.AddCookie(refreshCookie)
	response = httptest.NewRecorder()
	productionRouter.ServeHTTP(response, request)
	assert.Equal(t, http.StatusOK, response.Code, response.Body.String())
	assert.Equal(t, "production write", response.Body.String())
	assert.Empty(t, response.Result().Cookies(), "a stale page must not delete the browser's selection")
	assert.Equal(t, 1, productionWrites)
	productionWrites = 0

	request = httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/v1/chat/completions", nil)
	request.Header.Set(service.EnvironmentHeader, "staging")
	request.AddCookie(selection)
	response = httptest.NewRecorder()
	productionRouter.ServeHTTP(response, request)
	assert.Equal(t, "production API", response.Body.String())

	// Sensitive proofs use the real staging SID, and remain single-use.
	proof := issueSecurityEnrollmentProof(t, stageIdentity, service.VerificationOperation{Scope: service.VerificationScopeTokenPlanKeyRead}, "password")
	for index := range 2 {
		request = httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/proof", nil)
		request.Header.Set("Origin", origin)
		request.Header.Set(service.EnvironmentHeader, "staging")
		request.Header.Set("Authorization", "Bearer "+stageBundle.AccessToken)
		request.Header.Set("X-Security-Proof", proof)
		request.AddCookie(selection)
		response = httptest.NewRecorder()
		productionRouter.ServeHTTP(response, request)
		if index == 0 {
			assert.Equal(t, http.StatusOK, response.Code, response.Body.String())
		} else {
			assert.NotEqual(t, http.StatusOK, response.Code)
		}
	}
	request = httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/user/auth/logout", nil)
	request.Header.Set("Authorization", "Bearer "+stageBundle.AccessToken)
	request.Header.Set("X-Auth-Session", stageBundle.Session.SID)
	response = httptest.NewRecorder()
	stageRouter.ServeHTTP(response, request)
	assert.Equal(t, http.StatusForbidden, response.Code)
	stored, err := model.GetUserSessionBySID(stageBundle.Session.SID)
	require.NoError(t, err)
	assert.Equal(t, model.UserSessionStatusActive, stored.Status)

	// An account changed in another tab retains its new login and clears only routing.
	request = httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/user/auth/refresh", nil)
	request.Header.Set("Origin", origin)
	request.Header.Set(service.EnvironmentHeader, "staging")
	request.AddCookie(selection)
	request.AddCookie(&http.Cookie{Name: service.RefreshCookieName, Value: ordinaryLogin.RefreshToken})
	response = httptest.NewRecorder()
	productionRouter.ServeHTTP(response, request)
	assert.Equal(t, http.StatusConflict, response.Code)
	assert.Contains(t, response.Body.String(), "ENVIRONMENT_CHANGED")
	require.Len(t, response.Result().Cookies(), 1)
	assert.Equal(t, environmentSelectionCookie, response.Result().Cookies()[0].Name)
	assert.Equal(t, -1, response.Result().Cookies()[0].MaxAge)
	_, _, err = service.ValidateLoginSession(service.AuthIdentity{UserID: ordinary.Id, SessionID: ordinaryLogin.Session.SID, SessionVersion: 1, UserAuthVersion: 1})
	require.NoError(t, err)

	stageServer.Close()
	for _, test := range []struct {
		method, path string
		status       int
	}{
		{http.MethodPost, "/api/probe", http.StatusBadGateway},
		{http.MethodGet, "/api/probe", http.StatusBadGateway},
		{http.MethodGet, "/", http.StatusSeeOther},
		{http.MethodGet, "/dashboard/overview", http.StatusSeeOther},
	} {
		request = httptest.NewRequestWithContext(t.Context(), test.method, test.path, nil)
		request.Header.Set("Origin", origin)
		request.Header.Set(service.EnvironmentHeader, "staging")
		request.Header.Set("Authorization", "Bearer "+stageBundle.AccessToken)
		request.AddCookie(selection)
		request.Header.Set("Accept", "text/html")
		response = httptest.NewRecorder()
		productionRouter.ServeHTTP(response, request)
		assert.Equal(t, test.status, response.Code)
		if test.path == "/" || test.path == "/dashboard/overview" {
			assert.Equal(t, "/", response.Header().Get("Location"))
		}
	}
	assert.Zero(t, productionWrites)
	request = httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/environment", strings.NewReader(`{"environment":"production"}`))
	request.Header.Set("Origin", origin)
	request.Header.Set(service.EnvironmentHeader, "staging")
	request.AddCookie(selection)
	response = httptest.NewRecorder()
	productionRouter.ServeHTTP(response, request)
	assert.Equal(t, http.StatusOK, response.Code)
	assert.Equal(t, -1, response.Result().Cookies()[0].MaxAge)

	request = httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/environment", strings.NewReader(`{"environment":"production"}`))
	request.Header.Set("Origin", "https://foreign.example")
	request.AddCookie(selection)
	response = httptest.NewRecorder()
	productionRouter.ServeHTTP(response, request)
	assert.Equal(t, http.StatusForbidden, response.Code)
	assert.Empty(t, response.Result().Cookies())

	// Logout revokes production even when staging is offline; stale grants fail closed.
	request = httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/user/auth/logout", nil)
	request.Header.Set("Origin", origin)
	request.Header.Set(service.EnvironmentHeader, "staging")
	request.Header.Set("X-Auth-Session", stageBundle.Session.SID)
	request.AddCookie(selection)
	// Even an obsolete digest of the correct parent must not produce a false
	// successful logout while leaving that production session usable.
	request.AddCookie(&http.Cookie{Name: service.RefreshCookieName, Value: productionLogin.Session.SID + ".incorrect-refresh-secret"})
	response = httptest.NewRecorder()
	productionRouter.ServeHTTP(response, request)
	assert.Equal(t, http.StatusOK, response.Code)
	stored, err = model.GetUserSessionBySID(productionLogin.Session.SID)
	require.NoError(t, err)
	assert.Equal(t, model.UserSessionStatusRevoked, stored.Status)
	request = httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/probe", nil)
	request.Header.Set("Origin", origin)
	request.Header.Set(service.EnvironmentHeader, "staging")
	request.AddCookie(selection)
	response = httptest.NewRecorder()
	productionRouter.ServeHTTP(response, request)
	assert.Equal(t, http.StatusConflict, response.Code)
	assert.Contains(t, response.Body.String(), "ENVIRONMENT_CHANGED")
	assert.Zero(t, productionWrites)
}

func TestWriteAuthSessionErrorMapsSessionGrowthLimits(t *testing.T) {
	gin.SetMode(gin.TestMode)
	tests := []struct {
		name           string
		err            error
		expectedStatus int
		expectedCode   string
	}{
		{
			name:           "active session limit",
			err:            model.ErrUserSessionLimit,
			expectedStatus: http.StatusConflict,
			expectedCode:   "AUTH_SESSION_LIMIT",
		},
		{
			name:           "issuance limit",
			err:            model.ErrUserSessionIssuanceLimit,
			expectedStatus: http.StatusTooManyRequests,
			expectedCode:   "AUTH_SESSION_ISSUANCE_LIMIT",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			writeAuthSessionError(c, test.err)

			assert.Equal(t, test.expectedStatus, recorder.Code)
			var response struct {
				Success bool   `json:"success"`
				Code    string `json:"code"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
			assert.False(t, response.Success)
			assert.Equal(t, test.expectedCode, response.Code)
		})
	}
}

func TestSessionLimitDoesNotRecordRejectedLoginAsSuccessful(t *testing.T) {
	previousDB := model.DB
	previousRedis := common.RedisEnabled
	previousActiveLimit := common.UserSessionActiveLimit
	previousIssuanceLimit := common.UserSessionIssuanceLimit
	previousIssuanceWindow := common.UserSessionIssuanceWindowSeconds
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}, &model.TwoFA{}, &model.PasskeyCredential{}))
	model.DB = db
	common.RedisEnabled = false
	common.UserSessionActiveLimit = 1
	common.UserSessionIssuanceLimit = 100
	common.UserSessionIssuanceWindowSeconds = int64(common.DefaultUserSessionIssuanceWindowSeconds)
	t.Cleanup(func() {
		model.DB = previousDB
		common.RedisEnabled = previousRedis
		common.UserSessionActiveLimit = previousActiveLimit
		common.UserSessionIssuanceLimit = previousIssuanceLimit
		common.UserSessionIssuanceWindowSeconds = previousIssuanceWindow
	})

	const previousLastLoginAt = int64(123)
	user := &model.User{
		Username: "rejected-login-audit-user", Password: "unused", Role: common.RoleCommonUser,
		Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, LastLoginAt: previousLastLoginAt,
	}
	require.NoError(t, db.Create(user).Error)
	now := time.Now().Unix()
	require.NoError(t, db.Create(&model.UserSession{
		SID: "existing-active-session", UserID: user.Id, Version: 1, UserAuthVersion: user.AuthVersion,
		Status: model.UserSessionStatusActive, RefreshHash: "hash", LoginMethod: "password",
		CreatedAt: now, LastActiveAt: now, ExpiresAt: now + 3600,
	}).Error)

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/user/login", nil)
	setupLogin(user, nil, c)

	assert.Equal(t, http.StatusConflict, recorder.Code)
	var stored model.User
	require.NoError(t, db.First(&stored, user.Id).Error)
	assert.Equal(t, previousLastLoginAt, stored.LastLoginAt)
}

func TestRegisterIssuesLoginSessionWithoutAnotherSignIn(t *testing.T) {
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousRedis, previousSecret := common.RedisEnabled, common.SessionSecret
	previousRegister := common.RegisterEnabled
	previousPasswordRegister := common.PasswordRegisterEnabled
	previousEmailVerification := common.EmailVerificationEnabled
	previousDefaultToken := constant.GenerateDefaultToken
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}, &model.UserSession{}, &model.TwoFA{}, &model.PasskeyCredential{}, &model.LegalVersion{}, &model.LegalConsent{}, &model.RegistrationReward{}, &model.RegistrationRewardLock{}, &model.Option{}, &model.AuditLog{}))
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	model.DB, model.LOG_DB = db, db
	common.RedisEnabled = false
	common.SessionSecret = "register-auto-login-test-secret"
	common.RegisterEnabled = true
	common.PasswordRegisterEnabled = true
	common.EmailVerificationEnabled = false
	constant.GenerateDefaultToken = false
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.RedisEnabled = previousRedis
		common.SessionSecret = previousSecret
		common.RegisterEnabled = previousRegister
		common.PasswordRegisterEnabled = previousPasswordRegister
		common.EmailVerificationEnabled = previousEmailVerification
		constant.GenerateDefaultToken = previousDefaultToken
	})

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/user/register", Register)
	payload := `{"username":"reg-auto-login-user","password":"reg-auto-login-password-1x"}`
	request := httptest.NewRequest(http.MethodPost, "/api/user/register", strings.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	// A signed device cookie keeps the registration reward reason empty, matching
	// a browser that passed the deterministic device signals before sign-up.
	device := base64.RawURLEncoding.EncodeToString([]byte("1234567890abcdef1234567890abcdef"))
	value := device + "." + common.GenerateHMACWithKey([]byte("reward-device:"+common.CryptoSecret), device)
	request.AddCookie(&http.Cookie{Name: "registration_device", Value: value})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			AccessToken string `json:"access_token"`
			TokenType   string `json:"token_type"`
			Session     struct {
				SID         string `json:"sid"`
				LoginMethod string `json:"login_method"`
			} `json:"session"`
			User struct {
				Username string `json:"username"`
			} `json:"user"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.True(t, response.Success)
	assert.NotEmpty(t, response.Data.AccessToken, "register must deliver session credentials")
	assert.Equal(t, "reg-auto-login-user", response.Data.User.Username)
	assert.Equal(t, "register", response.Data.Session.LoginMethod)

	stored, err := model.GetUserSessionBySID(response.Data.Session.SID)
	require.NoError(t, err)
	assert.Equal(t, model.UserSessionStatusActive, stored.Status)
	assert.Equal(t, "register", stored.LoginMethod)

	var refreshCookie *http.Cookie
	for _, cookie := range recorder.Result().Cookies() {
		if cookie.Name == service.RefreshCookieName {
			refreshCookie = cookie
		}
	}
	require.NotNil(t, refreshCookie, "register must issue the refresh cookie")
	assert.True(t, refreshCookie.HttpOnly)
	refreshSID, ok := service.RefreshTokenSID(refreshCookie.Value)
	require.True(t, ok)
	assert.Equal(t, response.Data.Session.SID, refreshSID)

	// The audit event keeps the register method so the session lineage stays
	// traceable without recording any token material.
	var audit model.AuditLog
	require.NoError(t, db.First(&audit).Error)
	assert.Equal(t, common.RoleCommonUser, audit.ActorRole)
	assert.Equal(t, "register", audit.Other.LoginMethod)
	require.NotNil(t, audit.Other.Op)
	assert.Equal(t, "login", audit.Other.Op.Action)
}
