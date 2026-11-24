package middleware

import (
	"net/http"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// CampaignEnabled answers 404 on every campaign route while no campaign is
// being served. Detection stays inside the handler instead of at registration
// time so an operator switching a campaign off takes it offline immediately,
// without a redeploy and without leaving an endpoint that still reports
// participants, solve counts and prize pools.
func CampaignEnabled() gin.HandlerFunc {
	return func(c *gin.Context) {
		if model.CurrentCampaign() == nil {
			c.AbortWithStatusJSON(http.StatusNotFound, gin.H{
				"success": false,
				"message": "Not Found",
			})
			return
		}
		c.Next()
	}
}
