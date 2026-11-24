package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func GetModelDailyTokenBudgets(c *gin.Context) {
	snapshot, err := model.GetModelDailyTokenSnapshot(c.Request.Context(), c.GetInt("id"))
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "Unable to load model daily token usage"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": snapshot})
}
