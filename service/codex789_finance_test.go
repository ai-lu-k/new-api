package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var codex789Shanghai = time.FixedZone("Asia/Shanghai", 8*60*60)

func newCodex789Server(t *testing.T, handler http.HandlerFunc) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return server
}

func TestRefreshCodex789TokenReturnsTheRotatedCredential(t *testing.T) {
	server := newCodex789Server(t, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/v1/auth/refresh", r.URL.Path)
		_, _ = w.Write([]byte(`{"code":0,"message":"success","data":{"access_token":"at-2","refresh_token":"rt-2","expires_in":86400}}`))
	})

	access, refresh, err := RefreshCodex789Token(context.Background(), server.URL, "rt-1")
	require.NoError(t, err)
	assert.Equal(t, "at-2", access)
	assert.Equal(t, "rt-2", refresh)

	denied := newCodex789Server(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"code":"UNAUTHORIZED","message":"Authorization header is required"}`))
	})
	_, _, err = RefreshCodex789Token(context.Background(), denied.URL, "rt-spent")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "refresh token was rejected")
}

func TestFetchCodex789TopUpsReadsSpentCodesOnly(t *testing.T) {
	server := newCodex789Server(t, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/v1/redeem/history", r.URL.Path)
		_, _ = w.Write([]byte(`{"code":0,"data":{"items":[
			{"id":1,"code":"abc","value":10,"status":"used","used_at":"2026-11-04T12:00:25.030515+08:00"},
			{"id":2,"code":"def","value":10,"status":"unused","used_at":""}
		],"total":2}}`))
	})

	rows, err := FetchCodex789TopUps(context.Background(), server.URL, "at")
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, model.UpstreamTopUpMethodRedeem+":abc", rows[0].TradeNo)
	assert.Equal(t, 10.0, rows[0].Paid)
	assert.Equal(t, model.UpstreamTopUpMethodRedeem, rows[0].Method)
	assert.Equal(t, "used", rows[0].Status)
	assert.Equal(t, time.Date(2026, 11, 4, 12, 0, 25, 30515000, codex789Shanghai).Unix(), rows[0].PaidAt)
}

func TestFetchCodex789UsageKeepsOnlyTheWindow(t *testing.T) {
	start := time.Date(2026, 10, 28, 0, 0, 0, 0, codex789Shanghai)
	end := start.AddDate(0, 0, UpstreamUsageWindowDays)
	server := newCodex789Server(t, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/v1/usage", r.URL.Path)
		_, _ = w.Write([]byte(`{"code":0,"data":{"items":[
			{"total_cost":0.5,"created_at":"2026-11-02T10:00:00.123456+08:00"},
			{"total_cost":0.25,"created_at":"2026-10-29T23:00:00+08:00"},
			{"total_cost":9,"created_at":"2026-10-01T10:00:00+08:00"}
		],"total":3}}`))
	})

	usage, err := FetchCodex789Usage(context.Background(), server.URL, "at", start, end)
	require.NoError(t, err)
	assert.InDelta(t, 0.75, usage, 1e-9)
}

func TestSyncCodex789FinanceStoresTheRotatedTokenAndPayments(t *testing.T) {
	require.NoError(t, model.DB.AutoMigrate(&model.UpstreamAccount{}, &model.UpstreamTopUp{}))
	require.NoError(t, model.DB.Exec("DELETE FROM upstream_accounts").Error)
	require.NoError(t, model.DB.Exec("DELETE FROM upstream_topups").Error)

	server := newCodex789Server(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/auth/refresh":
			_, _ = w.Write([]byte(`{"code":0,"data":{"access_token":"at-2","refresh_token":"rt-2","expires_in":86400}}`))
		case "/api/v1/auth/me":
			assert.Equal(t, "Bearer at-2", r.Header.Get("Authorization"))
			_, _ = w.Write([]byte(`{"code":0,"data":{"balance":19.9,"total_recharged":33}}`))
		case "/api/v1/redeem/history":
			_, _ = w.Write([]byte(`{"code":0,"data":{"items":[
				{"id":7,"code":"f943f6db","value":10,"status":"used","used_at":"2026-11-04T12:00:25.030515+08:00"}
			],"total":1}}`))
		case "/api/v1/usage":
			_, _ = w.Write([]byte(`{"code":0,"data":{"items":[
				{"total_cost":1.5,"created_at":"2026-11-02T10:00:00+08:00"}
			],"total":1}}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})

	account := &model.UpstreamAccount{
		Name:         "codex789",
		Provider:     model.UpstreamProviderCodex789,
		BaseUrl:      server.URL,
		Credential:   "rt-1",
		Currency:     "USD",
		ExchangeRate: 1.03,
	}
	require.NoError(t, model.CreateUpstreamAccount(account))

	require.NoError(t, SyncCodex789Finance(account.Id, time.Date(2026, 11, 4, 13, 0, 0, 0, codex789Shanghai)))

	stored, err := model.GetUpstreamAccount(account.Id)
	require.NoError(t, err)
	// The panel invalidates the exchanged token, so the new one must be kept.
	assert.Equal(t, "rt-2", stored.Credential)
	require.NotNil(t, stored.RemoteBalance)
	assert.InDelta(t, 19.9, *stored.RemoteBalance, 1e-9)
	assert.Equal(t, model.UpstreamUsageStatusOK, stored.UsageStatus)
	assert.InDelta(t, 1.5, stored.Usage7d, 1e-9)

	summary, err := model.UpstreamTopUpSummaryOf(account.Id)
	require.NoError(t, err)
	assert.Equal(t, int64(1), summary.Count)
	assert.InDelta(t, 10.3, summary.Total, 1e-9)
}
