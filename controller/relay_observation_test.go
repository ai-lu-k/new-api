package controller

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/relayobs"
	"github.com/QuantumNous/new-api/pkg/relaytrace"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func TestRelayObservationReportedUsage(t *testing.T) {
	for _, tc := range []struct {
		name   string
		frames []string
		input  int64
		output int64
		cache  *int64
		total  int64
	}{
		{"chat absent cache stays unknown", []string{`{"usage":{"prompt_tokens":10,"completion_tokens":2}}`}, 10, 2, nil, 10},
		{"chat explicit zero survives", []string{`{"usage":{"prompt_tokens":10,"completion_tokens":0,"prompt_tokens_details":{"cached_tokens":0}}}`}, 10, 0, common.GetPointer(int64(0)), 10},
		{"responses cache is inclusive", []string{`{"response":{"usage":{"input_tokens":10,"output_tokens":5,"input_tokens_details":{"cached_tokens":4},"output_tokens_details":{"reasoning_tokens":2}}}}`}, 10, 5, common.GetPointer(int64(4)), 10},
		{"anthropic merges input and output without losing cache", []string{`{"type":"message_start","message":{"usage":{"input_tokens":10,"output_tokens":0,"cache_read_input_tokens":4,"cache_creation_input_tokens":2}}}`, `{"type":"message_delta","usage":{"output_tokens":5}}`}, 10, 5, common.GetPointer(int64(4)), 16},
		{"gemini includes thoughts once", []string{`{"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":3,"thoughtsTokenCount":2,"cachedContentTokenCount":4}}`, `{"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":3,"thoughtsTokenCount":2,"cachedContentTokenCount":4}}`}, 10, 5, common.GetPointer(int64(4)), 10},
	} {
		t.Run(tc.name, func(t *testing.T) {
			trace := relaytrace.NewAttempt(relaytrace.NewRegistry(), relaytrace.Summary{}, "request", time.Now())
			for _, frame := range tc.frames {
				trace.ObserveSSE(frame)
			}
			u := trace.Snapshot().Usage
			require.NotNil(t, u)
			require.NotNil(t, u.InputTokens)
			require.NotNil(t, u.OutputTokens)
			assert.Equal(t, tc.input, *u.InputTokens)
			assert.Equal(t, tc.output, *u.OutputTokens)
			assert.Equal(t, tc.cache, u.CacheReadTokens)
			assert.Equal(t, tc.total, *relayobs.InputTotal(u))
		})
	}
	trace := relaytrace.NewAttempt(relaytrace.NewRegistry(), relaytrace.Summary{Streaming: true}, "request", time.Now())
	response := &http.Response{StatusCode: 500, Header: http.Header{"Content-Type": {"application/json"}, "X-Oneapi-Request-Id": {"upstream-example"}},
		Body: io.NopCloser(strings.NewReader(`{"error":{"message":"private body"},"usage":{"prompt_tokens":8,"completion_tokens":0,"cost":0,"cost_currency":"USD"}}`))}
	trace.Headers(response, false)
	_, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	require.NoError(t, response.Body.Close())
	u := trace.Snapshot().Usage
	assert.Equal(t, "upstream-example", trace.Snapshot().UpstreamRequestID)
	require.NotNil(t, u, "HTTP error JSON usage must survive even for a streaming request")
	assert.Equal(t, "0", u.CostAmount)
	assert.Equal(t, "reported", relayobs.ProcurementCost(u, nil).Status)
	encoded, err := common.Marshal(trace.Snapshot())
	require.NoError(t, err)
	assert.NotContains(t, string(encoded), "private body")
	trace = relaytrace.NewAttempt(relaytrace.NewRegistry(), relaytrace.Summary{}, "request", time.Now())
	trace.ObserveSSE(`{"usage":{"prompt_tokens":-1,"completion_tokens":1.5,"prompt_tokens_details":{"cached_tokens":"0"}}}`)
	assert.Nil(t, trace.Snapshot().Usage, "invalid or string quantities are not observed zeros")
}

func TestRelayObservationCostsAndFunnel(t *testing.T) {
	profile := relayobs.CostProfile{ChannelID: 1, UpstreamModel: "upstream", Currency: "USD", InputPerMillion: "2", OutputPerMillion: "4", CacheReadPerMillion: "1", CacheWritePerMillion: "3"}
	require.NoError(t, profile.Validate())
	input, output, read, write := int64(100), int64(50), int64(20), int64(10)
	usage := &relaytrace.ReportedUsage{InputTokens: &input, OutputTokens: &output, CacheReadTokens: &read, CacheWriteTokens: &write, InputSemantic: "inclusive"}
	cost := relayobs.ProcurementCost(usage, &profile)
	require.NotNil(t, cost.Amount)
	assert.Equal(t, "0.00039", *cost.Amount)
	assert.Equal(t, "estimated", cost.Status)
	require.NotNil(t, cost.RateSnapshot)
	usage.InputSemantic = "additive"
	cost = relayobs.ProcurementCost(usage, &profile)
	assert.Equal(t, "0.00045", *cost.Amount)
	usage.CacheReadTokens = nil
	assert.Equal(t, "unknown", relayobs.ProcurementCost(usage, &profile).Status)
	assert.Equal(t, "unknown", relayobs.ProcurementCost(nil, &profile).Status)
	assert.Equal(t, "unknown", relayobs.ProcurementCost(&relaytrace.ReportedUsage{CostAmount: "1"}, nil).Status)
	for _, rate := range []string{"-1", "NaN", "1e-99999999", "1e99999999"} {
		invalid := profile
		invalid.InputPerMillion = rate
		assert.Error(t, invalid.Validate())
	}
	first, generation := int64(100), int64(1000)
	reported := "0.2"
	requests := []relayobs.Request{
		{Model: "retail-a", Outcome: "success", FirstContentMS: &first, Candidates: []relayobs.Candidate{{ChannelID: 2, Result: "capacity_skipped"}}, Attempts: []relayobs.Attempt{
			{ChannelID: 1, UpstreamModel: "upstream", Outcome: "timeout", Cost: relayobs.Cost{Status: "unknown"}},
			{ChannelID: 3, UpstreamModel: "winner", Outcome: "success", Usage: &relaytrace.ReportedUsage{InputTokens: &input, OutputTokens: &output, CacheReadTokens: &read}, GenerationMS: &generation, Cost: relayobs.Cost{Status: "reported", Amount: &reported, Currency: "CNY"}},
		}},
		{Model: "retail-b", Outcome: "error", Attempts: []relayobs.Attempt{{ChannelID: 1, UpstreamModel: "upstream", Outcome: "error", Cost: cost}}},
		{Model: "retail-a", Outcome: "client_cancelled"},
	}
	report := relayobs.Summarize(requests)
	assert.Equal(t, int64(3), report.Totals.Requests)
	assert.Equal(t, int64(1), report.Totals.Completed)
	assert.Equal(t, int64(1), report.Totals.FailoverSaved)
	assert.Equal(t, int64(1), report.Totals.CapacitySkipped)
	assert.Equal(t, int64(1), report.Totals.Cancelled)
	assert.Equal(t, int64(1), report.Totals.Upstream.UnknownCostAttempts)
	assert.Equal(t, float64(50), *report.Totals.Upstream.OutputTPS)
	assert.Equal(t, 0.2, *report.Totals.Upstream.CacheTokenHitRate)
	assert.Len(t, report.Totals.Upstream.Costs, 2, "different currencies must not be added together")
	require.Len(t, report.ByChannel, 2)
	assert.Equal(t, int64(2), report.ByChannel[0].Metrics.Attempts, "public aliases share channel/upstream identity")
}

func TestRelayObservationDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case "sqlite":
				driver = sqlite.Open(filepath.Join(t.TempDir(), "observations.db"))
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
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "relay_observation_test_"}})
			require.NoError(t, err)
			old := model.DB
			model.DB = db
			t.Cleanup(func() {
				require.NoError(t, model.WaitRelayObservationWrites(context.Background()))
				require.NoError(t, db.Migrator().DropTable(&model.RelayObservation{}, &model.Channel{}))
				model.DB = old
				sql, err := db.DB()
				require.NoError(t, err)
				require.NoError(t, sql.Close())
			})
			versionQuery := "SELECT version()"
			if dialect == "sqlite" {
				versionQuery = "SELECT sqlite_version()"
			}
			var version string
			require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
			t.Logf("database: %s %s", dialect, version)
			request := relayobs.Request{SchemaVersion: 1, RequestID: "request-1", StartedAtMS: 100000, Model: "retail-模型", TrafficKind: "user", Outcome: "success", Attempts: []relayobs.Attempt{}}
			for _, scenario := range []string{"fresh", "upgrade"} {
				t.Run(scenario, func(t *testing.T) {
					if scenario == "upgrade" {
						require.NoError(t, db.Migrator().DropTable(&model.RelayObservation{}))
						require.NoError(t, db.AutoMigrate(&model.Channel{}))
						require.NoError(t, db.Create(&model.Channel{Id: 1, Name: "existing", Key: "fixture", Models: "retail"}).Error)
					}
					for range 2 {
						require.NoError(t, db.AutoMigrate(&model.RelayObservation{}))
					}
					for range 2 {
						require.NoError(t, model.StoreRelayObservation(context.Background(), db, request))
					}
					require.NoError(t, db.AutoMigrate(&model.RelayObservation{}), "restart preserves stored observations")
					rows, truncated, err := model.ReadRelayObservations(context.Background(), model.RelayObservationQuery{Start: 99, End: 101, Model: request.Model}, 1)
					require.NoError(t, err)
					require.Len(t, rows, 1)
					assert.False(t, truncated)
					assert.Equal(t, "request-1", rows[0].RequestID)
					rows, _, err = model.ReadRelayObservations(context.Background(), model.RelayObservationQuery{Start: 99, End: 101, Model: "another-model"}, 5)
					require.NoError(t, err)
					assert.Empty(t, rows)
					other := request
					other.RequestID = "request-2"
					require.NoError(t, model.StoreRelayObservation(context.Background(), db, other))
					_, truncated, err = model.ReadRelayObservations(context.Background(), model.RelayObservationQuery{Start: 99, End: 101}, 1)
					require.NoError(t, err)
					assert.True(t, truncated, "bounded scans must declare missing requests")
					require.NoError(t, model.DeleteRelayObservationsBefore(context.Background(), db, 101))
					if scenario == "upgrade" {
						var preserved model.Channel
						require.NoError(t, db.First(&preserved, 1).Error)
						assert.Equal(t, "existing", preserved.Name)
						assert.True(t, db.Migrator().HasIndex(&model.Channel{}, "idx_relay_observation_test_channels_name"))
					}
				})
			}
		})
	}
}

func TestRelayObservationDeliveryAndQuery(t *testing.T) {
	deadlineRecorder := &observationDeadlineRecorder{ResponseRecorder: httptest.NewRecorder()}
	deadlineContext, _ := gin.CreateTestContext(deadlineRecorder)
	deadlineContext.Request = httptest.NewRequest(http.MethodPost, "/relay", nil)
	service.BeginRelayObservation(deadlineContext, types.RelayFormatOpenAI)
	deadline := time.Now().Add(time.Second)
	require.NoError(t, http.NewResponseController(deadlineContext.Writer).SetWriteDeadline(deadline))
	assert.Equal(t, deadline, deadlineRecorder.deadline, "observation wrappers must preserve stream write deadlines")
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "delivery.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.RelayObservation{}))
	old := model.DB
	model.DB = db
	t.Cleanup(func() {
		require.NoError(t, model.WaitRelayObservationWrites(context.Background()))
		model.DB = old
		sql, err := db.DB()
		require.NoError(t, err)
		require.NoError(t, sql.Close())
	})
	engine := gin.New()
	enteredAt := time.Now().Add(-time.Second).Truncate(time.Millisecond)
	engine.POST("/relay", func(c *gin.Context) {
		c.Set(common.RequestIdKey, "delivery")
		common.SetContextKey(c, constant.ContextKeyGatewayStartTime, enteredAt)
		state := service.BeginRelayObservation(c, types.RelayFormatOpenAI)
		service.RecordRelayCandidate(c, 1, "default", "capacity_skipped")
		c.Writer.Header().Set("Content-Type", "text/event-stream")
		_, err := c.Writer.WriteString(": PING\n\ndata: {\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}\n\n")
		require.NoError(t, err)
		_, err = c.Writer.WriteString("data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"private reasoning\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"private answer\"}}]}\n\n")
		require.NoError(t, err)
		state.Finish(c, &relaycommon.RelayInfo{OriginModelName: "retail", IsStream: true}, nil, false)
	})
	engine.GET("/api/relay-observations", GetRelayObservations)
	engine.GET("/api/relay-observations/:request_id", GetRelayObservations)
	engine.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/relay", nil))
	require.NoError(t, model.WaitRelayObservationWrites(context.Background()))
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/relay-observations/delivery", nil))
	require.Equal(t, http.StatusOK, response.Code)
	var result struct {
		Data relayobs.Request `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
	assert.Equal(t, enteredAt.UnixMilli(), result.Data.StartedAtMS)
	require.NotNil(t, result.Data.FirstReasoningMS)
	require.NotNil(t, result.Data.FirstContentMS)
	assert.Greater(t, result.Data.DownstreamBytes, int64(0))
	assert.NotContains(t, response.Body.String(), "private reasoning")
	assert.NotContains(t, response.Body.String(), "private answer")
	for _, query := range []string{"?start=2&end=1", "?limit=10001", "?traffic_kind=invalid"} {
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/relay-observations"+query, nil))
		assert.Equal(t, http.StatusBadRequest, response.Code)
	}
}

type observationDeadlineRecorder struct {
	*httptest.ResponseRecorder
	deadline time.Time
}

func (w *observationDeadlineRecorder) SetWriteDeadline(deadline time.Time) error {
	w.deadline = deadline
	return nil
}

func TestRelayObservationRootVisibility(t *testing.T) {
	_, _ = setupSecurityEnrollmentTest(t)
	require.NoError(t, model.DB.AutoMigrate(&model.RelayObservation{}))
	request := relayobs.Request{SchemaVersion: 1, RequestID: "private-request", StartedAtMS: time.Now().UnixMilli(),
		Model: "retail", TrafficKind: "user", Attempts: []relayobs.Attempt{{ChannelID: 29, UpstreamModel: "private-upstream", Cost: relayobs.Cost{Status: "unknown"}}}}
	require.NoError(t, model.StoreRelayObservation(context.Background(), model.DB, request))
	engine := gin.New()
	group := engine.Group("/api/relay-observations", middleware.RootAuth())
	group.GET("", GetRelayObservations)
	group.GET("/:request_id", GetRelayObservations)
	for _, role := range []int{0, common.RoleCommonUser, common.RoleAdminUser, common.RoleRootUser} {
		credential := ""
		if role != 0 {
			user := &model.User{Username: fmt.Sprintf("observation-%d", role), AffCode: fmt.Sprintf("observation-%d", role), Role: role, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1}
			require.NoError(t, model.DB.Create(user).Error)
			session, err := service.CreateLoginSession(user.Id, "password", "127.0.0.1", "observation-test")
			require.NoError(t, err)
			credential = session.AccessToken
		}
		for _, path := range []string{"/api/relay-observations", "/api/relay-observations/private-request"} {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			if credential != "" {
				req.Header.Set("Authorization", "Bearer "+credential)
			}
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, req)
			status := http.StatusForbidden
			if role == 0 {
				status = http.StatusUnauthorized
			}
			if role == common.RoleRootUser {
				status = http.StatusOK
			}
			assert.Equal(t, status, response.Code)
			if role != common.RoleRootUser {
				assert.NotContains(t, response.Body.String(), "private-upstream")
			}
			if credential != "" {
				assert.NotContains(t, response.Body.String(), credential)
			}
		}
	}
}

func TestApplyChainChannelOrderUsesConfiguredPriorityAndWeight(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "order.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Ability{}))
	priority, heavy, light := int64(10), uint(50), uint(5)
	require.NoError(t, db.Create(&[]model.Ability{
		{ChannelId: 22, Model: "retail", Enabled: true, Priority: &priority, Weight: heavy},
		{ChannelId: 15, Model: "retail", Enabled: true, Priority: &priority, Weight: light},
		{ChannelId: 9, Model: "retail", Enabled: true, Priority: new(int64), Weight: heavy},
	}).Error)
	old := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = old })

	chains := []relayobs.ModelChain{{
		Model: "retail",
		Channels: []relayobs.ChainChannel{
			{ChannelID: 9, Reached: 40},
			{ChannelID: 15, Reached: 3},
			{ChannelID: 22, Reached: 90},
			{ChannelID: 77, Reached: 1},
		},
	}}

	applyChainChannelOrder(chains)

	ids := make([]int, 0, len(chains[0].Channels))
	for _, channel := range chains[0].Channels {
		ids = append(ids, channel.ChannelID)
	}
	// Priority 10 first, heavier channel inside the tier, then priority 0, and a
	// channel that is no longer configured falls to the end.
	assert.Equal(t, []int{22, 15, 9, 77}, ids)
	assert.Equal(t, int64(50), chains[0].Channels[0].Weight)
	assert.Equal(t, int64(0), chains[0].Channels[3].Priority)
}

func TestObservationChannelNames(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "names.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Channel{}))
	require.NoError(t, db.Create(&[]model.Channel{{Id: 22, Name: "ZeroCat DeepSeek"}, {Id: 15, Name: "Backup Relay"}}).Error)
	old := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = old })

	summary := relayobs.Report{Chains: []relayobs.ModelChain{{
		Model:    "retail",
		Channels: []relayobs.ChainChannel{{ChannelID: 22, Reached: 9}, {ChannelID: 15, Reached: 3}},
	}}}

	names := observationChannelNames(summary)
	assert.Equal(t, "ZeroCat DeepSeek", names[22])
	assert.Equal(t, "Backup Relay", names[15])
}
