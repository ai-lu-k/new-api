package controller

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/naming_setting"
	"github.com/QuantumNous/new-api/setting/perf_metrics_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func TestModelDailyTokenDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case "sqlite":
				driver = sqlite.Open(filepath.Join(t.TempDir(), "daily.db"))
			case "mysql":
				if os.Getenv("TEST_MYSQL_DSN") == "" {
					t.Skip("TEST_MYSQL_DSN not set")
				}
				driver = mysql.Open(os.Getenv("TEST_MYSQL_DSN"))
			case "postgres":
				if os.Getenv("TEST_POSTGRES_DSN") == "" {
					t.Skip("TEST_POSTGRES_DSN not set")
				}
				driver = postgres.Open(os.Getenv("TEST_POSTGRES_DSN"))
			}
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "daily_test_"}})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(4)
			if dialect == "sqlite" {
				sqlDB.SetMaxOpenConns(1)
			}
			beforeDB, beforeDialect, beforeRedis, beforeLogs := model.DB, common.MainDatabaseType(), common.RedisEnabled, common.LogConsumeEnabled
			model.DB = db
			common.SetMainDatabaseType(common.DatabaseType(dialect))
			common.RedisEnabled = false
			common.LogConsumeEnabled = false
			tables := []any{&model.ModelDailyTokenReceipt{}, &model.ModelDailyTokenUsage{}, &model.Option{}, &model.User{}}
			t.Cleanup(func() {
				require.NoError(t, db.Migrator().DropTable(tables...))
				model.DB = beforeDB
				common.SetMainDatabaseType(beforeDialect)
				common.RedisEnabled = beforeRedis
				common.LogConsumeEnabled = beforeLogs
				require.NoError(t, sqlDB.Close())
			})
			versionQuery := "SELECT version()"
			if dialect == "sqlite" {
				versionQuery = "SELECT sqlite_version()"
			}
			var version string
			require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
			t.Log("database version:", version)
			for _, upgrade := range []bool{false, true} {
				t.Run(fmt.Sprintf("upgrade=%t", upgrade), func(t *testing.T) {
					require.NoError(t, db.Migrator().DropTable(tables...))
					require.NoError(t, db.AutoMigrate(&model.User{}, &model.Option{}))
					user := model.User{Id: 11, Username: "daily-owner", AffCode: "daily-owner", Password: "preserved-hash", AuthVersion: 1, Status: 1, Role: 1, Group: "default", Quota: 800}
					require.NoError(t, db.Create(&user).Error)
					if upgrade {
						require.NoError(t, db.Migrator().DropColumn(&model.User{}, "ModelDailyTokenLimits"))
					}
					require.NoError(t, db.AutoMigrate(tables...))
					require.NoError(t, db.AutoMigrate(tables...))
					var saved model.User
					require.NoError(t, db.First(&saved, 11).Error)
					assert.Equal(t, 800, saved.Quota)
					assert.Equal(t, "preserved-hash", saved.Password)
					assert.Nil(t, saved.ModelDailyTokenLimits)
					assert.Error(t, db.Create(&model.User{Username: "daily-owner", AffCode: "duplicate"}).Error)
					initial, err := model.GetModelDailyTokenSnapshot(context.Background(), 11)
					require.NoError(t, err)
					require.Len(t, initial.Models, 1)
					assert.Equal(t, "deepseek-v4.1-flash-x0.1", initial.Models[0].Model)
					assert.Equal(t, int64(200000000), initial.Models[0].Remaining)
					raw := `{"model-a":100,"model-b":300}`
					require.NoError(t, db.Create(&model.Option{Key: model.ModelDailyTokenLimitsOption, Value: raw}).Error)

					t.Run("actual usage idempotency and model independence", func(t *testing.T) {
						admitted, err := model.AdmitModelDailyTokens(context.Background(), 11, "model-a")
						require.NoError(t, err)
						require.NoError(t, model.RecordModelDailyTokens(admitted, 80))
						require.NoError(t, model.RecordModelDailyTokens(admitted, 80))
						require.NoError(t, model.RecordModelDailyTokens(admitted, 75))
						budgets, err := model.ModelDailyTokenBudgets(context.Background(), 11, time.Now())
						require.NoError(t, err)
						assert.Equal(t, int64(80), budgets[0].Used)
						assert.Equal(t, int64(20), budgets[0].Remaining)
						assert.Zero(t, budgets[1].Used)
						next, err := model.AdmitModelDailyTokens(context.Background(), 11, "model-a")
						require.NoError(t, err)
						require.NoError(t, model.RecordModelDailyTokens(next, 50))
						_, err = model.AdmitModelDailyTokens(context.Background(), 11, "model-a")
						var exceeded *model.ModelDailyTokenLimitError
						require.ErrorAs(t, err, &exceeded)
						assert.Equal(t, int64(130), exceeded.Used)
						assert.Equal(t, int64(100), exceeded.Limit)
						assert.Contains(t, exceeded.Error(), "another model")
						_, err = model.AdmitModelDailyTokens(context.Background(), 11, "model-b")
						require.NoError(t, err)
					})
					t.Run("administrator overrides preserve omission and self update cannot change caps", func(t *testing.T) {
						require.NoError(t, db.First(&saved, 11).Error)
						custom := model.ModelTokenLimits{"model-a": 200, "model-b": -1}
						saved.ModelDailyTokenLimits = &custom
						require.NoError(t, db.Transaction(func(tx *gorm.DB) error { return saved.EditWithTx(tx, false) }))
						_, err := model.AdmitModelDailyTokens(context.Background(), 11, "model-a")
						require.NoError(t, err)
						require.NoError(t, db.First(&saved, 11).Error)
						require.NotNil(t, saved.ModelDailyTokenLimits)
						assert.Equal(t, int64(-1), (*saved.ModelDailyTokenLimits)["model-b"])
						saved.ModelDailyTokenLimits = nil
						require.NoError(t, saved.EditWithTx(db, false))
						require.NoError(t, db.First(&saved, 11).Error)
						assert.Equal(t, int64(200), (*saved.ModelDailyTokenLimits)["model-a"])
						forbidden := model.ModelTokenLimits{"model-a": -1}
						saved.ModelDailyTokenLimits = &forbidden
						require.NoError(t, db.Transaction(func(tx *gorm.DB) error { return saved.UpdateWithTx(tx, false) }))
						require.NoError(t, db.First(&saved, 11).Error)
						assert.Equal(t, int64(200), (*saved.ModelDailyTokenLimits)["model-a"])
						zero := model.ModelTokenLimits{"model-a": 0}
						saved.ModelDailyTokenLimits = &zero
						require.NoError(t, saved.EditWithTx(db, false))
						_, err = model.AdmitModelDailyTokens(context.Background(), 11, "model-a")
						assert.Error(t, err)
						inherited := model.ModelTokenLimits{}
						saved.ModelDailyTokenLimits = &inherited
						require.NoError(t, saved.EditWithTx(db, false))
						_, err = model.AdmitModelDailyTokens(context.Background(), 11, "model-a")
						assert.Error(t, err, "inheritance restores global cap 100")
						unlimited := model.ModelTokenLimits{"model-a": -1}
						saved.ModelDailyTokenLimits = &unlimited
						require.NoError(t, saved.EditWithTx(db, false))
						_, err = model.AdmitModelDailyTokens(context.Background(), 11, "model-a")
						require.NoError(t, err)
						saved.ModelDailyTokenLimits = &inherited
						require.NoError(t, saved.EditWithTx(db, false))

					})
					t.Run("aliases share counters and independent accounts do not", func(t *testing.T) {
						aliases := naming_setting.GetAliasesCopy()
						naming_setting.GetModelNamingSetting().Aliases.Set("alias-a", "model-a")
						defer func() {
							naming_setting.GetModelNamingSetting().Aliases.Clear()
							naming_setting.GetModelNamingSetting().Aliases.AddAll(aliases)
						}()
						for _, name := range []string{"alias-a@effort:high", "alias-a@thinking:on@temperature:0.2@topp:0.8"} {
							_, err := model.AdmitModelDailyTokens(context.Background(), 11, name)
							assert.Error(t, err, name)
						}
						other := model.User{Id: 22, Username: "daily-other", AffCode: "daily-other"}
						require.NoError(t, db.Create(&other).Error)
						_, err = model.AdmitModelDailyTokens(context.Background(), 22, "model-a")
						require.NoError(t, err)
					})
					t.Run("simultaneous completions add atomically without pre-reservation", func(t *testing.T) {
						contexts := make([]context.Context, 4)
						for i := range contexts {
							contexts[i], err = model.AdmitModelDailyTokens(context.Background(), 22, "model-a")
							require.NoError(t, err)
						}
						var wg sync.WaitGroup
						results := make(chan error, 4)
						for _, ctx := range contexts {
							wg.Go(func() { results <- model.RecordModelDailyTokens(ctx, 60) })
						}
						wg.Wait()
						close(results)
						for err := range results {
							require.NoError(t, err)
						}
						budgets, err := model.ModelDailyTokenBudgets(context.Background(), 22, time.Now())
						require.NoError(t, err)
						assert.Equal(t, int64(240), budgets[0].Used)
					})
					t.Run("midnight completion stays with admission day", func(t *testing.T) {
						ctx, err := model.AdmitModelDailyTokens(context.Background(), 11, "model-b")
						require.NoError(t, err)
						model.ModelDailyTokenAdmissionFromContext(ctx).DayStart -= 86400
						require.NoError(t, model.RecordModelDailyTokens(ctx, 90))
						budgets, err := model.ModelDailyTokenBudgets(context.Background(), 11, time.Now())
						require.NoError(t, err)
						assert.Zero(t, budgets[1].Used)
						yesterday, err := model.ModelDailyTokenBudgets(context.Background(), 11, time.Now().Add(-24*time.Hour))
						require.NoError(t, err)
						assert.Equal(t, int64(90), yesterday[1].Used)
					})
					t.Run("disabled logging and canceled client still persist usage", func(t *testing.T) {
						gin.SetMode(gin.TestMode)
						ctx, err := model.AdmitModelDailyTokens(context.Background(), 11, "model-b")
						require.NoError(t, err)
						canceled, cancel := context.WithCancel(ctx)
						cancel()
						c, _ := gin.CreateTestContext(httptest.NewRecorder())
						c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil).WithContext(canceled)
						model.RecordConsumeLog(c, 11, model.RecordConsumeLogParams{PromptTokens: 80, CompletionTokens: 10})
						budgets, err := model.ModelDailyTokenBudgets(context.Background(), 11, time.Now())
						require.NoError(t, err)
						assert.Equal(t, int64(90), budgets[1].Used)
						c.Request = c.Request.WithContext(context.Background())
						c.Set("id", 11)
						apiErr := service.CheckModelDailyTokenBudget(c, "model-a")
						require.NotNil(t, apiErr)
						assert.Equal(t, 429, apiErr.StatusCode)
						assert.Equal(t, "model_daily_token_limit_exceeded", fmt.Sprint(apiErr.ToOpenAIError().Code))
						assert.NotEmpty(t, c.Writer.Header().Get("Retry-After"))
					})
					t.Run("realtime idle is free and completed responses gate the next generation", func(t *testing.T) {
						var events [][]byte
						gate := service.NewRealtimeGenerationGate(context.Background(), 11, func([]byte) error { return nil }, func(payload []byte) error { events = append(events, payload); return nil }, "model-b")
						defer gate.Close()
						_, err := gate.ObserveServerMessage([]byte(`{"type":"session.created","session":{}}`))
						require.NoError(t, err)
						budgets, err := model.ModelDailyTokenBudgets(context.Background(), 11, time.Now())
						require.NoError(t, err)
						assert.Equal(t, int64(90), budgets[1].Used)
						require.NoError(t, gate.SendClientMessage([]byte(`{"type":"response.create"}`)))
						_, err = gate.ObserveServerMessage([]byte(`{"type":"response.created","response":{"id":"daily-response"}}`))
						require.NoError(t, err)
						_, err = gate.ObserveServerMessage([]byte(`{"type":"response.done","response":{"id":"daily-response","usage":{"input_tokens":200,"output_tokens":20}}}`))
						require.NoError(t, err)
						require.NoError(t, gate.SendClientMessage([]byte(`{"type":"response.create"}`)))
						require.Len(t, events, 1)
						assert.Contains(t, string(events[0]), "model_daily_token_limit_exceeded")
						budgets, err = model.ModelDailyTokenBudgets(context.Background(), 11, time.Now())
						require.NoError(t, err)
						assert.Equal(t, int64(310), budgets[1].Used)
					})
					t.Run("failed accounting is rolled back and retry records one receipt", func(t *testing.T) {
						ctx, err := model.AdmitModelDailyTokens(context.Background(), 22, "model-b")
						require.NoError(t, err)
						require.NoError(t, db.Callback().Update().Before("gorm:update").Register("daily:reject", func(tx *gorm.DB) {
							if tx.Statement.Schema != nil && tx.Statement.Schema.Name == "ModelDailyTokenUsage" {
								tx.AddError(errors.New("injected daily counter failure"))
							}
						}))
						assert.Error(t, model.RecordModelDailyTokens(ctx, 25))
						require.NoError(t, db.Callback().Update().Remove("daily:reject"))
						budgets, err := model.ModelDailyTokenBudgets(context.Background(), 22, time.Now())
						require.NoError(t, err)
						assert.Zero(t, budgets[1].Used)
						require.NoError(t, model.RecordModelDailyTokens(ctx, 25))
						require.NoError(t, model.RecordModelDailyTokens(ctx, 25))
						budgets, err = model.ModelDailyTokenBudgets(context.Background(), 22, time.Now())
						require.NoError(t, err)
						assert.Equal(t, int64(25), budgets[1].Used)
					})
					t.Run("self snapshot ignores another account query and pruning preserves current records", func(t *testing.T) {
						recorder := httptest.NewRecorder()
						c, _ := gin.CreateTestContext(recorder)
						c.Set("id", 11)
						c.Request = httptest.NewRequest(http.MethodGet, "/api/user/self/model-daily-tokens?user_id=22", nil)
						GetModelDailyTokenBudgets(c)
						assert.Equal(t, 200, c.Writer.Status())
						var response struct {
							Success bool                          `json:"success"`
							Data    model.ModelDailyTokenSnapshot `json:"data"`
						}
						require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
						assert.True(t, response.Success)
						require.Len(t, response.Data.Models, 2)
						assert.Equal(t, int64(130), response.Data.Models[0].Used)

						snapshot, err := model.GetModelDailyTokenSnapshot(context.Background(), 11)
						require.NoError(t, err)
						assert.Equal(t, int64(130), snapshot.Models[0].Used)
						assert.Equal(t, "Asia/Shanghai", snapshot.Timezone)
						assert.Greater(t, snapshot.ResetsAt, snapshot.UpdatedAt)
						oldDay := model.ModelDailyTokenDay(time.Now()) - 8*86400
						require.NoError(t, db.Create(&model.ModelDailyTokenReceipt{Key: "old-receipt", DayStart: oldDay, Tokens: 25}).Error)
						require.NoError(t, db.Create(&model.ModelDailyTokenUsage{UserID: 11, ModelKey: "old-model", DayStart: oldDay, UsedTokens: 25}).Error)
						require.NoError(t, model.PruneModelDailyTokenRecords(time.Now()))
						var count int64
						require.NoError(t, db.Model(&model.ModelDailyTokenReceipt{}).Where("day_start = ?", oldDay).Count(&count).Error)
						assert.Zero(t, count)
						snapshot, err = model.GetModelDailyTokenSnapshot(context.Background(), 11)
						require.NoError(t, err)
						assert.Equal(t, int64(130), snapshot.Models[0].Used)
					})

				})
			}
		})
	}
}

func TestModelDailyTokenQuantitiesAndShanghaiBoundary(t *testing.T) {
	for _, tc := range []struct {
		name      string
		usage     dto.Usage
		anthropic bool
		want      int64
	}{
		{"openai cache subset", dto.Usage{PromptTokens: 100, CompletionTokens: 20, PromptTokensDetails: dto.InputTokenDetails{CachedTokens: 80}}, false, 120},
		{"anthropic cache input exclusive", dto.Usage{PromptTokens: 10, CompletionTokens: 20, PromptTokensDetails: dto.InputTokenDetails{CachedTokens: 80, CachedCreationTokens: 30}}, true, 140},
		{"negative quantities do not credit", dto.Usage{PromptTokens: -5, CompletionTokens: 20}, false, 20},
	} {
		t.Run(tc.name, func(t *testing.T) { assert.Equal(t, tc.want, service.ModelDailyTokenCount(&tc.usage, tc.anthropic)) })
	}
	midnight := time.Date(2026, 10, 18, 16, 0, 0, 0, time.UTC)
	assert.Equal(t, midnight.Unix(), model.ModelDailyTokenDay(midnight))
	assert.Equal(t, midnight.Add(-24*time.Hour).Unix(), model.ModelDailyTokenDay(midnight.Add(-time.Second)))
	assert.Equal(t, model.MaxModelDailyTokens, model.AddModelDailyTokens(model.MaxModelDailyTokens, 200))
}

func TestModelDailyTokenPolicyValidation(t *testing.T) {
	for _, raw := range []string{`null`, `[]`, `{"a":0}`, `{"a":-1}`, `{"a":1.5}`, `{"a":9007199254740992}`, `{" a":1}`} {
		_, err := model.BuildRequestPolicy(map[string]string{model.ModelDailyTokenLimitsOption: raw})
		assert.Error(t, err, raw)
	}
	_, err := model.BuildRequestPolicy(map[string]string{model.ModelDailyTokenLimitsOption: `{"a":200000000,"b":300000000}`})
	require.NoError(t, err)
}

func TestModelDailyTokenProviderFactsIgnorePriceMultipliers(t *testing.T) {
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelType: constant.ChannelTypeOpenRouter}}
	legacy := &dto.Usage{PromptTokens: 120, CompletionTokens: 20, UsageSemantic: "anthropic", PromptTokensDetails: dto.InputTokenDetails{CachedTokens: 80, CachedCreationTokens: 30}}
	info.PriceData.ModelRatio = 0.1
	assert.Equal(t, int64(140), service.ModelDailyTextTokenCount(info, legacy), "legacy OpenRouter cache input is inclusive")
	info.PriceData.ModelRatio = 100
	assert.Equal(t, int64(140), service.ModelDailyTextTokenCount(info, legacy), "price changes do not change physical token usage")
	canonical := &dto.Usage{PromptTokens: 999, BillingUsage: dto.NewClaudeMessagesBillingUsage(&dto.ClaudeUsage{InputTokens: 10, OutputTokens: 20, CacheReadInputTokens: 80, CacheCreationInputTokens: 30})}
	assert.Equal(t, int64(140), service.ModelDailyTextTokenCount(info, canonical), "canonical provider facts take precedence over transformed envelope totals")
	assert.Equal(t, int64(80), service.ModelDailyTokenCount(&dto.Usage{TotalTokens: 80}, false))
}

func TestModelDailyTokenHTTPStreamingAndCrossKeyAdmission(t *testing.T) {
	user, token := setupResponsesWSRequestTest(t)
	// This fixture restores Redis globals on cleanup; unrelated asynchronous
	// performance writes must not outlive its isolated database and cache state.
	metricsConfig := config.GlobalConfig.Get("perf_metrics_setting")
	oldMetrics := perf_metrics_setting.GetSetting().Enabled
	config.UpdateConfigFromMap(metricsConfig, map[string]string{"enabled": "false"})
	t.Cleanup(func() {
		config.UpdateConfigFromMap(metricsConfig, map[string]string{"enabled": strconv.FormatBool(oldMetrics)})
	})
	oldTimeout, oldCount, oldQuota := constant.StreamingTimeout, constant.CountToken, common.QuotaPerUnit
	constant.StreamingTimeout = 30
	constant.CountToken = false
	common.QuotaPerUnit = 500000
	t.Cleanup(func() {
		constant.StreamingTimeout = oldTimeout
		constant.CountToken = oldCount
		common.QuotaPerUnit = oldQuota
	})

	db := model.DB
	require.NoError(t, db.AutoMigrate(&model.ModelDailyTokenUsage{}, &model.ModelDailyTokenReceipt{}, &model.Channel{}, &model.Ability{}))
	require.NoError(t, db.Model(user).Updates(map[string]any{"quota": 1000000, "setting": `{"billing_preference":"wallet_only"}`}).Error)
	require.NoError(t, db.Model(token).Update("remain_quota", 1000000).Error)
	second := *token
	second.Id = 0
	second.Key = "dailysecondkey"
	require.NoError(t, db.Create(&second).Error)
	oldLogs, oldBatch := common.LogConsumeEnabled, common.BatchUpdateEnabled
	common.LogConsumeEnabled = false
	common.BatchUpdateEnabled = false
	oldRatios, oldCompletions := ratio_setting.ModelRatio2JSONString(), ratio_setting.CompletionRatio2JSONString()
	t.Cleanup(func() {
		common.LogConsumeEnabled = oldLogs
		common.BatchUpdateEnabled = oldBatch
		require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(oldRatios))
		require.NoError(t, ratio_setting.UpdateCompletionRatioByJSONString(oldCompletions))
	})
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"daily-e2e":1,"another-e2e":1}`))
	require.NoError(t, ratio_setting.UpdateCompletionRatioByJSONString(`{"daily-e2e":1,"another-e2e":1}`))
	require.NoError(t, db.Create(&model.Option{Key: model.ModelDailyTokenLimitsOption, Value: `{"daily-e2e":100,"another-e2e":100}`}).Error)
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		var body struct {
			Stream bool `json:"stream"`
		}
		if !assert.NoError(t, common.DecodeJson(r.Body, &body)) {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if body.Stream {
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = fmt.Fprint(w, "data: {\"id\":\"daily-stream\",\"object\":\"chat.completion.chunk\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hello\"}}]}\n\n")
			_, _ = fmt.Fprint(w, "data: {\"id\":\"daily-stream\",\"choices\":[],\"usage\":{\"prompt_tokens\":70,\"completion_tokens\":40,\"total_tokens\":110}}\n\ndata: [DONE]\n\n")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `{"id":"daily-response","object":"chat.completion","choices":[{"index":0,"message":{"role":"assistant","content":"hello"},"finish_reason":"stop"}],"usage":{"prompt_tokens":70,"completion_tokens":40,"total_tokens":110}}`)
	}))
	defer upstream.Close()
	url := upstream.URL
	channel := model.Channel{Type: constant.ChannelTypeOpenAI, Status: 1, Key: "fake-upstream-key", Name: "daily-test", BaseURL: &url, Models: "daily-e2e,another-e2e", Group: "default"}
	require.NoError(t, db.Create(&channel).Error)
	for _, name := range []string{"daily-e2e", "another-e2e"} {
		require.NoError(t, db.Create(&model.Ability{Group: "default", Model: name, ChannelId: channel.Id, Enabled: true}).Error)
	}
	engine := gin.New()
	engine.POST("/v1/chat/completions", middleware.RequestId(), middleware.TokenAuth(), middleware.Distribute(), func(c *gin.Context) { Relay(c, types.RelayFormatOpenAI) })
	request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"daily-e2e","messages":[{"role":"user","content":"hello"}],"stream":true}`))
	request.Header.Set("Authorization", "Bearer sk-"+token.Key)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)
	require.Equal(t, 200, response.Code, response.Body.String())
	assert.Contains(t, response.Body.String(), "[DONE]")
	request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"daily-e2e","messages":[{"role":"user","content":"hello"}]}`))
	request.Header.Set("Authorization", "Bearer sk-"+second.Key)
	request.Header.Set("Content-Type", "application/json")
	response = httptest.NewRecorder()
	engine.ServeHTTP(response, request)
	assert.Equal(t, 429, response.Code, response.Body.String())
	assert.Contains(t, response.Body.String(), "model_daily_token_limit_exceeded")
	assert.Contains(t, response.Body.String(), "another model")
	assert.NotEmpty(t, response.Header().Get("Retry-After"))
	assert.EqualValues(t, 1, calls.Load())
	request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"another-e2e","messages":[{"role":"user","content":"hello"}]}`))
	request.Header.Set("Authorization", "Bearer sk-"+second.Key)
	request.Header.Set("Content-Type", "application/json")
	response = httptest.NewRecorder()
	engine.ServeHTTP(response, request)
	require.Equal(t, 200, response.Code, response.Body.String())
	assert.EqualValues(t, 2, calls.Load())
	budgets, err := model.ModelDailyTokenBudgets(context.Background(), user.Id, time.Now())
	require.NoError(t, err)
	require.Len(t, budgets, 2)
	assert.Equal(t, int64(110), budgets[0].Used)
	assert.Equal(t, int64(110), budgets[1].Used)
}
