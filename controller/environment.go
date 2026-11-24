package controller

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func (gateway *environmentGateway) control(c *gin.Context) {
	setAuthNoStore(c)
	if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodPost {
		c.Header("Allow", "GET, POST")
		c.AbortWithStatus(http.StatusMethodNotAllowed)
		return
	}
	if gateway.config == nil || gateway.config.Role != "production" {
		if c.Request.Method == http.MethodPost {
			environmentError(c, http.StatusServiceUnavailable, "ENVIRONMENT_UNAVAILABLE", "Environment switching is not configured")
			return
		}
		environment := "production"
		if gateway.config != nil {
			environment = gateway.config.Role
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"enabled": false, "environment": environment, "version": common.Version}})
		c.Abort()
		return
	}
	if !gateway.sameOrigin(c, c.Request.Method == http.MethodPost) {
		return
	}
	var request struct {
		Environment string `json:"environment"`
	}
	if c.Request.Method == http.MethodPost {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
		if err := common.DecodeJson(c.Request.Body, &request); err != nil || (request.Environment != "production" && request.Environment != "staging") {
			environmentError(c, http.StatusBadRequest, "ENVIRONMENT_INVALID", "Invalid environment")
			return
		}
		// Returning only removes a routing grant. It remains available when the
		// test process or its login session is broken; it cannot grant access.
		if request.Environment == "production" {
			if selection, err := gateway.selection(c); err == nil && selection != nil {
				common.SysLog(fmt.Sprintf("administrator environment switch to production: user_id=%d", selection.Parent.Identity.UserID))
			}
			gateway.clearSelection(c)
			c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"environment": "production"}})
			c.Abort()
			return
		}
	}
	selection, err := gateway.selection(c)
	if err != nil {
		gateway.clearSelection(c)
		environmentError(c, http.StatusConflict, "ENVIRONMENT_CHANGED", "Environment changed; reload the page")
		return
	}
	var parent service.EnvParent
	if selection != nil {
		if c.GetHeader(service.EnvironmentHeader) != "staging" {
			environmentError(c, http.StatusConflict, "ENVIRONMENT_CHANGED", "Environment changed; reload the page")
			return
		}
		parent = selection.Parent
	} else {
		if c.GetHeader(service.EnvironmentHeader) == "staging" {
			environmentError(c, http.StatusConflict, "ENVIRONMENT_CHANGED", "Environment changed; reload the page")
			return
		}
		raw, ok := dashboardBearer(c.GetHeader("Authorization"))
		if !ok {
			environmentError(c, http.StatusUnauthorized, "AUTH_SESSION_REQUIRED", "A dashboard login session is required")
			return
		}
		identity, err := service.ParseAccessToken(raw)
		if err != nil {
			writeAuthSessionError(c, err)
			c.Abort()
			return
		}
		session, user, err := service.ValidateLoginSession(identity)
		if err != nil {
			writeAuthSessionError(c, err)
			c.Abort()
			return
		}
		if user.Role < common.RoleAdminUser {
			environmentError(c, http.StatusForbidden, "ENVIRONMENT_ACCESS_DENIED", "Administrator access is required")
			return
		}
		parent = service.EnvParent{Identity: identity, Username: user.Username, Role: user.Role, ExpiresAt: session.ExpiresAt}
	}
	environment, version := "production", common.Version
	if selection != nil {
		environment, version = "staging", selection.Version
	}
	if c.Request.Method == http.MethodGet {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"enabled": true, "environment": environment, "version": version}})
		c.Abort()
		return
	}
	bundle, err := gateway.callStage(c.Request.Context(), environmentBootstrapPath, parent, middleware.PreviewRoleRequested(c))
	if err != nil {
		environmentError(c, http.StatusBadGateway, "ENVIRONMENT_UNAVAILABLE", "Test environment is unavailable or access is not configured")
		return
	}
	if err := gateway.writeSelection(c, parent, bundle); err != nil {
		environmentError(c, http.StatusInternalServerError, "ENVIRONMENT_UNAVAILABLE", "Environment switch failed")
		return
	}
	common.SysLog(fmt.Sprintf("administrator environment switch to staging: user_id=%d", parent.Identity.UserID))
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"environment": request.Environment}})
	c.Abort()
}

func (gateway *environmentGateway) refresh(c *gin.Context, selection *service.EnvironmentSelection) {
	if c.Request.Method != http.MethodPost {
		c.AbortWithStatus(http.StatusMethodNotAllowed)
		return
	}
	expected := strings.TrimSpace(c.GetHeader("X-Auth-Session"))
	if expected != "" && expected != selection.StageSID {
		writeAuthSessionError(c, service.ErrLoginSessionMismatch)
		c.Abort()
		return
	}
	raw, err := c.Cookie(service.RefreshCookieName)
	if err != nil {
		writeAuthSessionError(c, service.ErrRefreshTokenInvalid)
		c.Abort()
		return
	}
	production, user, err := service.RefreshLoginSession(raw, selection.Parent.Identity.SessionID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		writeAuthSessionError(c, err)
		c.Abort()
		return
	}
	// Rotate only the existing production refresh cookie. Staging never receives
	// it and never emits another browser refresh credential.
	service.WriteRefreshCookie(c, production.RefreshToken)
	identity, err := service.ParseAccessToken(production.AccessToken)
	if err != nil {
		writeAuthSessionError(c, err)
		c.Abort()
		return
	}
	parent := service.EnvParent{Identity: identity, Username: user.Username, Role: user.Role, ExpiresAt: production.Session.ExpiresAt}
	if user.Role < common.RoleAdminUser {
		environmentError(c, http.StatusForbidden, "ENVIRONMENT_ACCESS_DENIED", "Administrator access is required")
		return
	}
	bundle, err := gateway.callStage(c.Request.Context(), environmentBootstrapPath, parent, middleware.PreviewRoleRequested(c))
	if err != nil {
		environmentError(c, http.StatusServiceUnavailable, "ENVIRONMENT_UNAVAILABLE", "Test environment is unavailable or access was revoked")
		return
	}
	if bundle.Session.SID != selection.StageSID {
		environmentError(c, http.StatusConflict, "ENVIRONMENT_CHANGED", "Environment session changed; reload the page")
		return
	}
	if err := gateway.writeSelection(c, parent, bundle); err != nil {
		environmentError(c, http.StatusInternalServerError, "ENVIRONMENT_UNAVAILABLE", "Environment session refresh failed")
		return
	}
	setAuthNoStore(c)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": bundle})
	c.Abort()
}

func (gateway *environmentGateway) logout(c *gin.Context, selection *service.EnvironmentSelection) {
	if c.Request.Method != http.MethodPost {
		c.AbortWithStatus(http.StatusMethodNotAllowed)
		return
	}
	expected := strings.TrimSpace(c.GetHeader("X-Auth-Session"))
	if expected != "" && expected != selection.StageSID {
		writeAuthSessionError(c, service.ErrLoginSessionMismatch)
		c.Abort()
		return
	}
	raw, err := c.Cookie(service.RefreshCookieName)
	if err != nil {
		writeAuthSessionError(c, service.ErrRefreshTokenInvalid)
		c.Abort()
		return
	}
	if sid, ok := service.RefreshTokenSID(raw); !ok || sid != selection.Parent.Identity.SessionID {
		writeAuthSessionError(c, service.ErrLoginSessionMismatch)
		c.Abort()
		return
	}
	// The validated routing grant identifies the live production parent. An old
	// refresh digest may no longer match after rotation; logout must still revoke
	// that parent rather than merely clearing the browser's cookies.
	if _, err := model.RevokeUserSession(selection.Parent.Identity.UserID, selection.Parent.Identity.SessionID, "logout"); err != nil {
		writeAuthSessionError(c, err)
		c.Abort()
		return
	}
	// Production revocation already fences every staging request even if the
	// staging process is offline. Revoke its local shadow on a best-effort basis.
	if _, err := gateway.callStage(c.Request.Context(), environmentRevokePath, selection.Parent, false); err != nil {
		common.SysLog("test shadow session revoke unavailable after production logout")
	}
	gateway.clearSelection(c)
	service.ClearRefreshCookie(c)
	setAuthNoStore(c)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"revoked_sid": selection.StageSID, "cookie_cleared": true}})
	c.Abort()
}
