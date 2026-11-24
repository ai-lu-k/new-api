package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTokenPlanDigestIsNotAReadOnlyBearerCredential(t *testing.T) {
	ctx := newTokenAutoGroupsContext()
	ctx.Request = httptest.NewRequest("GET", "/api/usage/token/", nil)
	ctx.Request.Header.Set("Authorization", "Bearer sk-tp_hash_not-a-credential")
	TokenAuthReadOnly()(ctx)
	assert.True(t, ctx.IsAborted())
	assert.Equal(t, http.StatusUnauthorized, ctx.Writer.Status())
}

func TestRetiredTokenPlanCacheCannotSelectFreeBilling(t *testing.T) {
	previous := common.TokenPlanRetired
	common.TokenPlanRetired = true
	t.Cleanup(func() { common.TokenPlanRetired = previous })
	ctx := newTokenAutoGroupsContext()
	require.NoError(t, SetupContextForToken(ctx, &model.Token{Id: 1, UserId: 2, TokenPlan: true}))
	assert.False(t, ctx.GetBool("token_plan"))
}

func newTokenAutoGroupsContext() *gin.Context {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	return ctx
}

func TestSetupContextForTokenPreservesCustomAutoGroupsOrder(t *testing.T) {
	ctx := newTokenAutoGroupsContext()
	token := &model.Token{Id: 1, UserId: 2, AutoGroups: `["vip","default"]`}

	require.NoError(t, SetupContextForToken(ctx, token))
	value, ok := common.GetContextKey(ctx, constant.ContextKeyTokenAutoGroups)
	require.True(t, ok)
	assert.Equal(t, []string{"vip", "default"}, value)
}

func TestSetupContextForTokenTreatsStoredEmptyArrayAsInheritance(t *testing.T) {
	ctx := newTokenAutoGroupsContext()
	token := &model.Token{Id: 1, UserId: 2, AutoGroups: `[]`}

	require.NoError(t, SetupContextForToken(ctx, token))
	_, ok := common.GetContextKey(ctx, constant.ContextKeyTokenAutoGroups)
	assert.False(t, ok)
}

func TestSetupContextForTokenMalformedAutoGroupsFailsClosed(t *testing.T) {
	ctx := newTokenAutoGroupsContext()
	token := &model.Token{Id: 1, UserId: 2, AutoGroups: `not-json`}

	require.NoError(t, SetupContextForToken(ctx, token))
	value, ok := common.GetContextKey(ctx, constant.ContextKeyTokenAutoGroups)
	require.True(t, ok)
	assert.Equal(t, []string{}, value)
}
