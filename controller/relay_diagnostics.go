package controller

import (
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/relaytrace"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetRelayDiagnostics(c *gin.Context) {
	windows, shared, dropped := relaytrace.Windows.Status(time.Now())
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"windows": windows, "shared": shared, "window_seconds": relaytrace.CurrentConfig().WindowSeconds, "config": relaytrace.CurrentConfig(), "dropped_updates": dropped, "writes": model.DiagnosticWriteStats(), "upstream_latency": service.UpstreamLatencyStatus(), "request_observation_writes": model.RelayObservationWriteStats()}})
}

func UpdateRelayDiagnostics(c *gin.Context) {
	var request struct {
		Scope   relaytrace.Scope `json:"scope"`
		Enabled bool             `json:"enabled"`
	}
	if c.ShouldBindJSON(&request) != nil || !relaytrace.ValidScope(request.Scope) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid diagnostic scope"})
		return
	}
	if !relaytrace.Windows.Set(request.Scope, "manual", !request.Enabled, time.Now()) {
		c.JSON(http.StatusTooManyRequests, gin.H{"success": false, "message": "Diagnostic scope budget exhausted"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
