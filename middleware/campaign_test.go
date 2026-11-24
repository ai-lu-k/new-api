package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// The campaign group is guarded as a whole, so switching the campaign off has to
// close every route with a plain 404 instead of answering with event statistics.
func TestCampaignEnabledClosesEveryRouteWhileNoCampaignIsServed(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previous := *operation_setting.GetCampaignSetting()
	t.Cleanup(func() { *operation_setting.GetCampaignSetting() = previous })
	setting := operation_setting.GetCampaignSetting()
	setting.Enabled = false

	engine := gin.New()
	group := engine.Group("/api/campaign")
	group.Use(CampaignEnabled())
	group.GET("", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"participants": 9}) })
	group.GET("/files/:name", func(c *gin.Context) { c.String(http.StatusOK, "payload") })
	group.POST("/submit", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"correct": true}) })
	group.POST("/claim", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"bound": true}) })
	group.POST("/share", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"quota": 1}) })
	group.POST("/admin/settle", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"winners": []string{}}) })

	routes := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/campaign"},
		{http.MethodGet, "/api/campaign/files/example.txt"},
		{http.MethodPost, "/api/campaign/submit"},
		{http.MethodPost, "/api/campaign/claim"},
		{http.MethodPost, "/api/campaign/share"},
		{http.MethodPost, "/api/campaign/admin/settle"},
	}
	for _, route := range routes {
		recorder := httptest.NewRecorder()
		engine.ServeHTTP(recorder, httptest.NewRequest(route.method, route.path, nil))
		assert.Equal(t, http.StatusNotFound, recorder.Code, route.path)
		assert.NotContains(t, recorder.Body.String(), "participants", route.path)
	}

	// Without a registered campaign, enabling the feature still leaves routes closed.
	setting.Enabled = true
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/campaign", nil))
	assert.Equal(t, http.StatusNotFound, recorder.Code)
}
