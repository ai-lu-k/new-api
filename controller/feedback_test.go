package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func performFeedbackRequest(t *testing.T, handler gin.HandlerFunc, method, target, body string, userID int, username string, params gin.Params) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(method, target, strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("id", userID)
	c.Set("username", username)
	c.Params = params
	handler(c)
	return recorder
}

func TestFeedbackAnonymousMessagesKeepNoAuthor(t *testing.T) {
	db := setupManageUserTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.Feedback{}))

	post := func(body string) string {
		return performFeedbackRequest(t, CreateFeedback, http.MethodPost, "/api/feedback/", body, 7, "ada", nil).Body.String()
	}
	assert.Contains(t, post(`{"content":"The model list is hard to search.","contact":"ada@example.test"}`), `"success":true`)
	assert.Contains(t, post(`{"content":"Prices changed without notice.","anonymous":true}`), `"success":true`)
	assert.Contains(t, post(`{"content":"hi"}`), `"success":false`)
	assert.Contains(t, post(fmt.Sprintf(`{"content":%q}`, strings.Repeat("x", 2001))), `"success":false`)

	var stored []model.Feedback
	require.NoError(t, db.Order("id").Find(&stored).Error)
	require.Len(t, stored, 2)
	assert.Equal(t, 7, stored[0].UserId)
	assert.Equal(t, "ada", stored[0].Username)
	assert.Equal(t, model.FeedbackStatusOpen, stored[0].Status)
	assert.Zero(t, stored[1].UserId, "an anonymous message is not linked to its author")
	assert.Empty(t, stored[1].Username)

	// The author sees the signed message only; someone else sees none.
	own := performFeedbackRequest(t, GetOwnFeedback, http.MethodGet, "/api/feedback/self", "", 7, "ada", nil).Body.String()
	assert.Contains(t, own, "hard to search")
	assert.NotContains(t, own, "without notice")
	other := performFeedbackRequest(t, GetOwnFeedback, http.MethodGet, "/api/feedback/self", "", 8, "bob", nil).Body.String()
	assert.NotContains(t, other, "hard to search")

	// An administrator sees both, replies to one and marks it resolved.
	all := performFeedbackRequest(t, GetAllFeedback, http.MethodGet, "/api/feedback/?p=1&page_size=10", "", 1, "root", nil).Body.String()
	assert.Contains(t, all, "hard to search")
	assert.Contains(t, all, "without notice")
	assert.Contains(t, all, `"open":2`)

	params := gin.Params{{Key: "id", Value: fmt.Sprint(stored[0].Id)}}
	updated := performFeedbackRequest(t, UpdateFeedback, http.MethodPut, "/api/feedback/1", `{"status":2,"reply":"Search is on the way."}`, 1, "root", params).Body.String()
	assert.Contains(t, updated, `"success":true`)
	assert.Contains(t, performFeedbackRequest(t, UpdateFeedback, http.MethodPut, "/api/feedback/1", `{"status":9}`, 1, "root", params).Body.String(), `"success":false`)

	own = performFeedbackRequest(t, GetOwnFeedback, http.MethodGet, "/api/feedback/self", "", 7, "ada", nil).Body.String()
	assert.Contains(t, own, "Search is on the way.")
	open := performFeedbackRequest(t, GetAllFeedback, http.MethodGet, "/api/feedback/?status=1", "", 1, "root", nil).Body.String()
	assert.NotContains(t, open, "hard to search")
	assert.Contains(t, open, `"open":1`)
}
