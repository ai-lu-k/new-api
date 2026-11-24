package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func performPageViewRequest(t *testing.T, handler gin.HandlerFunc, method, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(method, "/api/page_views/", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	handler(c)
	return recorder
}

func TestPageViewEndpointStoresOnlyRouteKeys(t *testing.T) {
	db := setupManageUserTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.PageViewDaily{}))

	post := func(body string) string {
		return performPageViewRequest(t, RecordPageView, http.MethodPost, body).Body.String()
	}
	assert.Contains(t, post(`{"page":"/keys"}`), `"success":true`)
	assert.Contains(t, post(`{"page":"/keys"}`), `"success":true`)
	assert.Contains(t, post(`{"page":"/wallet"}`), `"success":true`)

	// Query strings, fragments, and non-paths are rejected, so the counters
	// never carry per-user or per-request detail.
	for _, rejected := range []string{
		`{"page":"/pricing?tab=2"}`,
		`{"page":"/chat#top"}`,
		`{"page":"pricing"}`,
		`{"page":"/用户"}`,
		`{"page":""}`,
		`{}`,
	} {
		assert.Contains(t, post(rejected), `"success":false`, rejected)
	}

	var stored []model.PageViewDaily
	require.NoError(t, db.Order("page").Find(&stored).Error)
	require.Len(t, stored, 2)
	assert.Equal(t, "/keys", stored[0].Page)
	assert.Equal(t, int64(2), stored[0].Views)
	assert.Equal(t, "/wallet", stored[1].Page)

	popular := performPageViewRequest(t, GetPopularPageViews, http.MethodGet, "").Body.String()
	assert.Contains(t, popular, `"page":"/keys"`)
	assert.Contains(t, popular, `"views":2`)
}
