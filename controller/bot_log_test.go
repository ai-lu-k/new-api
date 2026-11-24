package controller

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"maps"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// botTestEngine mounts the whole support-bot surface with the middleware the
// router applies, so a test exercises credential checks and rate limiting too.
func botTestEngine() *gin.Engine {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	route := engine.Group("/api/bot")
	route.Use(middleware.DisableCache(), middleware.BotTokenAuth(), middleware.BotTokenRateLimit())
	route.Any("/logs", GetBotLogs)
	route.Any("/account", GetBotAccount)
	route.Any("/usage", GetBotUsage)
	route.Any("/bindings", HandleBotBinding)
	return engine
}

func botLogRequest(engine *gin.Engine, method, query string, headers map[string]string) *httptest.ResponseRecorder {
	return botRequest(engine, method, "/api/bot/logs"+query, "", headers)
}

func botRequest(engine *gin.Engine, method, target, body string, headers map[string]string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	for name, value := range headers {
		req.Header.Set(name, value)
	}
	engine.ServeHTTP(recorder, req)
	return recorder
}

// A bot row is a closed shape. Asserting the exact key set means a new field on
// model.Log cannot reach the bot without this test changing too.
func TestBotLogRowIsAWhitelistProjection(t *testing.T) {
	row := &model.Log{
		Id:                9001,
		UserId:            42,
		CreatedAt:         1761000000,
		Type:              model.LogTypeConsume,
		Content:           "upstream said: your key is sk-secret",
		Username:          "mei",
		TokenName:         "cli",
		ModelName:         "gpt-4o",
		Quota:             1500,
		PromptTokens:      12,
		CompletionTokens:  34,
		UseTime:           2,
		IsStream:          true,
		ChannelId:         77,
		ChannelName:       "hk-prod-1",
		TokenId:           5,
		Group:             "default",
		Ip:                "203.0.113.9",
		RequestId:         "req-visible",
		UpstreamRequestId: "upstream-hidden",
		Other:             `{"admin_info":{"server_ip":"10.0.0.9","node_name":"hk-node-1"},"stream_status":{"status":"ok"}}`,
	}

	encoded, err := common.Marshal(botLogItemFromRow(row))
	require.NoError(t, err)

	var decoded map[string]any
	require.NoError(t, common.Unmarshal(encoded, &decoded))
	assert.Equal(t, []string{
		"completion_tokens",
		"created_at",
		"error_class",
		"group",
		"is_stream",
		"model_name",
		"prompt_tokens",
		"quota",
		"request_id",
		"token_name",
		"type",
		"use_time",
	}, slices.Sorted(maps.Keys(decoded)))

	for _, forbidden := range []string{"hk-prod-1", "203.0.113.9", "upstream-hidden", "sk-secret", "10.0.0.9", "hk-node-1"} {
		assert.NotContains(t, string(encoded), forbidden)
	}
	assert.Equal(t, "req-visible", decoded["request_id"])
}

func TestBotErrorClassIsAFixedEnum(t *testing.T) {
	cases := []struct {
		name    string
		logType int
		other   string
		want    string
	}{
		{"successful consume", model.LogTypeConsume, `{"status_code":200}`, ""},
		{"interrupted stream", model.LogTypeConsume, `{"stream_status":{"status":"error"}}`, "interrupted"},
		{"quota exhausted by code", model.LogTypeError, `{"status_code":403,"error_code":"insufficient_user_quota"}`, "quota_exhausted"},
		{"quota exhausted by status", model.LogTypeError, `{"status_code":402}`, "quota_exhausted"},
		{"credential rejected", model.LogTypeError, `{"status_code":401}`, "auth_failed"},
		{"model missing", model.LogTypeError, `{"status_code":404}`, "model_unavailable"},
		{"gateway timeout", model.LogTypeError, `{"status_code":504}`, "timeout"},
		{"rate limited", model.LogTypeError, `{"status_code":429}`, "rate_limited"},
		{"malformed request", model.LogTypeError, `{"status_code":400}`, "invalid_request"},
		{"upstream failure", model.LogTypeError, `{"status_code":502}`, "upstream_error"},
		{"unrecognized status", model.LogTypeError, `{"status_code":418}`, "other"},
		{"unparsable payload", model.LogTypeError, `upstream exploded: secret detail`, "other"},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			row := &model.Log{Type: testCase.logType, Other: testCase.other}
			assert.Equal(t, testCase.want, botErrorClass(row))
		})
	}
}

// The credential is the only thing standing between the internet and a user's
// usage rows, so every non-bot credential is asserted to fail. The account lookup
// and the log query run on every supported database.
func TestBotLogAccessRequiresTheBotCredential(t *testing.T) {
	for _, dialect := range []struct{ kind, env string }{
		{"sqlite", ""},
		{"mysql", "TEST_MYSQL_DSN"},
		{"postgres", "TEST_POSTGRES_DSN"},
	} {
		t.Run(dialect.kind, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env + " to run this database")
			}
			// A per-dialect credential keeps every dialect's rate-limit budget of
			// this shared limiter untouched by the others.
			botToken := "bot-credential-" + dialect.kind
			t.Setenv(middleware.BotTokenEnv, botToken)

			database := modelManagementDB(t, dialect.kind, os.Getenv(dialect.env))
			require.NoError(t, database.AutoMigrate(&model.Log{}))
			owner := &model.User{Username: "mei", Password: "placeholder", AffCode: "mei", Status: common.UserStatusEnabled, Group: "default"}
			require.NoError(t, database.Create(owner).Error)
			other := &model.User{Username: "someone-else", Password: "placeholder", AffCode: "other", Status: common.UserStatusEnabled, Group: "default"}
			require.NoError(t, database.Create(other).Error)
			require.NoError(t, database.Create(&model.Log{
				UserId: owner.Id, Username: owner.Username, CreatedAt: common.GetTimestamp(), Type: model.LogTypeConsume,
				ModelName: "gpt-4o", Quota: 1500, TokenName: "cli", Group: "default", RequestId: "req-visible",
				ChannelId: 77, Ip: "203.0.113.9", UpstreamRequestId: "upstream-hidden",
				Other: `{"admin_info":{"server_ip":"10.0.0.9"}}`,
			}).Error)
			require.NoError(t, database.Create(&model.Log{
				UserId: other.Id, Username: other.Username, CreatedAt: common.GetTimestamp(), Type: model.LogTypeConsume,
				ModelName: "claude-sonnet-4", Quota: 999,
			}).Error)

			engine := botTestEngine()
			botHeaders := map[string]string{middleware.BotTokenHeader: botToken}

			t.Run("no credential", func(t *testing.T) {
				recorder := botLogRequest(engine, http.MethodGet, "?user=mei", nil)
				assert.Equal(t, http.StatusUnauthorized, recorder.Code)
				assert.Empty(t, recorder.Body.String(), "a rejection carries no detail")
			})
			t.Run("wrong credential", func(t *testing.T) {
				recorder := botLogRequest(engine, http.MethodGet, "?user=mei", map[string]string{middleware.BotTokenHeader: botToken + "x"})
				assert.Equal(t, http.StatusUnauthorized, recorder.Code)
			})
			t.Run("user api key is not a bot credential", func(t *testing.T) {
				recorder := botLogRequest(engine, http.MethodGet, "?user=mei", map[string]string{"Authorization": "Bearer sk-user-key"})
				assert.Equal(t, http.StatusUnauthorized, recorder.Code)
			})
			t.Run("session cookie is not a bot credential", func(t *testing.T) {
				recorder := botLogRequest(engine, http.MethodGet, "?user=mei", map[string]string{"Cookie": "session=abc123"})
				assert.Equal(t, http.StatusUnauthorized, recorder.Code)
			})
			t.Run("unconfigured surface stays invisible", func(t *testing.T) {
				t.Setenv(middleware.BotTokenEnv, "")
				recorder := botLogRequest(engine, http.MethodGet, "?user=mei", botHeaders)
				assert.Equal(t, http.StatusNotFound, recorder.Code)
			})
			t.Run("only get is accepted", func(t *testing.T) {
				recorder := botLogRequest(engine, http.MethodDelete, "?user=mei", botHeaders)
				assert.Equal(t, http.StatusMethodNotAllowed, recorder.Code)
				assert.Contains(t, recorder.Body.String(), "method_not_allowed")
			})
			t.Run("oversized window is refused instead of clamped", func(t *testing.T) {
				now := common.GetTimestamp()
				recorder := botLogRequest(engine, http.MethodGet, fmt.Sprintf("?user=mei&since=%d&until=%d", now-botMaxWindowSeconds-1, now), botHeaders)
				assert.Equal(t, http.StatusBadRequest, recorder.Code)
				assert.Contains(t, recorder.Body.String(), "window_too_large")
			})
			t.Run("unknown account", func(t *testing.T) {
				recorder := botLogRequest(engine, http.MethodGet, "?user=no-such-user", botHeaders)
				assert.Equal(t, http.StatusNotFound, recorder.Code)
				assert.Contains(t, recorder.Body.String(), "user_not_found")
			})
			t.Run("like pattern is not a model filter", func(t *testing.T) {
				recorder := botLogRequest(engine, http.MethodGet, "?user=mei&model=gpt%25", botHeaders)
				assert.Equal(t, http.StatusBadRequest, recorder.Code)
				assert.Contains(t, recorder.Body.String(), "invalid_params")
			})
			t.Run("whitelisted rows for the requested account", func(t *testing.T) {
				recorder := botLogRequest(engine, http.MethodGet, fmt.Sprintf("?user=%d", owner.Id), botHeaders)
				require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
				body := recorder.Body.String()
				assert.Contains(t, body, "req-visible")
				assert.Contains(t, body, "gpt-4o")
				assert.NotContains(t, body, "203.0.113.9")
				assert.NotContains(t, body, "upstream-hidden")
				assert.NotContains(t, body, "10.0.0.9")
				assert.NotContains(t, body, "claude-sonnet-4", "another account's rows are never mixed in")

				var response struct {
					Data struct {
						User struct {
							Id       int    `json:"id"`
							Username string `json:"username"`
						} `json:"user"`
						Total int              `json:"total"`
						Items []map[string]any `json:"items"`
					} `json:"data"`
				}
				require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
				assert.Equal(t, owner.Id, response.Data.User.Id)
				assert.Equal(t, "mei", response.Data.User.Username)
				assert.Len(t, response.Data.Items, 1)
				assert.Equal(t, float64(model.LogTypeConsume), response.Data.Items[0]["type"])
			})
			t.Run("queries are audited without the credential", func(t *testing.T) {
				var audit model.AuditLog
				require.NoError(t, database.Where("category = ?", model.AuditCategoryBot).Order("created_at desc").Take(&audit).Error)
				assert.Equal(t, 0, audit.UserId, "a service actor must not surface in the queried account's own audit page")
				assert.Equal(t, "bot.log.read", audit.Action)
				assert.Equal(t, "bot_token", audit.AuthMethod)
				assert.Equal(t, fmt.Sprintf("Support bot read the usage logs of mei (ID: %d): 1 of 1 rows", owner.Id), audit.Content)
				digest := sha256.Sum256([]byte(botToken))
				assert.Equal(t, hex.EncodeToString(digest[:]), audit.TokenRef)
				encoded, err := common.Marshal(audit)
				require.NoError(t, err)
				assert.NotContains(t, string(encoded), botToken)
			})
		})
	}
}

// A shared credential must not allow sweeping account ids for the whole table.
func TestBotLogBudgetIsBoundedPerCredential(t *testing.T) {
	t.Setenv(middleware.BotTokenEnv, "bot-budget-credential")
	modelManagementDB(t, "sqlite", "")
	engine := botTestEngine()
	headers := map[string]string{middleware.BotTokenHeader: "bot-budget-credential"}

	for attempts := 0; ; attempts++ {
		recorder := botLogRequest(engine, http.MethodGet, "?user=no-such-user", headers)
		if recorder.Code == http.StatusTooManyRequests {
			assert.Contains(t, recorder.Body.String(), "rate_limited")
			assert.NotEmpty(t, recorder.Header().Get("Retry-After"))
			return
		}
		require.Less(t, attempts, 200, "a fixed budget must be exhausted")
		require.Equal(t, http.StatusNotFound, recorder.Code, "requests within budget reach the handler")
	}
}

// The account surface is the only place the bot learns a balance. It must stay a
// closed projection: no credential, email or affiliate identifier reaches it, and
// quota keeps its internal unit with the site exchange rate sent alongside so the
// bot never hardcodes one.
func TestBotAccountBindingAndUsageSurface(t *testing.T) {
	for _, dialect := range []struct{ kind, env string }{
		{"sqlite", ""},
		{"mysql", "TEST_MYSQL_DSN"},
		{"postgres", "TEST_POSTGRES_DSN"},
	} {
		t.Run(dialect.kind, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env + " to run this database")
			}
			botToken := "bot-surface-" + dialect.kind
			t.Setenv(middleware.BotTokenEnv, botToken)

			database := modelManagementDB(t, dialect.kind, os.Getenv(dialect.env))
			require.NoError(t, database.AutoMigrate(&model.Log{}, &model.QQBinding{}))
			require.NoError(t, database.AutoMigrate(&model.Log{}, &model.QQBinding{}), "a repeated migration must be a no-op")

			secret := "secret-access-token"
			owner := &model.User{
				Username: "mei", Password: "placeholder", AffCode: "mei", Status: common.UserStatusEnabled,
				Group: "default", Quota: 530145, UsedQuota: 2112000, RequestCount: 69091,
				Email: "mei@example.com", AccessToken: &secret,
			}
			require.NoError(t, database.Create(owner).Error)
			other := &model.User{Username: "someone-else", Password: "placeholder", AffCode: "other", Status: common.UserStatusEnabled, Group: "default"}
			require.NoError(t, database.Create(other).Error)

			now := common.GetTimestamp()
			require.NoError(t, database.Create(&model.Log{
				UserId: owner.Id, Username: owner.Username, CreatedAt: now, Type: model.LogTypeConsume,
				ModelName: "gpt-4o", Quota: 1500, PromptTokens: 10, CompletionTokens: 20,
			}).Error)
			require.NoError(t, database.Create(&model.Log{
				UserId: owner.Id, Username: owner.Username, CreatedAt: now, Type: model.LogTypeConsume,
				ModelName: "claude-sonnet-4", Quota: 999,
			}).Error)
			require.NoError(t, database.Create(&model.Log{
				UserId: owner.Id, Username: owner.Username, CreatedAt: now, Type: model.LogTypeError,
				Other: `{"status_code":402}`,
			}).Error)
			require.NoError(t, database.Create(&model.Log{
				UserId: other.Id, Username: other.Username, CreatedAt: now, Type: model.LogTypeConsume,
				ModelName: "gpt-4o", Quota: 77777,
			}).Error)

			engine := botTestEngine()
			headers := map[string]string{middleware.BotTokenHeader: botToken, "Content-Type": "application/json"}
			bindPath := "/api/bot/bindings"

			t.Run("the surface needs the bot credential", func(t *testing.T) {
				recorder := botRequest(engine, http.MethodGet, "/api/bot/account?user=mei", "", nil)
				assert.Equal(t, http.StatusUnauthorized, recorder.Code)
				assert.Empty(t, recorder.Body.String())
			})

			t.Run("a member binds by naming the account", func(t *testing.T) {
				recorder := botRequest(engine, http.MethodPost, bindPath,
					`{"group_openid":"grp-1","qq_openid":"qq-1","qq_name":"阿七","username":"mei"}`, headers)
				require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
				assert.Contains(t, recorder.Body.String(), `"username":"mei"`)
				assert.NotContains(t, recorder.Body.String(), "placeholder", "the account row itself is never echoed")
			})

			t.Run("the same claim can be read back", func(t *testing.T) {
				recorder := botRequest(engine, http.MethodGet, bindPath+"?group_openid=grp-1&qq_openid=qq-1", "", headers)
				require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
				assert.Contains(t, recorder.Body.String(), `"username":"mei"`)

				unbound := botRequest(engine, http.MethodGet, bindPath+"?group_openid=grp-1&qq_openid=qq-2", "", headers)
				require.Equal(t, http.StatusOK, unbound.Code, unbound.Body.String())
				assert.Contains(t, unbound.Body.String(), `"binding":null`, "an unbound member is a normal answer")
			})

			t.Run("an account resolves through the binding", func(t *testing.T) {
				recorder := botRequest(engine, http.MethodGet, "/api/bot/account?group_openid=grp-1&qq_openid=qq-1", "", headers)
				require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())

				var response struct {
					Data struct {
						User         map[string]any `json:"user"`
						QuotaPerUnit float64        `json:"quota_per_unit"`
						ResolvedBy   string         `json:"resolved_by"`
					} `json:"data"`
				}
				require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
				assert.Equal(t, "qq_binding", response.Data.ResolvedBy)
				assert.Equal(t, common.QuotaPerUnit, response.Data.QuotaPerUnit)
				assert.Equal(t, []string{
					"created_at", "group", "id", "quota", "request_count", "status", "used_quota", "username",
				}, slices.Sorted(maps.Keys(response.Data.User)))
				assert.Equal(t, float64(530145), response.Data.User["quota"])
				body := recorder.Body.String()
				for _, forbidden := range []string{"mei@example.com", secret, "placeholder", "aff_code", "mei-"} {
					assert.NotContains(t, body, forbidden)
				}
			})

			t.Run("an unbound member is told to bind first", func(t *testing.T) {
				recorder := botRequest(engine, http.MethodGet, "/api/bot/account?group_openid=grp-1&qq_openid=qq-unbound", "", headers)
				assert.Equal(t, http.StatusNotFound, recorder.Code)
				assert.Contains(t, recorder.Body.String(), "binding_not_found")
			})

			t.Run("an account already claimed cannot be taken over", func(t *testing.T) {
				recorder := botRequest(engine, http.MethodPost, bindPath,
					`{"group_openid":"grp-1","qq_openid":"qq-2","username":"mei"}`, headers)
				assert.Equal(t, http.StatusConflict, recorder.Code)
				assert.Contains(t, recorder.Body.String(), "account_already_bound")

				var refused int64
				require.NoError(t, database.Model(&model.QQBinding{}).
					Where("group_openid = ? AND qq_openid = ?", "grp-1", "qq-2").Count(&refused).Error)
				assert.Zero(t, refused, "a refused claim writes nothing")
			})

			t.Run("unknown accounts and malformed identities are refused", func(t *testing.T) {
				unknown := botRequest(engine, http.MethodPost, bindPath,
					`{"group_openid":"grp-1","qq_openid":"qq-3","username":"no-such-user"}`, headers)
				assert.Equal(t, http.StatusNotFound, unknown.Code)
				assert.Contains(t, unknown.Body.String(), "user_not_found")

				malformed := botRequest(engine, http.MethodPost, bindPath,
					`{"group_openid":"grp 1","qq_openid":"qq-3","username":"mei"}`, headers)
				assert.Equal(t, http.StatusBadRequest, malformed.Code)
				assert.Contains(t, malformed.Body.String(), "invalid_params")

				assert.Equal(t, http.StatusMethodNotAllowed, botRequest(engine, http.MethodPut, bindPath, ``, headers).Code)
			})

			t.Run("usage comes back aggregated, not as rows", func(t *testing.T) {
				recorder := botRequest(engine, http.MethodGet, "/api/bot/usage?group_openid=grp-1&qq_openid=qq-1", "", headers)
				require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())

				var response struct {
					Data struct {
						Totals model.BotUsageTotals  `json:"totals"`
						Models []model.BotUsageModel `json:"models"`
						Types  []model.BotUsageType  `json:"types"`
						Errors []struct {
							ErrorClass string `json:"error_class"`
							Requests   int    `json:"requests"`
						} `json:"errors"`
					} `json:"data"`
				}
				require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
				assert.Equal(t, model.BotUsageTotals{Requests: 2, Quota: 2499, PromptTokens: 10, CompletionTokens: 20}, response.Data.Totals)
				require.Len(t, response.Data.Models, 2)
				assert.Equal(t, "gpt-4o", response.Data.Models[0].ModelName, "the largest spend is listed first")
				assert.Equal(t, int64(1500), response.Data.Models[0].Quota)
				assert.Contains(t, response.Data.Types, model.BotUsageType{Type: model.LogTypeConsume, Requests: 2})
				assert.Contains(t, response.Data.Types, model.BotUsageType{Type: model.LogTypeError, Requests: 1})
				assert.Equal(t, "quota_exhausted", response.Data.Errors[0].ErrorClass)
				assert.NotContains(t, recorder.Body.String(), "77777", "another account's usage is never mixed in")
			})

			t.Run("binding writes are audited", func(t *testing.T) {
				var audit model.AuditLog
				require.NoError(t, database.Where("action = ?", "bot.binding.create").Order("id desc").Take(&audit).Error)
				assert.Equal(t, model.AuditCategoryBot, audit.Category)
				assert.Equal(t, 0, audit.UserId)
				assert.Contains(t, audit.Content, "mei")
			})

			t.Run("unbinding reports what actually happened", func(t *testing.T) {
				first := botRequest(engine, http.MethodDelete, bindPath+"?group_openid=grp-1&qq_openid=qq-1", "", headers)
				require.Equal(t, http.StatusOK, first.Code, first.Body.String())
				assert.Contains(t, first.Body.String(), `"removed":true`)

				second := botRequest(engine, http.MethodDelete, bindPath+"?group_openid=grp-1&qq_openid=qq-1", "", headers)
				require.Equal(t, http.StatusOK, second.Code, second.Body.String())
				assert.Contains(t, second.Body.String(), `"removed":false`)
			})
		})
	}
}
