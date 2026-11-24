package service

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestUpstreamUsageWindowEndsAtShanghaiMidnight(t *testing.T) {
	now := time.Date(2026, 10, 19, 10, 30, 0, 0, time.FixedZone("Asia/Shanghai", 8*60*60))

	start, end := UpstreamUsageWindow(now)

	// Seven complete days: the running day is never part of the window.
	assert.Equal(t, "2026-10-12T00:00:00+08:00", start.Format(time.RFC3339))
	assert.Equal(t, "2026-10-19T00:00:00+08:00", end.Format(time.RFC3339))
}

func TestCheckUpstreamBaseUrlKeepsPlainHttpOnLoopbackOnly(t *testing.T) {
	assert.NoError(t, CheckUpstreamBaseUrl("https://api.openai.com"))
	assert.NoError(t, CheckUpstreamBaseUrl("http://127.0.0.1:8080"))
	assert.NoError(t, CheckUpstreamBaseUrl("http://localhost:9000"))
	assert.Error(t, CheckUpstreamBaseUrl("http://api.openai.com"))
	assert.Error(t, CheckUpstreamBaseUrl("ftp://api.openai.com"))
	assert.Error(t, CheckUpstreamBaseUrl(""))
}

func TestFetchUpstreamUsageReadsOpenAICostReport(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/organization/costs", r.URL.Path)
		assert.Equal(t, "Bearer admin-key", r.Header.Get("Authorization"))
		assert.Equal(t, "1d", r.URL.Query().Get("bucket_width"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[
			{"results":[{"amount":{"value":"1.25","currency":"usd"}}]},
			{"results":[{"amount":{"value":"2.5","currency":"usd"}},{"amount":{"value":"0.5","currency":"usd"}}]}
		]}`))
	}))
	defer server.Close()

	usage, err := FetchUpstreamUsage(context.Background(), UpstreamUsageRequest{
		Provider:   model.UpstreamProviderOpenAI,
		BaseUrl:    server.URL,
		Credential: "admin-key",
		Start:      time.Unix(1000, 0),
		End:        time.Unix(2000, 0),
	})

	require.NoError(t, err)
	assert.Equal(t, 4.25, usage)
}

func TestFetchUpstreamUsageReportsCredentialFailureWithoutLeaking(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"invalid key admin-key"}`))
	}))
	defer server.Close()

	_, err := FetchUpstreamUsage(context.Background(), UpstreamUsageRequest{
		Provider:   model.UpstreamProviderOpenAI,
		BaseUrl:    server.URL,
		Credential: "admin-key",
		Start:      time.Unix(1000, 0),
		End:        time.Unix(2000, 0),
	})

	require.Error(t, err)
	assert.NotContains(t, err.Error(), "admin-key")
}

func TestFetchUpstreamUsageReadsAnthropicCostReport(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/organizations/cost_report", r.URL.Path)
		assert.Equal(t, "admin-key", r.Header.Get("X-Api-Key"))
		assert.Equal(t, "2023-06-01", r.Header.Get("Anthropic-Version"))
		assert.Equal(t, "1d", r.URL.Query().Get("bucket_width"))
		_, _ = w.Write([]byte(`{"data":[{"results":[{"amount":"0.75","currency":"USD"}]}]}`))
	}))
	defer server.Close()

	usage, err := FetchUpstreamUsage(context.Background(), UpstreamUsageRequest{
		Provider:   model.UpstreamProviderAnthropic,
		BaseUrl:    server.URL,
		Credential: "admin-key",
		Start:      time.Unix(1000, 0),
		End:        time.Unix(2000, 0),
	})

	require.NoError(t, err)
	assert.Equal(t, 0.75, usage)
}

func TestFetchUpstreamUsageRefusesOtherCurrencies(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"results":[{"amount":{"value":"1","currency":"eur"}}]}]}`))
	}))
	defer server.Close()

	_, err := FetchUpstreamUsage(context.Background(), UpstreamUsageRequest{
		Provider:   model.UpstreamProviderOpenAI,
		BaseUrl:    server.URL,
		Credential: "admin-key",
		Start:      time.Unix(1000, 0),
		End:        time.Unix(2000, 0),
	})

	assert.ErrorContains(t, err, "not in USD")
}

func TestFetchUpstreamUsageReadsNewApiUsageInUsd(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/status":
			_, _ = w.Write([]byte(`{"success":true,"data":{"quota_per_unit":500000}}`))
		case "/api/data/self":
			assert.Equal(t, "Bearer nap-token", r.Header.Get("Authorization"))
			assert.Equal(t, "1000", r.URL.Query().Get("start_timestamp"))
			assert.Equal(t, "2000", r.URL.Query().Get("end_timestamp"))
			_, _ = w.Write([]byte(`{"success":true,"data":[
				{"quota":1500000,"created_at":1200},
				{"quota":500000,"created_at":1600}
			]}`))
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	usage, err := FetchUpstreamUsage(context.Background(), UpstreamUsageRequest{
		Provider:   model.UpstreamProviderNewApi,
		BaseUrl:    server.URL,
		Credential: "nap-token",
		Start:      time.Unix(1000, 0),
		End:        time.Unix(2000, 0),
	})

	require.NoError(t, err)
	assert.Equal(t, 4.0, usage)
}

func TestFetchNewApiBalanceNeedsProfileScope(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/status":
			_, _ = w.Write([]byte(`{"success":true,"data":{"quota_per_unit":500000}}`))
		case "/api/user/self":
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"code":"ACCESS_TOKEN_SCOPE_DENIED","message":"The access token lacks the required permission: profile:read"}`))
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	_, err := FetchNewApiBalance(context.Background(), server.URL, "nap-token")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "profile:read")
	assert.NotContains(t, err.Error(), "nap-token")
}

func TestFetchNewApiBalanceReadsWalletInUsd(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/status":
			_, _ = w.Write([]byte(`{"success":true,"data":{"quota_per_unit":500000}}`))
		case "/api/user/self":
			assert.Equal(t, "Bearer nap-token", r.Header.Get("Authorization"))
			_, _ = w.Write([]byte(`{"success":true,"data":{"quota":3750000}}`))
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	balance, err := FetchNewApiBalance(context.Background(), server.URL, "nap-token")

	require.NoError(t, err)
	assert.Equal(t, 7.5, balance)
}

func TestFetchNewApiUsageRequiresBaseUrl(t *testing.T) {
	_, err := FetchUpstreamUsage(context.Background(), UpstreamUsageRequest{
		Provider:   model.UpstreamProviderNewApi,
		Credential: "nap-token",
	})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "base url")
}

// A gateway that ships a large announcement list in /api/status must still be
// readable; a 512 KiB body used to be cut off and rejected as invalid JSON.
func TestFetchNewApiBalanceReadsLargeStatusDocument(t *testing.T) {
	status := fmt.Sprintf(`{"success":true,"data":{"quota_per_unit":500000,"announcements_enabled":true,"announcement":"%s"}}`, strings.Repeat("a", 512<<10))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/status":
			_, _ = w.Write([]byte(status))
		case "/api/user/self":
			_, _ = w.Write([]byte(`{"success":true,"data":{"quota":2500000}}`))
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	balance, err := FetchNewApiBalance(context.Background(), server.URL, "nap-token")

	require.NoError(t, err)
	assert.Equal(t, 5.0, balance)
}

func TestFetchNewApiTopUpsReadsEveryPage(t *testing.T) {
	const total = 101
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/user/topup/self", r.URL.Path)
		assert.Equal(t, "Bearer nap_token", r.Header.Get("Authorization"))
		page, _ := strconv.Atoi(r.URL.Query().Get("p"))
		size, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
		start := page * size
		count := min(size, total-start)
		var body strings.Builder
		fmt.Fprintf(&body, `{"success":true,"data":{"total":%d,"items":[`, total)
		for i := range count {
			if i > 0 {
				body.WriteByte(',')
			}
			index := start + i
			completed := 1700000000 + index
			if index == total-1 {
				// No completion time: the creation time stands in.
				completed = 0
			}
			fmt.Fprintf(&body, `{"id":%d,"money":20,"amount":0,"trade_no":"trade-%d","payment_method":"alipay","status":"success","create_time":%d,"complete_time":%d}`,
				index+1, index, 1600000000+index, completed)
		}
		body.WriteString(`]}}`)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body.String()))
	}))
	defer server.Close()

	rows, err := FetchNewApiTopUps(context.Background(), server.URL, "nap_token")

	require.NoError(t, err)
	require.Len(t, rows, total)
	assert.Equal(t, "trade-0", rows[0].TradeNo)
	assert.Equal(t, 20.0, rows[0].Paid)
	assert.Equal(t, "alipay", rows[0].Method)
	assert.Equal(t, "success", rows[0].Status)
	assert.Equal(t, int64(1700000000), rows[0].PaidAt)
	assert.Equal(t, int64(1600000000+total-1), rows[total-1].PaidAt)
}

func TestFetchNewApiTopUpsExplainsMissingPermissionWithoutLeaking(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"code":"ACCESS_TOKEN_SCOPE_DENIED","message":"denied"}`))
	}))
	defer server.Close()

	_, err := FetchNewApiTopUps(context.Background(), server.URL, "nap_secret")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "top-up history")
	assert.NotContains(t, err.Error(), "nap_secret")
}

func TestOpenLuxCredentialNeedsAccountIdAndToken(t *testing.T) {
	for _, credential := range []string{"", "42", ":token", "42:", "user-1:token"} {
		_, _, err := openLuxCredential(credential)
		require.Error(t, err, credential)
		assert.Contains(t, err.Error(), "openlux")
	}

	accountId, token, err := openLuxCredential(" 42 : token-value ")

	require.NoError(t, err)
	assert.Equal(t, "42", accountId)
	assert.Equal(t, "token-value", token)
}

func TestFetchOpenLuxUsageSendsAccountHeaderAndSumsQuota(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/status":
			_, _ = w.Write([]byte(`{"success":true,"data":{"quota_per_unit":500000}}`))
		case "/api/data/self":
			assert.Equal(t, "Bearer olux-token", r.Header.Get("Authorization"))
			assert.Equal(t, "42", r.Header.Get("New-Api-User"))
			assert.Equal(t, "1000", r.URL.Query().Get("start_timestamp"))
			assert.Equal(t, "2000", r.URL.Query().Get("end_timestamp"))
			_, _ = w.Write([]byte(`{"success":true,"data":[{"quota":300000},{"quota":611984}]}`))
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	usage, err := FetchUpstreamUsage(context.Background(), UpstreamUsageRequest{
		Provider:   model.UpstreamProviderOpenLux,
		BaseUrl:    server.URL,
		Credential: "42:olux-token",
		Start:      time.Unix(1000, 0),
		End:        time.Unix(2000, 0),
	})

	require.NoError(t, err)
	assert.InDelta(t, 1.823968, usage, 1e-9)
}

func TestFetchOpenLuxBalanceReadsWalletInUsd(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/status":
			_, _ = w.Write([]byte(`{"success":true,"data":{"quota_per_unit":500000}}`))
		case "/api/user/self":
			assert.Equal(t, "Bearer olux-token", r.Header.Get("Authorization"))
			assert.Equal(t, "42", r.Header.Get("New-Api-User"))
			_, _ = w.Write([]byte(`{"success":true,"data":{"quota":388062}}`))
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	balance, err := FetchOpenLuxBalance(context.Background(), server.URL, "42:olux-token")

	require.NoError(t, err)
	assert.InDelta(t, 0.776124, balance, 1e-9)
}

// OpenLux keeps unpaid orders in the same history as paid ones, so the reader
// must page through both and leave the status untouched for the booking step.
func TestFetchOpenLuxTopUpsReadsPagesAndKeepsUnpaidOrders(t *testing.T) {
	const total = 101
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/user/topuprecords", r.URL.Path)
		assert.Equal(t, "42", r.Header.Get("New-Api-User"))
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		size, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
		start := (page - 1) * size
		count := min(size, total-start)
		var body strings.Builder
		fmt.Fprintf(&body, `{"success":true,"data":{"page":%d,"page_size":%d,"total":%d,"records":[`, page, size, total)
		for i := range count {
			if i > 0 {
				body.WriteByte(',')
			}
			index := start + i
			status, money := "pending", 9.9
			if index%2 == 0 {
				status, money = "success", 19.9
			}
			fmt.Fprintf(&body, `{"id":%d,"amount":10,"money":%v,"trade_no":"USR-%d","payment_method":"alipay","status":%q,"create_time":%d,"complete_time":0}`,
				index+1, money, index, status, 1700000000+index)
		}
		body.WriteString(`]}}`)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body.String()))
	}))
	defer server.Close()

	rows, err := FetchOpenLuxTopUps(context.Background(), server.URL, "42:olux-token")

	require.NoError(t, err)
	require.Len(t, rows, total)
	assert.Equal(t, "USR-0", rows[0].TradeNo)
	assert.Equal(t, 19.9, rows[0].Paid)
	assert.Equal(t, "success", rows[0].Status)
	assert.Equal(t, "pending", rows[1].Status)
	assert.Equal(t, 9.9, rows[1].Paid)
	assert.Equal(t, int64(1700000000), rows[0].PaidAt)
}

func TestFetchOpenLuxUsageReportsRejectedAccessTokenWithoutLeaking(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/status" {
			_, _ = w.Write([]byte(`{"success":true,"data":{"quota_per_unit":500000}}`))
			return
		}
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"message":"无权进行此操作，access token 无效","success":false}`))
	}))
	defer server.Close()

	_, err := FetchOpenLuxTopUps(context.Background(), server.URL, "42:olux-secret")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "access token")
	assert.NotContains(t, err.Error(), "olux-secret")
}

func commandCodeReportFixture(t *testing.T, now time.Time) map[string]any {
	t.Helper()
	return map[string]any{
		"version": 1, "generated_at": now.Unix(), "first_observed_at": now.Add(-24 * time.Hour).Unix(),
		"observed_days": 1, "usage_7d": 4, "target_3d": 12, "balance": 20, "wallet_balance": 40,
		"plans": []CommandCodePlan{{Plan: "go", Count: 1, Enabled: 1, CostCNY: 4.25, WeeklyCap: 6}, {Plan: "goat", Count: 1, Enabled: 1, CostCNY: 12.75, WeeklyCap: 35}},
		"purchases": []CommandCodePurchase{
			{Id: strings.Repeat("a", 64), Plan: "go", PaidCNY: 4.25, PaidAt: now.Add(-time.Hour).Unix()},
			{Id: strings.Repeat("b", 64), Plan: "goat", PaidCNY: 12.75, PaidAt: now.Add(-time.Hour).Unix()},
		},
	}
}

func writeCommandCodeReport(t *testing.T, report map[string]any) {
	t.Helper()
	data, err := common.Marshal(report)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(os.Getenv("COMMANDCODE_FINANCE_REPORT"), data, 0600))
}

func TestCommandCodeReportRejectsStaleAndInvalidFinancialFacts(t *testing.T) {
	now := time.Unix(1792570000, 0)
	t.Setenv("COMMANDCODE_FINANCE_REPORT", filepath.Join(t.TempDir(), "report.json"))
	t.Setenv("COMMANDCODE_GO_COST_CNY", "4.25")
	t.Setenv("COMMANDCODE_GOAT_COST_CNY", "12.75")
	for _, tc := range []struct {
		name  string
		field string
		value any
	}{
		{"stale", "generated_at", now.Add(-6 * time.Minute).Unix()},
		{"future", "generated_at", now.Add(2 * time.Minute).Unix()},
		{"negative balance", "balance", -1},
		{"oversized balance", "balance", 1e99},
		{"excess observation window", "observed_days", 8},
		{"unrecognized purchase", "purchases", []CommandCodePurchase{{Id: strings.Repeat("a", 64), Plan: "other", PaidCNY: 4.25, PaidAt: now.Unix()}}},
		{"wrong purchase price", "purchases", []CommandCodePurchase{{Id: strings.Repeat("a", 64), Plan: "go", PaidCNY: 35, PaidAt: now.Unix()}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			report := commandCodeReportFixture(t, now)
			report[tc.field] = tc.value
			writeCommandCodeReport(t, report)
			_, err := ReadCommandCodeFinance(now)
			require.Error(t, err)
		})
	}
	report := commandCodeReportFixture(t, now)
	writeCommandCodeReport(t, report)
	result, err := ReadCommandCodeFinance(now)
	require.NoError(t, err)
	require.Len(t, result.Purchases, 2)
	public, err := common.Marshal(result)
	require.NoError(t, err)
	assert.NotContains(t, string(public), "purchases")
	assert.NotContains(t, string(public), strings.Repeat("a", 64))
}

func TestCommandCodePurchasesDatabase(t *testing.T) {
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(engine, func(t *testing.T) {
			var driver gorm.Dialector
			kind := common.DatabaseTypeSQLite
			switch engine {
			case "sqlite":
				driver = sqlite.Open(":memory:")
			case "mysql":
				dsn := os.Getenv("TEST_MYSQL_DSN")
				if dsn == "" {
					t.Skip("TEST_MYSQL_DSN not configured")
				}
				driver, kind = mysql.Open(dsn), common.DatabaseTypeMySQL
			case "postgres":
				dsn := os.Getenv("TEST_POSTGRES_DSN")
				if dsn == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
				driver, kind = postgres.Open(dsn), common.DatabaseTypePostgreSQL
			}
			db, err := gorm.Open(driver, &gorm.Config{})
			require.NoError(t, err)
			versionQuery := "SELECT version()"
			if engine == "sqlite" {
				versionQuery = "SELECT sqlite_version()"
			}
			var version string
			require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
			t.Logf("Database version: %s", version)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)
			oldDB := model.DB
			mainType, logType := common.MainDatabaseType(), common.LogDatabaseType()
			model.DB = db
			common.SetDatabaseTypes(kind, kind)
			t.Cleanup(func() {
				_ = db.Migrator().DropTable(&model.UpstreamTopUp{}, &model.UpstreamAccount{})
				model.DB = oldDB
				common.SetDatabaseTypes(mainType, logType)
				_ = sqlDB.Close()
			})
			require.NoError(t, db.Migrator().DropTable(&model.UpstreamTopUp{}, &model.UpstreamAccount{}))
			require.NoError(t, db.AutoMigrate(&model.UpstreamAccount{}, &model.UpstreamTopUp{}))
			ordinary := model.UpstreamAccount{Name: "Existing gateway", Provider: model.UpstreamProviderNewApi, Currency: "CNY", ExchangeRate: 1}
			require.NoError(t, model.CreateUpstreamAccount(&ordinary))
			now := time.Unix(1792570000, 0)
			require.NoError(t, model.SyncUpstreamTopUps(ordinary.Id, "CNY", 1, []model.UpstreamTopUp{{TradeNo: "existing", Paid: 25, Status: "success", PaidAt: now.Unix()}}))
			require.NoError(t, db.AutoMigrate(&model.UpstreamAccount{}, &model.UpstreamTopUp{}))
			pool := model.UpstreamAccount{Name: "CommandCode", Provider: model.UpstreamProviderCommandCode, Currency: "CNY", ExchangeRate: 1}
			require.NoError(t, model.CreateUpstreamAccount(&pool))
			t.Setenv("COMMANDCODE_FINANCE_REPORT", filepath.Join(t.TempDir(), "report.json"))
			t.Setenv("COMMANDCODE_GO_COST_CNY", "4.25")
			t.Setenv("COMMANDCODE_GOAT_COST_CNY", "12.75")
			report := commandCodeReportFixture(t, now)
			writeCommandCodeReport(t, report)
			require.NoError(t, SyncCommandCodeFinance(pool.Id, now))
			require.NoError(t, SyncCommandCodeFinance(pool.Id, now))
			// A plan change or collector-state rebuild must not rewrite a purchase.
			report["purchases"].([]CommandCodePurchase)[0].Plan = "goat"
			report["purchases"].([]CommandCodePurchase)[0].PaidCNY = 12.75
			writeCommandCodeReport(t, report)
			require.NoError(t, SyncCommandCodeFinance(pool.Id, now))
			summary, err := model.UpstreamTopUpSummaryOf(pool.Id)
			require.NoError(t, err)
			assert.Equal(t, int64(2), summary.Count)
			assert.Equal(t, 17.0, summary.Total)
			prior, err := model.UpstreamTopUpSummaryOf(ordinary.Id)
			require.NoError(t, err)
			assert.Equal(t, 25.0, prior.Total)
			updated, err := model.GetUpstreamAccount(pool.Id)
			require.NoError(t, err)
			require.NotNil(t, updated.RemoteBalance)
			assert.Equal(t, 20.0, *updated.RemoteBalance)
			assert.Equal(t, 4.0, updated.Usage7d)
			duplicate := model.UpstreamAccount{Name: "Duplicate pool", Provider: model.UpstreamProviderCommandCode, Currency: "CNY", ExchangeRate: 1}
			require.NoError(t, model.CreateUpstreamAccount(&duplicate))
			require.Error(t, SyncCommandCodeFinance(duplicate.Id, now))
			missing, err := model.UpstreamTopUpSummaryOf(duplicate.Id)
			require.NoError(t, err)
			assert.Zero(t, missing.Count)
		})
	}
}
