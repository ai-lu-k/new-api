package middleware

import (
	"net/http"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// Legal recovery routes remain available after authentication. Public document
// routes never pass through this guard. Use exact method/path pairs: prefixes
// would accidentally exempt unrelated business operations.
func allowPendingLegalConsent(c *gin.Context) bool {
	switch c.Request.Method + " " + c.Request.URL.Path {
	case "GET /api/user/self", "GET /api/user/legal-consent", "POST /api/user/legal-consent", "POST /api/feedback/", "GET /api/feedback/self", "POST /api/option/legal":
		return true
	}
	return false
}

// requireLegalConsent gates the dashboard. Relay requests are deliberately
// exempt: pending consent must interrupt the browser flow that shows the
// documents, never the API calls of an already provisioned client.
func requireLegalConsent(c *gin.Context, userID int) bool {
	if allowPendingLegalConsent(c) {
		return true
	}
	required, err := model.NeedsLegalConsent(userID)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"success": false, "code": "LEGAL_UNAVAILABLE", "message": "Unable to verify legal consent. Please try again later"})
		return false
	}
	if !required {
		return true
	}
	c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"success": false, "code": "LEGAL_CONSENT_REQUIRED", "message": "Please review and accept the current legal documents"})
	return false
}
