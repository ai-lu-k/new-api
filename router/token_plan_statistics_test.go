package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestTokenPlanStatisticsAdminAPI(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldDB, oldLogDB := model.DB, model.LOG_DB
	oldMain, oldLog := common.MainDatabaseType(), common.LogDatabaseType()
	oldRedis, oldRate := common.RedisEnabled, common.GlobalApiRateLimitEnable
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	model.DB, model.LOG_DB = db, db
	common.RedisEnabled, common.GlobalApiRateLimitEnable = false, false
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		model.DB, model.LOG_DB = oldDB, oldLogDB
		common.RedisEnabled, common.GlobalApiRateLimitEnable = oldRedis, oldRate
		common.SetDatabaseTypes(oldMain, oldLog)
		_ = sqlDB.Close()
	})
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.AuditLog{}, &model.TokenPlanAccount{}, &model.TokenPlanWeek{}, &model.TokenPlanReservation{}, &model.LegalVersion{}, &model.LegalConsent{}, &model.Option{}))
	ordinary, admin, disabled := "statistics-ordinary-pat", "statistics-admin-pat", "statistics-disabled-pat"
	users := []model.User{
		{Username: "ordinary", AffCode: "ordinary", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AccessToken: &ordinary},
		{Username: "admin", AffCode: "admin", Role: common.RoleAdminUser, Status: common.UserStatusEnabled, AccessToken: &admin},
		{Username: "disabled", AffCode: "disabled", Role: common.RoleAdminUser, Status: common.UserStatusDisabled, AccessToken: &disabled},
	}
	require.NoError(t, db.Create(&users).Error)
	engine := gin.New()
	SetApiRouter(engine)
	for _, resource := range []string{"overview", "users", "trend"} {
		for _, tc := range []struct {
			name, token string
			status      int
		}{
			{"anonymous", "", 401}, {"ordinary", ordinary, 403}, {"disabled", disabled, 401}, {"administrator", admin, 200},
		} {
			t.Run(resource+"/"+tc.name, func(t *testing.T) {
				req := httptest.NewRequest(http.MethodGet, "/api/token-plan/statistics/"+resource, nil)
				if tc.token != "" {
					req.Header.Set("Authorization", "Bearer "+tc.token)
				}
				response := httptest.NewRecorder()
				engine.ServeHTTP(response, req)
				require.Equal(t, tc.status, response.Code, response.Body.String())
				assert.Contains(t, response.Header().Get("Cache-Control"), "no-store")
				for _, secret := range []string{ordinary, admin, disabled, "key_ciphertext", "masked_key", "token_id"} {
					assert.NotContains(t, response.Body.String(), secret)
				}
				if tc.status == 200 {
					assert.Contains(t, response.Body.String(), `"success":true`)
				}
			})
		}
	}
	for _, query := range []string{
		"users?page=0", "users?size=101", "users?page=overflow", "users?search=" + strings.Repeat("a", 101),
		"users?min_level=-1", "users?min_level=7", "users?min_level=lv1",
		"trend?start_date=2026-10-14&end_date=2026-10-13", "trend?start_date=2026-01-01&end_date=2026-10-01",
		"trend?start_date=invalid", "trend?user_id=-1", "trend?end_date=2099-01-01",
	} {
		req := httptest.NewRequest(http.MethodGet, "/api/token-plan/statistics/"+query, nil)
		req.Header.Set("Authorization", "Bearer "+admin)
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, req)
		assert.Equal(t, 400, response.Code, query)
	}
	var count int64
	require.NoError(t, db.Model(&model.TokenPlanWeek{}).Count(&count).Error)
	assert.Zero(t, count, "GET statistics must not create ledgers")
}
