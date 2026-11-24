package model

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newApiAccountForTopUps(t *testing.T) *UpstreamAccount {
	t.Helper()
	account := &UpstreamAccount{
		Name:         "upstream.example.test",
		Provider:     UpstreamProviderNewApi,
		BaseUrl:      "https://upstream.example.test",
		Credential:   "token",
		Currency:     "USD",
		ExchangeRate: 7.2,
	}
	require.NoError(t, CreateUpstreamAccount(account))
	return account
}

func findTopUp(t *testing.T, rows []UpstreamTopUp, tradeNo string) UpstreamTopUp {
	t.Helper()
	for _, row := range rows {
		if row.TradeNo == tradeNo {
			return row
		}
	}
	t.Fatalf("top-up %s not found", tradeNo)
	return UpstreamTopUp{}
}

func TestSyncUpstreamTopUpsKeepsOneRowPerTradeNumber(t *testing.T) {
	truncateTables(t)
	account := newApiAccountForTopUps(t)
	paidAt := time.Date(2026, 10, 15, 10, 0, 0, 0, time.FixedZone("Asia/Shanghai", 8*60*60)).Unix()
	rows := []UpstreamTopUp{
		{TradeNo: "a", Paid: 20, Method: "alipay", Status: "success", PaidAt: paidAt},
		{TradeNo: "b", Paid: 10, Method: "alipay", Status: "failed", PaidAt: paidAt},
	}
	require.NoError(t, SyncUpstreamTopUps(account.Id, "USD", 7.2, rows))

	// The gateway returns the same payments again, now on a corrected rate.
	rows[0].Paid = 21
	require.NoError(t, SyncUpstreamTopUps(account.Id, "USD", 7.5, rows))

	stored, err := ListUpstreamTopUps(account.Id)
	require.NoError(t, err)
	require.Len(t, stored, 2)
	assert.Equal(t, 21.0, findTopUp(t, stored, "a").Paid)
	assert.Equal(t, 7.5, findTopUp(t, stored, "a").Rate)

	summary, err := UpstreamTopUpSummaryOf(account.Id)
	require.NoError(t, err)
	assert.Equal(t, int64(1), summary.Count)
	assert.Equal(t, 157.5, summary.Total)
	assert.NotZero(t, summary.CheckedAt)
}

func TestUpstreamTopUpExpensesUseShanghaiMonthsAndDays(t *testing.T) {
	truncateTables(t)
	account := newApiAccountForTopUps(t)
	// 16:30 UTC on Sep 30 is 00:30 on Oct 1 in Shanghai.
	october := time.Date(2026, 9, 30, 16, 30, 0, 0, time.UTC).Unix()
	september := time.Date(2026, 9, 30, 15, 30, 0, 0, time.UTC).Unix()
	require.NoError(t, SyncUpstreamTopUps(account.Id, "USD", 2, []UpstreamTopUp{
		{TradeNo: "oct", Paid: 10, Status: "success", PaidAt: october},
		{TradeNo: "sep", Paid: 5, Status: "success", PaidAt: september},
		{TradeNo: "failed", Paid: 99, Status: "failed", PaidAt: october},
	}))

	months, err := UpstreamTopUpExpenseMonths()
	require.NoError(t, err)
	assert.Equal(t, 20.0, months["2026-10"])
	assert.Equal(t, 10.0, months["2026-09"])

	days, err := UpstreamTopUpExpenseDays(time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC).Unix(),
		time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC).Unix())
	require.NoError(t, err)
	assert.Equal(t, 20.0, days["2026-10-01"])
	assert.Equal(t, 10.0, days["2026-09-30"])
}

func TestUpstreamTopUpCountsSpentRedemptionCodes(t *testing.T) {
	truncateTables(t)
	account := newApiAccountForTopUps(t)
	paidAt := time.Date(2026, 11, 4, 12, 0, 25, 0, time.FixedZone("Asia/Shanghai", 8*60*60)).Unix()
	// A provider that only sells redemption codes records a purchase as a used
	// code, never as a "success" payment.
	require.NoError(t, SyncUpstreamTopUps(account.Id, "USD", 1.03, []UpstreamTopUp{
		{TradeNo: "redeem:used", Paid: 10, Method: UpstreamTopUpMethodRedeem, Status: "used", PaidAt: paidAt},
		{TradeNo: "redeem:unused", Paid: 10, Method: UpstreamTopUpMethodRedeem, Status: "unused", PaidAt: paidAt},
	}))

	summary, err := UpstreamTopUpSummaryOf(account.Id)
	require.NoError(t, err)
	assert.Equal(t, int64(1), summary.Count)
	assert.InDelta(t, 10.3, summary.Total, 1e-9)
}

func TestDeleteUpstreamAccountRemovesItsTopUps(t *testing.T) {
	truncateTables(t)
	account := newApiAccountForTopUps(t)
	require.NoError(t, SyncUpstreamTopUps(account.Id, "USD", 7.2, []UpstreamTopUp{
		{TradeNo: "a", Paid: 20, Status: "success", PaidAt: 1792297211},
	}))

	require.NoError(t, DeleteUpstreamAccount(account.Id))

	rows, err := ListUpstreamTopUps(account.Id)
	require.NoError(t, err)
	assert.Empty(t, rows)
}
