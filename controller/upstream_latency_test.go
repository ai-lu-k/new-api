package controller

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	appdto "github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/relaylatency"
	"github.com/QuantumNous/new-api/pkg/relayobs"
	"github.com/QuantumNous/new-api/pkg/relaytrace"
	"github.com/QuantumNous/new-api/relay"
	"github.com/QuantumNous/new-api/relay/channel"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	kitdto "github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/perf_metrics_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/clickhouse"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func TestUpstreamLatencyObservations(t *testing.T) {
	first, reasoning, elapsed := int64(20000), int64(1200), int64(60000)
	tokens := 8192
	base := relaytrace.Summary{Attempt: 1, Scope: relaytrace.Scope{Channel: 29, Model: "deepseek-v4.1-flash-1017"}, InputTokens: &tokens, Streaming: true, Effort: "high", DurationMS: elapsed, Status: 200}
	for _, tc := range []struct {
		name         string
		change       func(*relaytrace.Summary)
		want         bool
		censored     bool
		milliseconds int64
	}{
		{"reasoning observed despite later cancellation", func(s *relaytrace.Summary) {
			s.FirstContentMS = &first
			s.FirstReasoningMS = &reasoning
			s.End = "client_cancelled"
		}, true, false, 1200},
		{"timeout is a lower bound", func(s *relaytrace.Summary) { s.End = "timeout"; s.TimeoutPhase = "first_meaningful" }, true, true, 60000},
		{"caller cancellation is censored", func(s *relaytrace.Summary) { s.End = "client_cancelled" }, true, true, 60000},
		{"upstream 500 is a fault", func(s *relaytrace.Summary) { s.Status = 500; s.End = "timeout" }, false, false, 0},
		{"empty completed response is not a slow response", func(s *relaytrace.Summary) { s.End = "done" }, false, false, 0},
		{"unknown payload cannot teach a first-token deadline", func(s *relaytrace.Summary) { s.FirstUnclassifiedMS = &reasoning; s.End = "timeout" }, false, false, 0},
		{"missing request-time context estimate", func(s *relaytrace.Summary) { s.InputTokens = nil; s.End = "timeout" }, false, false, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := base
			tc.change(&s)
			row, ok := service.UpstreamLatencyObservation("request", s, 123)
			require.Equal(t, tc.want, ok)
			if !ok {
				return
			}
			assert.Equal(t, tc.censored, row.Censored)
			assert.Equal(t, tc.milliseconds, row.ElapsedMS)
			assert.Equal(t, "deepseek-v4.1-flash-1017", row.UpstreamModel)
			assert.Equal(t, 29, row.ChannelID)
		})
	}
	// Retail aliases and failover positions do not occur in the fit identity.
	s := base
	s.FirstReasoningMS = &reasoning
	one, ok := service.UpstreamLatencyObservation("retail-x01", s, 123)
	require.True(t, ok)
	two, ok := service.UpstreamLatencyObservation("retail-x02", s, 123)
	require.True(t, ok)
	assert.Equal(t, one.FitKey, two.FitKey)
	s.Scope.Model = "deepseek-v4.1-flash-fast"
	other, ok := service.UpstreamLatencyObservation("retail-x02", s, 123)
	require.True(t, ok)
	assert.NotEqual(t, one.FitKey, other.FitKey)
	assert.Equal(t, time.Date(2026, 10, 29, 16, 0, 0, 0, time.UTC), service.NextUpstreamLatencyMidnight(time.Date(2026, 10, 29, 15, 59, 59, 0, time.UTC)).UTC())
}

func TestUpstreamLatencyCensoredFit(t *testing.T) {
	var samples []relaylatency.Sample
	// Four request classes observed repeatedly over time. Exact timing inputs
	// model the same prompt/effort effects and a bounded, explicit noise tail.
	for day := range 8 {
		for _, effort := range []string{"low", "high"} {
			for _, tokens := range []int{512, 8192} {
				for _, ms := range []int64{800, 900, 1000, 1100, 1200, 1300, 1500, 1800} {
					if effort == "high" {
						ms *= 3
					}
					if tokens == 8192 {
						ms *= 4
					}
					samples = append(samples, relaylatency.Sample{At: int64(day*86400 + len(samples)), Effort: effort, InputTokens: tokens, Milliseconds: ms})
				}
			}
		}
	}
	f, err := relaylatency.Fit(samples, .99, 100)
	require.NoError(t, err)
	low, ok := f.Predict("low", 512)
	require.True(t, ok)
	high, ok := f.Predict("high", 512)
	require.True(t, ok)
	assert.Greater(t, high, low)
	long, ok := f.Predict("high", 8192)
	require.True(t, ok)
	assert.Greater(t, long, high)
	_, ok = f.Predict("max", 512)
	assert.False(t, ok, "unobserved effort falls back")
	_, ok = f.Predict("high", 1000000)
	assert.False(t, ok, "unobserved context does not extrapolate")
	partlyCensored := slices.Clone(samples)
	for i := range partlyCensored {
		if i%6 == 0 && partlyCensored[i].Milliseconds > 3000 {
			partlyCensored[i].Milliseconds = 3000
			partlyCensored[i].Censored = true
		}
	}
	withCensoring, err := relaylatency.Fit(partlyCensored, .99, 100)
	require.NoError(t, err, "identifiable tails can be learned alongside censored attempts")
	assert.Positive(t, withCensoring.Censored)
	for i := range samples {
		if samples[i].Milliseconds > 3000 {
			samples[i].Milliseconds = 3000
			samples[i].Censored = true
		}
	}
	rejected, err := relaylatency.Fit(samples, .99, 100)
	require.Error(t, err, "unobserved tail must not progressively shrink the model")
	assert.Zero(t, rejected.Version)
}

func TestUpstreamLatencyDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case "sqlite":
				driver = sqlite.Open(filepath.Join(t.TempDir(), "latency.db"))
			case "mysql":
				if os.Getenv("TEST_MYSQL_DSN") == "" {
					t.Skip("TEST_MYSQL_DSN not configured")
				}
				driver = mysql.Open(os.Getenv("TEST_MYSQL_DSN"))
			case "postgres":
				if os.Getenv("TEST_POSTGRES_DSN") == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
				driver = postgres.Open(os.Getenv("TEST_POSTGRES_DSN"))
			}
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "upstream_latency_test_"}})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			old := model.DB
			model.DB = db
			logDB, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "upstream_latency_log_test_"}})
			require.NoError(t, err)
			logSQL, err := logDB.DB()
			require.NoError(t, err)
			oldLogDB := model.LOG_DB
			model.LOG_DB = logDB
			tables := []any{&model.UpstreamLatencyObservation{}, &model.UpstreamLatencyFunction{}, &model.Channel{}}
			t.Cleanup(func() {
				require.NoError(t, db.Migrator().DropTable(tables...))
				require.NoError(t, logDB.Migrator().DropTable(&model.Log{}))
				model.DB = old
				model.LOG_DB = oldLogDB
				require.NoError(t, logSQL.Close())
				require.NoError(t, sqlDB.Close())
			})
			query := "SELECT version()"
			if dialect == "sqlite" {
				query = "SELECT sqlite_version()"
			}
			var version string
			require.NoError(t, db.Raw(query).Scan(&version).Error)
			t.Logf("database: %s %s", dialect, version)
			// Channel/Log models and ORM versions are unchanged from the released
			// schema; create representative existing rows before the new tables.
			require.NoError(t, db.AutoMigrate(&model.Channel{}))
			require.True(t, db.Migrator().HasIndex(&model.Channel{}, "idx_upstream_latency_test_channels_name"))
			require.True(t, db.Migrator().HasIndex(&model.Channel{}, "idx_upstream_latency_test_channels_tag"))
			legacy := model.Channel{Id: 29, Key: "test-only", Name: "existing-channel", Models: "retail-x01,retail-x02", ModelMapping: common.GetPointer(`{"retail-x01":"upstream-flash","retail-x02":"upstream-flash"}`)}
			legacy.SetSetting(kitdto.ChannelSettings{RetryAllUpstreamErrors: true})
			require.NoError(t, db.Create(&legacy).Error)
			for range 2 {
				require.NoError(t, db.AutoMigrate(tables...))
				require.NoError(t, logDB.AutoMigrate(&model.Log{}))
			}
			var preserved model.Channel
			require.NoError(t, db.First(&preserved, 29).Error)
			assert.Equal(t, legacy.Models, preserved.Models)
			assert.Equal(t, *legacy.ModelMapping, *preserved.ModelMapping)
			assert.True(t, preserved.GetSetting().RetryAllUpstreamErrors)
			assert.True(t, db.Migrator().HasIndex(&model.Channel{}, "idx_upstream_latency_test_channels_name"))
			assert.True(t, db.Migrator().HasIndex(&model.Channel{}, "idx_upstream_latency_test_channels_tag"))
			require.Error(t, db.Create(&legacy).Error, "existing channel primary keys remain unique after migration")
			tokens, ms := 4096, int64(2200)
			s := relaytrace.Summary{Attempt: 1, Scope: relaytrace.Scope{Channel: 29, Model: "upstream-flash"}, InputTokens: &tokens, Streaming: true, Effort: "high", FirstReasoningMS: &ms}
			row, ok := service.UpstreamLatencyObservation("request", s, 100)
			require.True(t, ok)
			require.NoError(t, model.SaveUpstreamLatencyObservations(context.Background(), []model.UpstreamLatencyObservation{row, row}))
			var count int64
			require.NoError(t, db.Model(&model.UpstreamLatencyObservation{}).Count(&count).Error)
			assert.Equal(t, int64(1), count)
			keys, err := model.UpstreamLatencyTrainingKeys(context.Background(), 99, 101)
			require.NoError(t, err)
			require.Len(t, keys, 1)
			var read []model.UpstreamLatencyObservation
			require.NoError(t, model.ReadUpstreamLatencySamples(context.Background(), row.FitKey, 99, 101, func(batch []model.UpstreamLatencyObservation) { read = append(read, batch...) }))
			require.Len(t, read, 1)
			assert.Equal(t, int64(2200), read[0].ElapsedMS)
			f := relaylatency.Function{Version: relaylatency.Version, TailScale: 1, MinTokens: 1, MaxTokens: 10000, Efforts: []string{"high"}}
			require.NoError(t, model.PublishUpstreamLatencyFunction(context.Background(), 29, "upstream-flash", 100, f))
			require.NoError(t, model.PublishUpstreamLatencyFunction(context.Background(), 29, "upstream-flash", 100, f))
			require.NoError(t, model.PublishUpstreamLatencyFunction(context.Background(), 29, "upstream-flash", 200, f))
			versions, err := model.LoadUpstreamLatencyFunctions(context.Background(), 0)
			require.NoError(t, err)
			require.Len(t, versions, 2)
			assert.Equal(t, int64(200), versions[0].Cutoff)
			fitted := relaylatency.Function{}
			require.NoError(t, common.UnmarshalJsonStr(versions[0].Parameters, &fitted))
			seconds, ok := fitted.Predict("high", 4096)
			require.True(t, ok)
			assert.Equal(t, 1.0, seconds)
			// Rejected candidates retain earlier functions. A later validated
			// run may promote that cutoff, but cannot rewrite an accepted fit.
			require.NoError(t, model.RecordUpstreamLatencyFitRejection(context.Background(), 29, "upstream-flash", 300, "validation rejected"))
			require.NoError(t, model.RecordUpstreamLatencyFitRejection(context.Background(), 29, "upstream-flash", 300, "repeat"))
			versions, err = model.LoadUpstreamLatencyFunctions(context.Background(), 0)
			require.NoError(t, err)
			assert.Equal(t, "validation rejected", versions[0].Rejection)
			assert.Empty(t, versions[0].Parameters)
			require.NoError(t, model.PublishUpstreamLatencyFunction(context.Background(), 29, "upstream-flash", 300, f))
			f.TailScale = 2
			require.NoError(t, model.PublishUpstreamLatencyFunction(context.Background(), 29, "upstream-flash", 300, f))
			require.NoError(t, model.RecordUpstreamLatencyFitRejection(context.Background(), 29, "upstream-flash", 300, "later rejection"))
			versions, err = model.LoadUpstreamLatencyFunctions(context.Background(), 0)
			require.NoError(t, err)
			require.NoError(t, common.UnmarshalJsonStr(versions[0].Parameters, &fitted))
			assert.Equal(t, 1.0, fitted.TailScale)
			assert.Empty(t, versions[0].Rejection)
			// The history source is an independently configured log connection;
			// import twice to verify observation deduplication across restarts.
			cutoff := service.NextUpstreamLatencyMidnight(time.Now()).AddDate(0, 0, -1)
			encoded, err := common.Marshal(map[string]any{"admin_info": map[string]any{"relay_diagnostics": map[string]any{"attempts": []relaytrace.Summary{s}}}})
			require.NoError(t, err)
			require.NoError(t, logDB.Create(&model.Log{RequestId: "imported-request", CreatedAt: cutoff.Unix() - 100, Type: model.LogTypeConsume, Other: string(encoded)}).Error)
			for range 2 {
				require.NoError(t, service.TrainUpstreamLatency(context.Background(), cutoff, true))
			}
			require.NoError(t, db.Model(&model.UpstreamLatencyObservation{}).Where("observed_at = ?", cutoff.Unix()-100).Count(&count).Error)
			assert.Equal(t, int64(1), count)
			// Fresh schema plus repeated startup preserves the same uniqueness.
			require.NoError(t, db.Migrator().DropTable(&model.UpstreamLatencyObservation{}, &model.UpstreamLatencyFunction{}))
			for range 2 {
				require.NoError(t, db.AutoMigrate(&model.UpstreamLatencyObservation{}, &model.UpstreamLatencyFunction{}))
			}
			require.NoError(t, model.SaveUpstreamLatencyObservations(context.Background(), []model.UpstreamLatencyObservation{row, row}))
			require.NoError(t, db.Model(&model.UpstreamLatencyObservation{}).Count(&count).Error)
			assert.Equal(t, int64(1), count)
		})
	}
	t.Run("clickhouse_log_source", func(t *testing.T) {
		if os.Getenv("TEST_CLICKHOUSE_DSN") == "" {
			t.Skip("TEST_CLICKHOUSE_DSN not configured")
		}
		primary, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "primary.db")))
		require.NoError(t, err)
		logs, err := gorm.Open(clickhouse.Open(os.Getenv("TEST_CLICKHOUSE_DSN")), &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "upstream_latency_test_"}})
		require.NoError(t, err)
		oldDB, oldLog, oldType := model.DB, model.LOG_DB, common.LogDatabaseType()
		model.DB, model.LOG_DB = primary, logs
		common.SetLogDatabaseType(common.DatabaseTypeClickHouse)
		t.Cleanup(func() {
			require.NoError(t, logs.Exec("DROP TABLE IF EXISTS upstream_latency_test_logs").Error)
			model.DB, model.LOG_DB = oldDB, oldLog
			common.SetLogDatabaseType(oldType)
			for _, db := range []*gorm.DB{primary, logs} {
				connection, err := db.DB()
				require.NoError(t, err)
				require.NoError(t, connection.Close())
			}
		})
		var version string
		require.NoError(t, logs.Raw("SELECT version()").Scan(&version).Error)
		t.Logf("log database: clickhouse %s", version)
		require.NoError(t, primary.AutoMigrate(&model.UpstreamLatencyObservation{}, &model.UpstreamLatencyFunction{}))
		require.NoError(t, logs.Exec("CREATE TABLE upstream_latency_test_logs (id Int64 DEFAULT 0, request_id String, created_at Int64, type Int32, other String) ENGINE = MergeTree() ORDER BY (created_at, request_id)").Error)
		cutoff := service.NextUpstreamLatencyMidnight(time.Now()).AddDate(0, 0, -1)
		tokens, ms := 4096, int64(2200)
		s := relaytrace.Summary{Attempt: 1, Scope: relaytrace.Scope{Channel: 29, Model: "upstream-flash"}, InputTokens: &tokens, Streaming: true, FirstContentMS: &ms}
		encoded, err := common.Marshal(map[string]any{"admin_info": map[string]any{"relay_diagnostics": map[string]any{"attempts": []relaytrace.Summary{s}}}})
		require.NoError(t, err)
		var entries []map[string]any
		// Cross the 250-row page boundary with zero IDs, as in real ClickHouse logs.
		for i := range 251 {
			entries = append(entries, map[string]any{"id": int64(0), "request_id": fmt.Sprintf("request-%03d", i), "created_at": cutoff.Unix() - 100, "type": int32(model.LogTypeConsume), "other": string(encoded)})
		}
		require.NoError(t, logs.Table("upstream_latency_test_logs").Create(entries).Error)
		for range 2 {
			require.NoError(t, service.TrainUpstreamLatency(context.Background(), cutoff, true))
		}
		var count int64
		require.NoError(t, primary.Model(&model.UpstreamLatencyObservation{}).Count(&count).Error)
		assert.Equal(t, int64(251), count)
	})
}

type latencyTestAdaptor struct {
	channel.Adaptor
	respond func(*gin.Context, *relaycommon.RelayInfo) (any, *types.NewAPIError)
}

func (a latencyTestAdaptor) DoResponse(c *gin.Context, _ *http.Response, info *relaycommon.RelayInfo) (any, *types.NewAPIError) {
	return a.respond(c, info)
}

func TestUpstreamLatencyPreludeAndRetry(t *testing.T) {
	for _, tc := range []struct {
		name    string
		timeout bool
		unknown bool
	}{{"first output commits prelude", false, false}, {"unknown payload forbids replay", false, true}, {"first output timeout can retry", true, false}} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
			seconds := 600.0
			if tc.timeout {
				seconds = 1e-9
			}
			trace := relaytrace.NewAttempt(relaytrace.NewRegistry(), relaytrace.Summary{Streaming: true, Scope: relaytrace.Scope{Channel: 29, Model: "upstream"}, LatencyBudget: &relaytrace.LatencyBudget{Seconds: seconds, Enforce: true}}, "test", time.Now())
			defer trace.Finish("closed", nil)
			req := trace.Prepare(httptest.NewRequest(http.MethodPost, "http://upstream.test", nil), time.Now(), false)
			if tc.timeout {
				select {
				case <-req.Context().Done():
				case <-time.After(time.Second):
					t.Fatal("first-output timer did not cancel upstream")
				}
			}
			info := &relaycommon.RelayInfo{IsStream: true, TransportTrace: trace}
			adaptor := latencyTestAdaptor{respond: func(ctx *gin.Context, _ *relaycommon.RelayInfo) (any, *types.NewAPIError) {
				_, err := ctx.Writer.Write([]byte(": PING\n\n"))
				require.NoError(t, err)
				ctx.Writer.Flush()
				_, err = ctx.Writer.Write([]byte("data: prelude\n\n"))
				require.NoError(t, err)
				assert.NotContains(t, recorder.Body.String(), "prelude")
				if tc.unknown {
					trace.Mark("unknown_event", "upstream", 1)
				} else if !tc.timeout {
					trace.Mark("reasoning", "upstream", 1)
				}
				_, err = ctx.Writer.Write([]byte("data: answer\n\ndata: [DONE]\n\n"))
				require.NoError(t, err)
				return "usage", nil
			}}
			usage, apiErr := relay.HandleUpstreamResponse(c, nil, info, adaptor)
			assert.Contains(t, recorder.Body.String(), ": PING")
			if tc.timeout {
				require.NotNil(t, apiErr)
				assert.Nil(t, usage)
				assert.True(t, service.ShouldRetryRelayError(c, apiErr, 1))
				assert.NotContains(t, recorder.Body.String(), "answer")
				assert.NotContains(t, recorder.Body.String(), "[DONE]")
			} else {
				require.Nil(t, apiErr)
				assert.Equal(t, "usage", usage)
				assert.Contains(t, recorder.Body.String(), "data: prelude\n\ndata: answer")
			}
		})
	}
}

func TestUpstreamLatencyIgnoresHeartbeatAndRole(t *testing.T) {
	trace := relaytrace.NewAttempt(relaytrace.NewRegistry(), relaytrace.Summary{Streaming: true, LatencyBudget: &relaytrace.LatencyBudget{Seconds: 60, Enforce: true}}, "test", time.Now())
	trace.ObserveSSE(`{"choices":[{"delta":{"role":"assistant"}}]}`)
	trace.ObserveSSE(`{"choices":[{"delta":{}}]}`)
	trace.ObserveSSE(`{"choices":[{"delta":{"content":"","reasoning_content":null,"tool_calls":[]}}]}`)
	trace.Mark("ping", "downstream", 0)
	trace.ObserveSSE(`{"type":"ping"}`)
	trace.ObserveSSE(`{"type":"response.output_text.delta","delta":""}`)
	trace.ObserveSSE(`{"type":"response.reasoning_text.delta","delta":""}`)
	assert.True(t, trace.HoldingPrelude())
	trace.ObserveSSE(`{"choices":[{"delta":{"reasoning_content":"test"}}]}`)
	assert.False(t, trace.HoldingPrelude())
	require.NotNil(t, trace.Snapshot().FirstReasoningMS)
	trace.ObserveSSE(`{"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":3}}`)
	assert.Nil(t, trace.Snapshot().FirstUnclassifiedMS, "trailing usage cannot invalidate an observed first output")
	encoded, err := common.Marshal(trace.Snapshot())
	require.NoError(t, err)
	assert.NotContains(t, string(encoded), "reasoning_content")
}

func TestUpstreamLatencyThreeLevelFailover(t *testing.T) {
	previousMetrics := perf_metrics_setting.GetSetting().Enabled
	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{"perf_metrics_setting.enabled": "false"}))
	t.Cleanup(func() {
		require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{"perf_metrics_setting.enabled": fmt.Sprint(previousMetrics)}))
	})
	user, token := setupResponsesWSRequestTest(t)
	require.NoError(t, model.DB.AutoMigrate(&model.UpstreamLatencyObservation{}, &model.UpstreamLatencyFunction{}, &model.RelayObservation{}, &model.Channel{}, &model.Ability{}, &model.ModelDailyTokenUsage{}, &model.ModelDailyTokenReceipt{}))
	require.NoError(t, model.DB.AutoMigrate(&model.ChannelGenerationSlot{}, &model.Task{}, &model.Midjourney{}))
	require.NoError(t, model.LOG_DB.AutoMigrate(&model.Log{}))
	t.Cleanup(func() { require.NoError(t, model.WaitRelayObservationWrites(context.Background())) })
	fitCutoff := service.NextUpstreamLatencyMidnight(time.Now()).AddDate(0, 0, -1).Unix()
	require.NoError(t, model.PublishUpstreamLatencyFunction(context.Background(), 1, "upstream-shared", fitCutoff, relaylatency.Function{Version: relaylatency.Version, TailScale: 1, MinTokens: 1, MaxTokens: 10000, Efforts: []string{""}}))
	ctx, cancel := context.WithCancel(context.Background())
	t.Setenv("RELAY_LATENCY_ENFORCE_SCOPES", `[{"channel_id":1,"upstream_model":"upstream-shared"}]`)
	for name, value := range map[string]string{"RELAY_LATENCY_ENABLED": "true", "RELAY_LATENCY_ENFORCE": "true", "RELAY_LATENCY_FALLBACK_SECONDS": "1", "RELAY_LATENCY_MIN_SECONDS": "1", "RELAY_LATENCY_MAX_SECONDS": "1", "RELAY_LATENCY_REFERENCE_SECONDS": "1", "RELAY_LATENCY_REFERENCE_PERCENT": "0"} {
		t.Setenv(name, value)
	}
	require.NoError(t, service.StartUpstreamLatency(ctx))
	budget := service.SelectUpstreamLatency(1, "upstream-shared", "", 9, "retail-a")
	require.NotNil(t, budget)
	assert.Equal(t, "fitted", budget.Source)
	assert.True(t, budget.Enforce)
	assert.False(t, service.SelectUpstreamLatency(2, "upstream-shared", "", 9, "another-channel").Enforce)
	assert.False(t, service.SelectUpstreamLatency(1, "different-upstream", "", 9, "another-upstream").Enforce)
	assert.Equal(t, fitCutoff, budget.Version)
	assert.Equal(t, budget.Seconds, service.SelectUpstreamLatency(1, "upstream-shared", "", 9, "retail-b").Seconds)
	assert.Equal(t, "fallback", service.SelectUpstreamLatency(1, "different-upstream", "", 9, "retail-a").Source)
	t.Cleanup(func() {
		cancel()
		service.WaitUpstreamLatency()
		t.Setenv("RELAY_LATENCY_ENABLED", "false")
		t.Setenv("RELAY_LATENCY_ENFORCE", "false")
		require.NoError(t, service.StartUpstreamLatency(context.Background()))
	})
	oldRetries, oldLogs, oldBatch, oldCount := common.RetryTimes, common.LogConsumeEnabled, common.BatchUpdateEnabled, constant.CountToken
	oldStreaming := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldStreaming })
	common.RetryTimes, common.LogConsumeEnabled, common.BatchUpdateEnabled, constant.CountToken = 2, true, false, false
	t.Cleanup(func() {
		common.RetryTimes, common.LogConsumeEnabled, common.BatchUpdateEnabled, constant.CountToken = oldRetries, oldLogs, oldBatch, oldCount
	})
	oldRatios, oldCompletions := ratio_setting.ModelRatio2JSONString(), ratio_setting.CompletionRatio2JSONString()
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"latency-retail-a":1,"latency-retail-b":1}`))
	require.NoError(t, ratio_setting.UpdateCompletionRatioByJSONString(`{"latency-retail-a":1,"latency-retail-b":1}`))
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(oldRatios))
		require.NoError(t, ratio_setting.UpdateCompletionRatioByJSONString(oldCompletions))
	})
	require.NoError(t, model.DB.Model(user).Updates(map[string]any{"quota": 1000000, "setting": `{"billing_preference":"wallet_only"}`}).Error)
	require.NoError(t, model.DB.Model(token).Update("remain_quota", 1000000).Error)
	var calls []int
	var callsMu sync.Mutex
	var allFail atomic.Bool
	var primaryMode atomic.Int32
	for level := range 3 {
		upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var body struct {
				Model  string `json:"model"`
				Stream bool   `json:"stream"`
			}
			if !assert.NoError(t, common.DecodeJson(r.Body, &body)) {
				return
			}
			assert.Equal(t, "upstream-shared", body.Model)
			callsMu.Lock()
			calls = append(calls, level)
			callsMu.Unlock()
			if mode := primaryMode.Load(); level == 0 && mode != 0 {
				if mode > 0 {
					w.WriteHeader(int(mode))
					_, _ = fmt.Fprint(w, `{"error":{"message":"primary failed","type":"server_error"}}`)
				} else if mode == -1 || mode == -4 || mode == -5 {
					w.Header().Set("Content-Type", "text/event-stream")
					switch mode {
					case -4:
						_, _ = fmt.Fprint(w, "event: error\ndata: {\"message\":\"primary stream failed\"}\n\n")
					case -5:
						_, _ = fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"error\"}]}\n\n")
					default:
						_, _ = fmt.Fprint(w, "data: {\"error\":{\"message\":\"primary stream failed\",\"type\":\"server_error\"}}\n\n")
					}
					w.(http.Flusher).Flush()
					<-r.Context().Done()
				} else {
					w.Header().Set("Content-Type", "application/json")
					if mode == -2 {
						_, _ = fmt.Fprint(w, `{"error":{"message":"primary failed inside HTTP 200","type":"server_error"}}`)
					} else {
						_, _ = fmt.Fprint(w, "invalid provider JSON")
					}
				}
				return
			}
			if level == 1 || level == 2 && allFail.Load() {
				status := http.StatusServiceUnavailable
				if level == 1 && primaryMode.Load() == -5 {
					status = http.StatusGatewayTimeout
				}
				w.WriteHeader(status)
				_, _ = fmt.Fprint(w, `{"error":{"message":"test provider unavailable","type":"server_error"}}`)
				return
			}
			w.Header().Set("Content-Type", "text/event-stream")
			if level == 0 {
				if !allFail.Load() {
					_, _ = fmt.Fprint(w, "data: {\"id\":\"primary-prelude\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\"}}]}\n\n")
					w.(http.Flusher).Flush()
				}
				<-r.Context().Done()
				return
			}
			if !body.Stream {
				w.Header().Set("Content-Type", "application/json")
				_, _ = fmt.Fprint(w, `{"id":"winner","model":"upstream-shared","choices":[{"index":0,"message":{"role":"assistant","content":"answer"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}`)
				return
			}
			_, _ = fmt.Fprint(w, "data: {\"id\":\"winner\",\"object\":\"chat.completion.chunk\",\"model\":\"upstream-shared\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"answer\"},\"finish_reason\":\"stop\"}]}\n\ndata: {\"id\":\"winner\",\"choices\":[],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":5,\"total_tokens\":15}}\n\ndata: [DONE]\n\n")
		}))
		t.Cleanup(upstream.Close)
		url := upstream.URL
		priority := int64(30 - level*10)
		ch := model.Channel{Type: constant.ChannelTypeOpenAI, Status: 1, Key: "test-key", Name: fmt.Sprintf("latency-level-%d", level), BaseURL: &url, Models: "latency-retail-a,latency-retail-b", ModelMapping: common.GetPointer(`{"latency-retail-a":"upstream-shared","latency-retail-b":"upstream-shared"}`), Group: "default", Priority: &priority}
		ch.SetSetting(kitdto.ChannelSettings{RetryAllUpstreamErrors: level <= 1, ConcurrencyLimit: level + 1})
		require.NoError(t, model.DB.Create(&ch).Error)
		for _, name := range []string{"latency-retail-a", "latency-retail-b"} {
			require.NoError(t, model.DB.Create(&model.Ability{Group: "default", Model: name, ChannelId: ch.Id, Enabled: true, Priority: &priority}).Error)
		}
	}
	engine := gin.New()
	engine.POST("/v1/chat/completions", middleware.RequestId(), middleware.TokenAuth(), middleware.Distribute(), func(c *gin.Context) {
		if c.Query("sync") != "true" {
			helper.SetEventStreamHeaders(c)
			require.NoError(t, helper.PingData(c))
		}
		Relay(c, types.RelayFormatOpenAI)
	})
	for _, alias := range []string{"latency-retail-a", "latency-retail-b", "latency-retail-a"} {
		request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(fmt.Sprintf(`{"model":%q,"messages":[{"role":"user","content":"hello"}],"stream":true}`, alias)))
		request.Header.Set("Authorization", "Bearer sk-"+token.Key)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, request)
		assert.Equal(t, http.StatusOK, response.Code)
		assert.Contains(t, response.Body.String(), ": PING")
		assert.NotContains(t, response.Body.String(), "primary-prelude")
		callsMu.Lock()
		assert.Equal(t, []int{0, 1, 2}, calls)
		calls = nil
		callsMu.Unlock()
		var slots int64
		require.NoError(t, model.DB.Model(&model.ChannelGenerationSlot{}).Count(&slots).Error)
		assert.Zero(t, slots, "each completed or failed attempt releases its capacity")
		if allFail.Load() {
			assert.Contains(t, response.Body.String(), "data: {\"error\":")
			assert.NotContains(t, response.Body.String(), "[DONE]")
		} else {
			assert.Contains(t, response.Body.String(), "answer")
			assert.Equal(t, 1, strings.Count(response.Body.String(), "[DONE]"))
		}
		if alias == "latency-retail-b" {
			allFail.Store(true)
		}
	}
	// Channel failover works independently of adaptive latency enforcement.
	cancel()
	service.WaitUpstreamLatency()
	t.Setenv("RELAY_LATENCY_ENABLED", "false")
	t.Setenv("RELAY_LATENCY_ENFORCE", "false")
	require.NoError(t, service.StartUpstreamLatency(context.Background()))
	allFail.Store(false)
	recoveries := []struct {
		mode   int32
		stream bool
	}{{400, true}, {403, true}, {403, false}, {408, true}, {500, true}, {504, true}, {524, true}, {-1, true}, {-4, true}, {-5, true}, {-2, false}, {-3, false}}
	for _, tc := range recoveries {
		t.Run(fmt.Sprintf("primary_error_%d_stream_%t", tc.mode, tc.stream), func(t *testing.T) {
			if tc.mode == -3 {
				previousMemory := common.MemoryCacheEnabled
				common.MemoryCacheEnabled = true
				model.InitChannelCache()
				t.Cleanup(func() { common.MemoryCacheEnabled = previousMemory })
			}
			primaryMode.Store(tc.mode)
			path := "/v1/chat/completions"
			if !tc.stream {
				path += "?sync=true"
			}
			request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(fmt.Sprintf(`{"model":"latency-retail-a","messages":[{"role":"user","content":"hello"}],"stream":%t}`, tc.stream)))
			requestCtx, stop := context.WithTimeout(request.Context(), 5*time.Second)
			defer stop()
			request = request.WithContext(requestCtx)
			request.Header.Set("Authorization", "Bearer sk-"+token.Key)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, request)
			assert.Contains(t, response.Body.String(), "answer")
			assert.NotContains(t, response.Body.String(), "primary failed")
			assert.NotContains(t, response.Body.String(), "primary stream failed")
			callsMu.Lock()
			assert.Equal(t, []int{0, 1, 2}, calls, "excluding the primary must not skip the secondary or revisit the primary")
			calls = nil
			callsMu.Unlock()
		})
	}
	require.NoError(t, model.WaitRelayObservationWrites(context.Background()))
	observed, truncated, err := model.ReadRelayObservations(context.Background(), model.RelayObservationQuery{Start: time.Now().Add(-time.Hour).Unix(), End: time.Now().Unix() + 1}, 100)
	require.NoError(t, err)
	require.False(t, truncated)
	require.Len(t, observed, 3+len(recoveries))
	report := relayobs.Summarize(observed)
	assert.Equal(t, int64(2+len(recoveries)), report.Totals.FailoverSaved)
	assert.Equal(t, int64(3*(3+len(recoveries))), report.Totals.Upstream.Attempts)
	for _, request := range observed {
		require.Len(t, request.Attempts, 3)
		assert.Equal(t, "upstream-shared", request.Attempts[0].UpstreamModel)
		assert.Nil(t, request.Attempts[0].Usage, "failed attempt usage cannot inherit winner usage")
		assert.Equal(t, "unknown", request.Attempts[0].Cost.Status)
		if request.Outcome == "success" {
			require.NotNil(t, request.FirstContentMS)
			require.NotNil(t, request.Attempts[2].Usage)
			assert.Equal(t, int64(5), *request.Attempts[2].Usage.OutputTokens)
		} else {
			assert.Nil(t, request.FirstContentMS, "heartbeats and final errors are not content")
		}
	}
	var consumption int64
	require.NoError(t, model.DB.Model(&model.Log{}).Where("type = ? AND user_id = ?", model.LogTypeConsume, user.Id).Count(&consumption).Error)
	assert.Equal(t, int64(2+len(recoveries)), consumption, "only the winning attempt settles each successful request")
	common.LogConsumeEnabled = false
	primaryMode.Store(500)
	withoutLogs := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"latency-retail-a","messages":[{"role":"user","content":"hello"}],"stream":true}`))
	withoutLogs.Header.Set("Authorization", "Bearer sk-"+token.Key)
	withoutLogs.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, withoutLogs)
	require.Contains(t, response.Body.String(), "answer")
	require.NoError(t, model.WaitRelayObservationWrites(context.Background()))
	withoutLogRows, _, err := model.ReadRelayObservations(context.Background(), model.RelayObservationQuery{RequestID: response.Header().Get(common.RequestIdKey)}, 1)
	require.NoError(t, err)
	require.Len(t, withoutLogRows, 1)
	assert.Len(t, withoutLogRows[0].Attempts, 3, "all attempts persist even when consumption logging is disabled")
	var afterDisabled int64
	require.NoError(t, model.DB.Model(&model.Log{}).Where("type = ? AND user_id = ?", model.LogTypeConsume, user.Id).Count(&afterDisabled).Error)
	assert.Equal(t, consumption, afterDisabled)
}

func TestChannelAttemptReleasePreservesClientCancellation(t *testing.T) {
	user, _ := setupResponsesWSRequestTest(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Channel{}, &model.ChannelGenerationSlot{}, &model.Task{}, &model.Midjourney{}))
	limited := model.Channel{Name: "limited", Key: "test-key", Status: common.ChannelStatusEnabled}
	require.NoError(t, model.DB.Create(&limited).Error)
	for _, end := range []string{"release", "client_cancelled", "lease_lost"} {
		t.Run(end, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			requestCtx, cancel := context.WithCancel(context.Background())
			defer cancel()
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil).WithContext(requestCtx)
			release, apiErr := service.StartChannelGeneration(c, limited.Id, user.Id, kitdto.ChannelSettings{ConcurrencyLimit: 1}, "retail-model")
			require.Nil(t, apiErr)
			t.Cleanup(release)
			attemptCtx := c.Request.Context()
			switch end {
			case "client_cancelled":
				cancel()
				require.ErrorIs(t, attemptCtx.Err(), context.Canceled)
			case "lease_lost":
				lease := model.ChannelGenerationLeaseFromContext(attemptCtx)
				require.NotNil(t, lease)
				require.NoError(t, model.DB.Where("channel_id = ?", limited.Id).Delete(&model.ChannelGenerationSlot{}).Error)
				require.ErrorIs(t, lease.Renew(), model.ErrChannelGenerationLeaseLost)
				require.ErrorIs(t, attemptCtx.Err(), context.Canceled, "losing capacity still aborts active upstream work")
			}
			release()
			assert.ErrorIs(t, attemptCtx.Err(), context.Canceled)
			if end == "client_cancelled" {
				assert.ErrorIs(t, c.Request.Context().Err(), context.Canceled, "release cannot revive a disconnected request")
			} else {
				assert.NoError(t, c.Request.Context().Err(), "ending an attempt cannot cancel the client request")
			}
		})
	}
}

func TestRetryAllUpstreamErrorsBoundaries(t *testing.T) {
	for _, tc := range []struct {
		name      string
		status    int
		err       *types.NewAPIError
		setup     func(*gin.Context, *relaycommon.RelayInfo)
		want      string
		exhausted bool
	}{
		{name: "400", status: 400, want: "all_upstream_errors"},
		{name: "408", status: 408, want: "all_upstream_errors"},
		{name: "504", status: 504, want: "all_upstream_errors"},
		{name: "524", status: 524, want: "all_upstream_errors"},
		{name: "HTTP 200 error", status: 200, want: "all_upstream_errors"},
		{name: "budget exhausted", status: 504, exhausted: true, want: "attempt_budget_exhausted"},
		{name: "explicit upstream skip", err: types.NewOpenAIError(errors.New("provider"), types.ErrorCodeBadResponseBody, 502, types.ErrOptionWithSkipRetry()), want: "all_upstream_errors"},
		{name: "client gone", status: 504, setup: func(c *gin.Context, _ *relaycommon.RelayInfo) {
			ctx, cancel := context.WithCancel(c.Request.Context())
			cancel()
			c.Request = c.Request.WithContext(ctx)
		}, want: "client_cancelled"},
		{name: "output committed", status: 504, setup: func(_ *gin.Context, info *relaycommon.RelayInfo) { info.TransportTrace.Mark("content", "upstream", 1) }, want: "response_committed"},
		{name: "unknown output", status: 504, setup: func(_ *gin.Context, info *relaycommon.RelayInfo) {
			info.TransportTrace.Mark("unknown_event", "upstream", 1)
		}, want: "response_committed"},
		{name: "local quota", err: types.NewError(errors.New("quota"), types.ErrorCodeInsufficientUserQuota, types.ErrOptionWithSkipRetry()), want: "non_retryable_error"},
		{name: "local request", err: types.NewError(errors.New("invalid input"), types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry()), want: "non_retryable_error"},
		{name: "local database failure", err: types.NewError(errors.New("database unavailable"), types.ErrorCodeQueryDataError), want: "non_retryable_error"},
		{name: "strict session", status: 504, setup: func(c *gin.Context, _ *relaycommon.RelayInfo) { c.Set("channel_affinity_skip_retry_on_failure", true) }, want: "strict_session"},
		{name: "stale attempt", status: 504, setup: func(_ *gin.Context, info *relaycommon.RelayInfo) {
			info.TransportTrace = relaytrace.NewAttempt(relaytrace.NewRegistry(), relaytrace.Summary{Scope: relaytrace.Scope{Channel: 8}}, "earlier-channel", time.Now())
		}, want: "system_retry_exclusion"},
		{name: "other channel", status: 504, setup: func(_ *gin.Context, info *relaycommon.RelayInfo) { info.ChannelSetting.RetryAllUpstreamErrors = false }, want: "system_retry_exclusion"},
		{name: "pinned channel", status: 504, setup: func(c *gin.Context, _ *relaycommon.RelayInfo) {
			service.GetChannelConstraints(c).AddPin(appdto.ChannelPin{ChannelId: 7, Source: appdto.PinSourceToken, Rank: appdto.PinRankToken, RetryMode: appdto.PinRetrySingleAttempt})
		}, want: "pinned_channel"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
			c.Set("channel_id", 7)
			trace := relaytrace.NewAttempt(relaytrace.NewRegistry(), relaytrace.Summary{Scope: relaytrace.Scope{Channel: 7}}, "request", time.Now())
			defer trace.Finish("closed", nil)
			info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelId: 7, ChannelSetting: kitdto.ChannelSettings{RetryAllUpstreamErrors: true}}, TransportTrace: trace}
			if tc.setup != nil {
				tc.setup(c, info)
			}
			apiErr := tc.err
			if apiErr == nil {
				apiErr = types.NewOpenAIError(errors.New("provider"), types.ErrorCodeBadResponseStatusCode, tc.status)
			}
			retries := 1
			if tc.exhausted {
				retries = 0
			}
			decision := service.DecideRelayRetry(c, apiErr, retries, info)
			assert.Equal(t, tc.want, decision.Reason)
			assert.Equal(t, tc.want == "all_upstream_errors", decision.Action == "retry")
		})
	}
}
