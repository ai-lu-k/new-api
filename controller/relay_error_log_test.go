package controller

import (
	"context"
	"errors"
	"fmt"
	"github.com/QuantumNous/new-api/middleware"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/relaytrace"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestProcessChannelErrorUsesSnapshotWithoutLeakingChannelMetadata(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousRedisEnabled := common.RedisEnabled
	previousMainDatabaseType := common.MainDatabaseType()
	previousLogDatabaseType := common.LogDatabaseType()
	previousErrorLogEnabled := constant.ErrorLogEnabled

	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := database.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, database.AutoMigrate(&model.User{}, &model.Log{}))
	model.DB, model.LOG_DB = database, database
	common.RedisEnabled = false
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	constant.ErrorLogEnabled = true
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.RedisEnabled = previousRedisEnabled
		common.SetDatabaseTypes(previousMainDatabaseType, previousLogDatabaseType)
		constant.ErrorLogEnabled = previousErrorLogEnabled
		require.NoError(t, sqlDB.Close())
	})

	require.NoError(t, database.Create(&model.User{Id: 7, Username: "log-owner", Group: "default"}).Error)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	ctx.Set("id", 7)
	ctx.Set("username", "log-owner")
	ctx.Set("token_name", "test-token")
	ctx.Set("token_id", 11)
	ctx.Set("original_model", "gpt-test")
	ctx.Set("group", "default")
	ctx.Set("channel_id", 202)
	ctx.Set("channel_name", "mutable-context-channel")
	ctx.Set("channel_type", 9)
	ctx.Set("use_channel", []string{"101"})
	common.SetContextKey(ctx, constant.ContextKeyRequestStartTime, time.Now().Add(-time.Second))

	channelSnapshot := types.ChannelError{
		ChannelId:   101,
		ChannelType: 1,
		ChannelName: "snapshot-channel",
		AutoBan:     false,
	}
	apiErr := types.NewOpenAIError(errors.New("upstream failed"), types.ErrorCodeBadResponseStatusCode, http.StatusBadGateway)

	processChannelError(ctx, channelSnapshot, apiErr, nil)

	var stored model.Log
	require.NoError(t, database.First(&stored).Error)
	assert.Equal(t, channelSnapshot.ChannelId, stored.ChannelId)
	storedOther, err := common.StrToMap(stored.Other)
	require.NoError(t, err)
	assert.Equal(t, float64(http.StatusBadGateway), storedOther["status_code"])
	for _, key := range []string{"channel_id", "channel_name", "channel_type"} {
		assert.NotContains(t, storedOther, key)
	}
	adminInfo, ok := storedOther["admin_info"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, []any{"101"}, adminInfo["use_channel"])

	logs, total, err := model.GetUserLogs(7, model.LogTypeError, 0, 0, "", "", 0, 10, "", "", "")
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	require.Len(t, logs, 1)
	assert.Equal(t, channelSnapshot.ChannelId, logs[0].ChannelId)
	assert.Empty(t, logs[0].ChannelName)
	userOther, err := common.StrToMap(logs[0].Other)
	require.NoError(t, err)
	assert.NotContains(t, userOther, "admin_info")
	for _, key := range []string{"channel_id", "channel_name", "channel_type"} {
		assert.NotContains(t, userOther, key)
	}
}

func TestRelayDiagnosticLogDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres", "clickhouse"} {
		t.Run(dialect, func(t *testing.T) {
			if dialect != "sqlite" && os.Getenv("TEST_DIAGNOSTIC_"+strings.ToUpper(dialect)+"_DSN") == "" {
				t.Skip("real database DSN not configured")
			}
			previousDB, previousLogDB := model.DB, model.LOG_DB
			previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
			previousMaster, previousRedis := common.IsMasterNode, common.RedisEnabled
			common.IsMasterNode = true
			common.RedisEnabled = false
			mainDB, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
			require.NoError(t, err)
			require.NoError(t, mainDB.AutoMigrate(&model.User{}))
			require.NoError(t, mainDB.Create(&model.User{Id: 7, Username: "diagnostic-owner", Group: "default"}).Error)
			model.DB = mainDB
			common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
			var logDB *gorm.DB
			switch dialect {
			case "sqlite":
				logDB, err = gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
				require.NoError(t, err)
				require.NoError(t, logDB.AutoMigrate(&model.Log{}))
				model.LOG_DB = logDB
			default:
				dsn := os.Getenv("TEST_DIAGNOSTIC_" + strings.ToUpper(dialect) + "_DSN")
				if dsn == "" {
					t.Skip("real database DSN not configured")
				}
				t.Setenv("LOG_SQL_DSN", dsn)
				require.NoError(t, model.InitLogDB())
				logDB = model.LOG_DB
			}
			mainSQL, err := mainDB.DB()
			require.NoError(t, err)
			logSQL, err := logDB.DB()
			require.NoError(t, err)
			t.Cleanup(func() {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				require.NoError(t, model.WaitRelayDiagnosticWrites(ctx))
				model.DB, model.LOG_DB = previousDB, previousLogDB
				common.SetDatabaseTypes(previousMain, previousLog)
				common.IsMasterNode, common.RedisEnabled = previousMaster, previousRedis
				require.NoError(t, mainSQL.Close())
				require.NoError(t, logSQL.Close())
			})
			ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
			ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/responses?secret=query", nil)
			requestID := "diagnostic-" + dialect + "-" + common.NewRequestId()
			ctx.Set(common.RequestIdKey, requestID)
			ctx.Set("username", "diagnostic-owner")
			trace := relaytrace.NewAttempt(relaytrace.NewRegistry(), relaytrace.Summary{Attempt: 1, Scope: relaytrace.Scope{Channel: 18, Model: "model", Path: "/v1/responses"}, Budgets: relaytrace.Budgets{Headers: 120, FirstByte: 60, Idle: 60, Total: 1800}}, requestID, time.Now())
			trace.Mark("heartbeat", "upstream", 12)
			trace.ObserveSSE(`{"type":"response.created","response":{"instructions":"secret-prompt"}}`)
			trace.Finish("timeout", &relaytrace.TimeoutError{Phase: "idle"})
			info := &relaycommon.RelayInfo{UserId: 7, TokenId: 11, OriginModelName: "model", UserGroup: "default", StartTime: time.Now(), TransportTrace: trace, TransportAttempts: []*relaytrace.Attempt{trace}}
			regular := model.NewLogOther()
			service.AppendTransportDiagnostics(info, regular)
			assert.NotContains(t, regular.Snapshot(), "root_info", "unsampled failure timelines use the bounded error writer only")
			require.True(t, service.QueueRelayTimeoutLog(ctx, info))
			require.True(t, service.QueueRelayTimeoutLog(ctx, info), "same timeout is deduplicated")
			waitCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			require.NoError(t, model.WaitRelayDiagnosticWrites(waitCtx))
			var rows []model.Log
			require.NoError(t, logDB.Where("request_id = ?", requestID).Find(&rows).Error)
			require.Len(t, rows, 1)
			row := rows[0]
			assert.Equal(t, model.LogTypeError, row.Type)
			assert.Equal(t, 0, row.Quota)
			assert.NotContains(t, row.Other, "secret")
			assert.NotContains(t, row.Other, "instructions")
			stored, err := common.StrToMap(row.Other)
			require.NoError(t, err)
			assert.Contains(t, stored, "relay_outcome")
			assert.Contains(t, stored, "admin_info")
			assert.Contains(t, stored, "root_info")
			userLogs, total, err := model.GetUserLogs(7, model.LogTypeError, 0, 0, "", "", 0, 10, "", requestID, "")
			require.NoError(t, err)
			require.Equal(t, int64(1), total)
			require.Len(t, userLogs, 1)
			userOther, err := common.StrToMap(userLogs[0].Other)
			require.NoError(t, err)
			assert.Contains(t, userOther, "relay_outcome")
			assert.NotContains(t, userOther, "admin_info")
			assert.NotContains(t, userOther, "root_info")
			// Repeat startup/migration against the populated fixture; preserve the row.
			if dialect == "sqlite" {
				require.NoError(t, logDB.AutoMigrate(&model.Log{}))
			} else {
				require.NoError(t, model.InitLogDB())
				reopenedSQL, err := model.LOG_DB.DB()
				require.NoError(t, err)
				defer reopenedSQL.Close()
			}
			var count int64
			require.NoError(t, model.LOG_DB.Model(&model.Log{}).Where("request_id = ?", requestID).Count(&count).Error)
			assert.Equal(t, int64(1), count)
		})
	}
}

func TestRelayDiagnosticFailedWritesAreCountedWithoutBlockingRequests(t *testing.T) {
	previousLogDB, previousRedis := model.LOG_DB, common.RedisEnabled
	common.RedisEnabled = false
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	model.LOG_DB = database
	t.Cleanup(func() {
		model.LOG_DB = previousLogDB
		common.RedisEnabled = previousRedis
		db, err := database.DB()
		require.NoError(t, err)
		require.NoError(t, db.Close())
	})
	before := model.DiagnosticWriteStats()["failed"]
	require.True(t, model.EnqueueRelayDiagnostic(&model.Log{Content: "Relay timeout diagnostics", Other: "{}"}))
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	require.NoError(t, model.WaitRelayDiagnosticWrites(ctx))
	assert.Equal(t, before+1, model.DiagnosticWriteStats()["failed"])
	require.False(t, model.EnqueueRelayDiagnostic(&model.Log{Other: strings.Repeat("x", model.DiagnosticMaxBytes+1)}))
}

func TestRelayTraceControlsRequireRootAndTrustedOrigin(t *testing.T) {
	_, _ = setupSecurityEnrollmentTest(t)
	oldWindows, oldSecure, oldOrigins := relaytrace.Windows, common.SessionCookieSecure, common.SessionCookieTrustedURLs
	relaytrace.Windows = relaytrace.NewRegistry()
	common.SessionCookieSecure = true
	common.SessionCookieTrustedURLs = []string{"https://console.example"}
	t.Cleanup(func() {
		relaytrace.Windows = oldWindows
		common.SessionCookieSecure = oldSecure
		common.SessionCookieTrustedURLs = oldOrigins
	})
	tokens := map[int]string{}
	for _, role := range []int{common.RoleCommonUser, common.RoleAdminUser, common.RoleRootUser} {
		user := &model.User{Username: fmt.Sprintf("trace-role-%d", role), AffCode: fmt.Sprintf("trace-role-%d", role), Role: role, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1}
		require.NoError(t, model.DB.Create(user).Error)
		session, err := service.CreateLoginSession(user.Id, "password", "127.0.0.1", "trace-controls")
		require.NoError(t, err)
		tokens[role] = session.AccessToken
	}
	router := gin.New()
	group := router.Group("/api/relay-diagnostics", middleware.RootAuth())
	group.GET("", GetRelayDiagnostics)
	group.PUT("", middleware.SessionCookieOriginGuard(), UpdateRelayDiagnostics)
	for _, tc := range []struct {
		name   string
		role   int
		origin string
		method string
		want   int
	}{
		{"anonymous read", 0, "", http.MethodGet, http.StatusUnauthorized},
		{"ordinary user read", common.RoleCommonUser, "", http.MethodGet, http.StatusForbidden},
		{"administrator read", common.RoleAdminUser, "", http.MethodGet, http.StatusForbidden},
		{"root read", common.RoleRootUser, "", http.MethodGet, http.StatusOK},
		{"foreign origin write", common.RoleRootUser, "https://foreign.example", http.MethodPut, http.StatusForbidden},
		{"missing origin write", common.RoleRootUser, "", http.MethodPut, http.StatusForbidden},
		{"trusted origin write", common.RoleRootUser, "https://console.example", http.MethodPut, http.StatusOK},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, "https://console.example/api/relay-diagnostics", strings.NewReader(`{"scope":{"channel_id":18,"model":"model","path":"/v1/responses"},"enabled":true}`))
			req.Header.Set("Content-Type", "application/json")
			if tc.role != 0 {
				req.Header.Set("Authorization", "Bearer "+tokens[tc.role])
			}
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}
			response := httptest.NewRecorder()
			router.ServeHTTP(response, req)
			assert.Equal(t, tc.want, response.Code, response.Body.String())
			assert.NotContains(t, response.Body.String(), tokens[common.RoleRootUser])
		})
	}
	windows, _, _ := relaytrace.Windows.Status(time.Now())
	require.Len(t, windows, 1)
	assert.Equal(t, "manual", windows[0].Reason)
}
