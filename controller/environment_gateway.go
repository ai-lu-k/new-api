package controller

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"io"
	"net/http"
	"net/http/httputil"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

const environmentSelectionCookie = "new_api_environment"
const environmentSelectionSecureCookie = "__Host-new_api_environment"
const environmentBodyLimit = 32 << 20
const environmentBootstrapPath = "/api/internal/environment/session"
const environmentRevokePath = "/api/internal/environment/session/revoke"

type environmentGateway struct {
	config *service.EnvironmentConfig
	proxy  *httputil.ReverseProxy
	client *http.Client
}

type environmentBundle struct {
	AccessToken     string                   `json:"access_token"`
	TokenType       string                   `json:"token_type"`
	AccessExpiresAt int64                    `json:"access_expires_at"`
	User            map[string]any           `json:"user"`
	Session         service.LoginSessionView `json:"session"`
	Version         string                   `json:"version"`
}

// EnvironmentGateway is opt-in. Production API-key routes never participate
// in browser switching. Staging sessions require an internal request ticket.
func EnvironmentGateway(config *service.EnvironmentConfig) gin.HandlerFunc {
	gateway := &environmentGateway{config: config, client: &http.Client{Timeout: 15 * time.Second,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}}
	if config != nil && config.Role == "production" {
		transport := &http.Transport{Proxy: http.ProxyFromEnvironment}
		if defaultTransport, ok := http.DefaultTransport.(*http.Transport); ok {
			transport = defaultTransport.Clone()
		}
		// Session traffic must verify the staging certificate independently of provider TLS settings.
		tlsConfig := &tls.Config{MinVersion: tls.VersionTLS12}
		if transport.TLSClientConfig != nil {
			tlsConfig.RootCAs = transport.TLSClientConfig.RootCAs
		}
		transport.TLSClientConfig = tlsConfig
		gateway.client.Transport = transport
		gateway.proxy = &httputil.ReverseProxy{
			Transport: transport,
			Rewrite: func(request *httputil.ProxyRequest) {
				request.SetURL(config.Upstream)
				request.Out.Host = request.In.Host
				request.Out.Header.Del("Cookie")
				request.Out.Header.Del("If-None-Match")
				request.Out.Header.Del("If-Modified-Since")
				request.Out.Header.Del("Forwarded")
				request.SetXForwarded()
			},
			FlushInterval: -1,
			ModifyResponse: func(response *http.Response) error {
				response.Header.Del("Set-Cookie")
				response.Header.Del("ETag")
				response.Header.Del("Last-Modified")
				response.Header.Set("Cache-Control", "private, no-store")
				response.Header.Set(service.EnvironmentHeader, "staging")
				response.Header.Add("Vary", "Cookie, X-App-Environment")
				return nil
			},
			ErrorHandler: func(writer http.ResponseWriter, request *http.Request, _ error) {
				writer.Header().Set("Cache-Control", "no-store")
				// A failed document navigation must still leave a usable way back.
				// API mutations never fall back to the production destination.
				path := request.URL.Path
				if request.Method == http.MethodGet && !strings.HasPrefix(path, "/api/") && !strings.HasPrefix(path, "/pg/") && (request.Header.Get("Sec-Fetch-Dest") == "document" || strings.Contains(request.Header.Get("Accept"), "text/html")) {
					http.SetCookie(writer, &http.Cookie{Name: gateway.cookieName(), Path: "/", HttpOnly: true,
						Secure: strings.HasPrefix(config.Origin, "https://"), SameSite: http.SameSiteStrictMode,
						Expires: time.Unix(1, 0), MaxAge: -1})
					http.Redirect(writer, request, "/", http.StatusSeeOther)
					return
				}
				writer.Header().Set("Content-Type", "application/json")
				writer.WriteHeader(http.StatusBadGateway)
				writer.Write([]byte(`{"success":false,"code":"ENVIRONMENT_UNAVAILABLE","message":"Test environment is unavailable"}`))
			},
		}
	}
	return gateway.handle
}

func (gateway *environmentGateway) handle(c *gin.Context) {
	path := c.Request.URL.Path
	if gateway.config != nil && gateway.config.Role == "staging" {
		gateway.receive(c)
		return
	}
	// These are credentials for the internal hop, never accepted from visitors.
	c.Request.Header.Del(service.EnvironmentTicketHeader)
	if strings.HasPrefix(path, "/api/internal/environment/") {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	if path == "/api/environment" {
		if common.GlobalApiRateLimitEnable {
			middleware.GlobalAPIRateLimit()(c)
		}
		if c.IsAborted() {
			return
		}
		gateway.control(c)
		return
	}
	// External model API traffic always keeps its production destination.
	if strings.HasPrefix(path, "/v1/") || path == "/v1" || strings.HasPrefix(path, "/v1beta/") || strings.HasPrefix(path, "/mj/") || (path == "/dashboard/billing/subscription" || path == "/dashboard/billing/usage") {
		c.Next()
		return
	}
	if gateway.config == nil {
		if c.GetHeader(service.EnvironmentHeader) == "staging" {
			environmentError(c, http.StatusServiceUnavailable, "ENVIRONMENT_UNAVAILABLE", "Test environment is not configured")
			return
		}
		c.Next()
		return
	}
	// Client API calls, callbacks, and plugins keep their normal production
	// routes regardless of cookies or a visitor-supplied environment tag.
	if !strings.HasPrefix(path, "/api/") && !strings.HasPrefix(path, "/pg/") && (c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead) {
		c.Next()
		return
	}
	selection, selectionErr := gateway.selection(c)
	apiRequest := strings.HasPrefix(path, "/api/") || strings.HasPrefix(path, "/pg/")
	tag := c.GetHeader(service.EnvironmentHeader)
	if tag != "" && tag != "production" && tag != "staging" {
		environmentError(c, http.StatusBadRequest, "ENVIRONMENT_INVALID", "Invalid environment")
		return
	}
	if selectionErr != nil {
		gateway.clearSelection(c)
		if apiRequest || tag == "staging" {
			environmentError(c, http.StatusConflict, "ENVIRONMENT_CHANGED", "Environment changed; reload the page")
			return
		}
		c.Redirect(http.StatusSeeOther, "/")
		c.Abort()
		return
	}
	if selection == nil {
		if tag == "staging" {
			environmentError(c, http.StatusConflict, "ENVIRONMENT_CHANGED", "Environment changed; reload the page")
			return
		}
		c.Next()
		return
	}
	if apiRequest && tag != "staging" {
		// The page the browser is on declares production, so this request is
		// served from production and never answered with 409: that reloaded the
		// page, which sent the same tagged requests again and looped until the
		// host blocked the address.
		//
		// The selection cookie is left alone. A switch reloads the page while
		// the outgoing one still has requests in flight, and those carry the
		// production tag; deleting the cookie here removed the selection the
		// reloaded staging document was about to use for its own scripts and
		// stylesheets, which then fell through to production and 404'd whenever
		// staging ran a newer build.
		c.Next()
		return
	}
	if !gateway.sameOrigin(c, c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead) {
		return
	}
	if path == "/api/user/auth/refresh" {
		gateway.refresh(c, selection)
		return
	}
	if path == "/api/user/auth/logout" {
		gateway.logout(c, selection)
		return
	}
	// Authentication, account recovery and billing callbacks must never become
	// alternate production login or payment paths inside a staging preview.
	if strings.HasPrefix(path, "/api/oauth/") || path == "/api/user/login" || path == "/api/user/register" || path == "/api/user/reset" || strings.HasPrefix(path, "/api/user/auth/") || strings.Contains(path, "webhook") || strings.Contains(path, "notify") || path == "/api/setup" && c.Request.Method != http.MethodGet {
		environmentError(c, http.StatusForbidden, "ENVIRONMENT_OPERATION_UNAVAILABLE", "Return to production to manage authentication")
		return
	}
	if apiRequest && path != "/api/setup" {
		raw, ok := dashboardBearer(c.GetHeader("Authorization"))
		if !ok {
			environmentError(c, http.StatusUnauthorized, "AUTH_UNAUTHORIZED", "A dashboard session is required")
			return
		}
		_, internal, _ := service.ParseDashboardAccessToken(raw)
		if !internal {
			environmentError(c, http.StatusForbidden, "ENVIRONMENT_ACCESS_DENIED", "A dashboard session is required")
			return
		}
	}
	body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, environmentBodyLimit))
	if err != nil {
		environmentError(c, http.StatusRequestEntityTooLarge, "ENVIRONMENT_BODY_TOO_LARGE", "Test request is too large")
		return
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(body))
	ticket, err := service.SignEnvironmentRequest(gateway.config, c.Request, body, selection.Parent)
	if err != nil {
		environmentError(c, http.StatusForbidden, "ENVIRONMENT_ACCESS_DENIED", "Test environment access denied")
		return
	}
	c.Request.Header.Set(service.EnvironmentTicketHeader, ticket)
	c.Set(middleware.RouteTagKey, "staging")
	gateway.proxy.ServeHTTP(c.Writer, c.Request)
	c.Abort()
}

func (gateway *environmentGateway) selection(c *gin.Context) (*service.EnvironmentSelection, error) {
	raw, err := c.Cookie(gateway.cookieName())
	if errors.Is(err, http.ErrNoCookie) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	selection, err := service.ParseEnvironmentSelection(raw, gateway.config.Origin)
	if err != nil {
		return nil, err
	}
	parent, err := service.ValidateEnvironmentParent(selection.Parent)
	if err != nil {
		return nil, err
	}
	if refresh, err := c.Cookie(service.RefreshCookieName); err == nil {
		if sid, ok := service.RefreshTokenSID(refresh); ok && sid != selection.Parent.Identity.SessionID {
			return nil, service.ErrLoginSessionMismatch
		}
	}
	selection.Parent = *parent
	return selection, nil
}

func (gateway *environmentGateway) cookieName() string {
	if strings.HasPrefix(gateway.config.Origin, "https://") {
		return environmentSelectionSecureCookie
	}
	return environmentSelectionCookie
}

func (gateway *environmentGateway) writeSelection(c *gin.Context, parent service.EnvParent, bundle *environmentBundle) error {
	raw, expires, err := service.IssueEnvironmentSelection(parent, bundle.Session.SID, bundle.Version, gateway.config.Origin)
	if err != nil {
		return err
	}
	http.SetCookie(c.Writer, &http.Cookie{Name: gateway.cookieName(), Value: raw, Path: "/", HttpOnly: true,
		Secure: strings.HasPrefix(gateway.config.Origin, "https://"), SameSite: http.SameSiteStrictMode,
		Expires: time.Unix(expires, 0), MaxAge: int(expires - time.Now().Unix())})
	return nil
}

func (gateway *environmentGateway) clearSelection(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{Name: gateway.cookieName(), Path: "/", HttpOnly: true,
		Secure: strings.HasPrefix(gateway.config.Origin, "https://"), SameSite: http.SameSiteStrictMode,
		Expires: time.Unix(1, 0), MaxAge: -1})
}

func (gateway *environmentGateway) sameOrigin(c *gin.Context, required bool) bool {
	if site := c.GetHeader("Sec-Fetch-Site"); site != "" && site != "same-origin" && site != "none" {
		environmentError(c, http.StatusForbidden, "ENVIRONMENT_ORIGIN_DENIED", "Origin is not allowed")
		return false
	}
	origin := c.GetHeader("Origin")
	if origin == "" && !required {
		return true
	}
	normalized, err := common.NormalizeOrigin(origin)
	if err != nil || normalized != gateway.config.Origin {
		environmentError(c, http.StatusForbidden, "ENVIRONMENT_ORIGIN_DENIED", "Origin is not allowed")
		return false
	}
	return true
}

func environmentError(c *gin.Context, status int, code, message string) {
	c.Header("Cache-Control", "private, no-store")
	c.AbortWithStatusJSON(status, gin.H{"success": false, "code": code, "message": message})
}

func (gateway *environmentGateway) callStage(ctx context.Context, path string, parent service.EnvParent, previewRole bool) (*environmentBundle, error) {
	if gateway.config.Upstream == nil || gateway.config.Upstream.Scheme != "https" {
		return nil, service.ErrEnvironmentBridge
	}
	target := *gateway.config.Upstream
	target.Path = path
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, target.String(), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept-Encoding", "identity")
	if previewRole {
		// The test environment renders the bundle, so the preview has to travel
		// with the hop. The request ticket does not cover this header, and the
		// header can only ever lower the rendered role.
		request.Header.Set(middleware.PreviewRoleHeader, "user")
	}
	ticket, err := service.SignEnvironmentRequest(gateway.config, request, nil, parent)
	if err != nil {
		return nil, err
	}
	request.Header.Set(service.EnvironmentTicketHeader, ticket)
	response, err := gateway.client.Do(request)
	if err != nil {
		return nil, errors.New("test environment is unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, errors.New("test environment access denied or unavailable")
	}
	var result struct {
		Success bool              `json:"success"`
		Data    environmentBundle `json:"data"`
	}
	if err := common.DecodeJson(io.LimitReader(response.Body, 2<<20), &result); err != nil || !result.Success {
		return nil, errors.New("invalid test environment response")
	}
	if path == environmentBootstrapPath && (result.Data.AccessToken == "" || result.Data.Session.SID == "" || result.Data.AccessExpiresAt <= time.Now().Unix()) {
		return nil, errors.New("invalid test session response")
	}
	return &result.Data, nil
}

func (gateway *environmentGateway) receive(c *gin.Context) {
	c.Set(service.EnvironmentConfigContextKey, gateway.config)
	raw := c.GetHeader(service.EnvironmentTicketHeader)
	if raw == "" {
		// Anonymous auth controllers (notably logout) also accept access JWTs.
		// Fence shadow credentials before any route can use them without a hop.
		if bearer, ok := dashboardBearer(c.GetHeader("Authorization")); ok {
			if identity, err := service.ParseAccessToken(bearer); err == nil {
				session, err := model.GetUserSessionBySID(identity.SessionID)
				if err != nil || session.LoginMethod == service.EnvironmentBridgeLoginMethod {
					environmentError(c, http.StatusForbidden, "ENVIRONMENT_ACCESS_DENIED", "Test sessions require the production gateway")
					return
				}
			}
		}
		if strings.HasPrefix(c.Request.URL.Path, "/api/internal/environment/") {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
		c.Next()
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, environmentBodyLimit))
	if err != nil {
		environmentError(c, http.StatusRequestEntityTooLarge, "ENVIRONMENT_BODY_TOO_LARGE", "Test request is too large")
		return
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(body))
	claims, err := service.VerifyEnvironmentRequest(gateway.config, c.Request, body, raw)
	if err != nil {
		environmentError(c, http.StatusForbidden, "ENVIRONMENT_ACCESS_DENIED", "Invalid environment authorization")
		return
	}
	c.Request.Header.Del(service.EnvironmentTicketHeader)
	c.Set(service.EnvironmentClaimsContextKey, claims)
	if c.Request.URL.Path == environmentBootstrapPath && c.Request.Method == http.MethodPost {
		bundle, user, err := service.GetEnvironmentAuthBundle(gateway.config, claims)
		if err != nil {
			environmentError(c, http.StatusForbidden, "ENVIRONMENT_ACCESS_DENIED", "Test environment access denied")
			return
		}
		fullUser, err := model.GetUserById(user.Id, true)
		if err != nil {
			environmentError(c, http.StatusServiceUnavailable, "ENVIRONMENT_UNAVAILABLE", "Test environment is unavailable")
			return
		}
		setAuthNoStore(c)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": environmentBundle{AccessToken: bundle.AccessToken, TokenType: bundle.TokenType,
			AccessExpiresAt: bundle.AccessExpiresAt, Session: bundle.Session, User: buildSelfUserData(fullUser, middleware.DashboardRole(c, fullUser.Role), middleware.PreviewModeActive(c)), Version: common.Version}})
		c.Abort()
		return
	}
	if c.Request.URL.Path == environmentRevokePath && c.Request.Method == http.MethodPost {
		if err := service.RevokeEnvironmentSession(gateway.config, claims); err != nil {
			environmentError(c, http.StatusServiceUnavailable, "ENVIRONMENT_UNAVAILABLE", "Test session could not be revoked")
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{}})
		c.Abort()
		return
	}
	if strings.HasPrefix(c.Request.URL.Path, "/api/internal/environment/") {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	c.Next()
}
