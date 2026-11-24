package model

import (
	"strconv"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildFinanceDailyFoldsMoneyIntoShanghaiDays(t *testing.T) {
	truncateTables(t)

	// 2026-10-14 15:59 UTC is still the 14th in Shanghai; one minute later is
	// the 15th.
	lateEvening := time.Date(2026, 10, 14, 15, 59, 0, 0, time.UTC).Unix()
	nextDay := time.Date(2026, 10, 14, 16, 0, 0, 0, time.UTC).Unix()
	for i, payment := range []struct {
		userId int
		money  float64
		at     int64
	}{
		{userId: 1, money: 10, at: lateEvening},
		{userId: 1, money: 12.5, at: nextDay},
		{userId: 2, money: 99, at: nextDay},
	} {
		require.NoError(t, DB.Create(&TopUp{
			UserId:        payment.userId,
			Money:         payment.money,
			TradeNo:       "trade-" + strconv.Itoa(i),
			PaymentMethod: PaymentMethodStripe,
			Status:        common.TopUpStatusSuccess,
			CompleteTime:  payment.at,
		}).Error)
	}
	// A wallet payment moved no money and must not count as income.
	require.NoError(t, DB.Create(&TopUp{
		UserId:        1,
		Money:         50,
		TradeNo:       "trade-balance",
		PaymentMethod: PaymentMethodBalance,
		Status:        common.TopUpStatusSuccess,
		CompleteTime:  nextDay,
	}).Error)
	// A failed checkout never became money either.
	require.NoError(t, DB.Create(&TopUp{
		UserId:        1,
		Money:         70,
		TradeNo:       "trade-failed",
		PaymentMethod: PaymentMethodStripe,
		Status:        "failed",
		CompleteTime:  nextDay,
	}).Error)

	audit := func(paid float64, reason string) string {
		return `{"op":{"action":"user.quota_add","params":{"quota":1000,"paid_amount":` +
			strconv.FormatFloat(paid, 'f', -1, 64) + `,"reason":"` + reason + `"}}}`
	}
	for _, add := range []struct {
		userId int
		paid   float64
		reason string
		at     int64
	}{
		{userId: 1, paid: 5, reason: QuotaAddReasonOfflinePayment, at: nextDay},
		{userId: 1, paid: 0, reason: QuotaAddReasonGift, at: nextDay},
		{userId: 3, paid: 40, reason: QuotaAddReasonOfflinePayment, at: nextDay},
	} {
		require.NoError(t, DB.Create(&Log{
			UserId:    add.userId,
			Type:      LogTypeTopup,
			CreatedAt: add.at,
			Other:     audit(add.paid, add.reason),
			Content:   "manual quota addition",
		}).Error)
	}

	rangeStart := time.Date(2026, 10, 13, 0, 0, 0, 0, time.FixedZone("Asia/Shanghai", 8*60*60)).Unix()
	rangeEnd := rangeStart + 3*86400
	months := []operation_setting.ExpenseMonth{
		{
			Month: "2026-10",
			Items: []operation_setting.ExpenseItem{
				{Name: "Server", Amount: 30, Date: "2026-10-14"},
				{Name: "Domain", Amount: 8},
				{Name: "Yearly host", Amount: 5, Spread: &operation_setting.ExpenseSpread{Total: 60, Months: 12, Index: 1}},
			},
		},
		{
			Month: "2026-07",
			Items: []operation_setting.ExpenseItem{{Name: "Old invoice", Amount: 4}},
		},
	}

	days, err := BuildFinanceDaily(rangeStart, rangeEnd, []int{2, 3}, months)

	require.NoError(t, err)
	require.Len(t, days, 3)
	// The range starts after the first of the month, so the two lines without
	// a payment date (8 + 5) land on the first day the range covers.
	assert.Equal(t, DailyFinance{Date: "2026-10-13", Expenses: 13}, days[0])
	assert.Equal(t, DailyFinance{
		Date:        "2026-10-14",
		OnlineTopUp: 10,
		Expenses:    30,
	}, days[1])
	// The gift addition of 1000 quota is worth 0.0146 at the 7.3 rate.
	assert.Equal(t, DailyFinance{
		Date:        "2026-10-15",
		OnlineTopUp: 12.5,
		ManualTopUp: 5,
		Gift:        0.0146,
	}, days[2])
}

func TestBuildFinanceDailyPutsUndatedExpensesOnTheFirstOfTheMonth(t *testing.T) {
	truncateTables(t)

	start := time.Date(2026, 10, 1, 0, 0, 0, 0, time.FixedZone("Asia/Shanghai", 8*60*60)).Unix()
	months := []operation_setting.ExpenseMonth{{
		Month: "2026-10",
		Items: []operation_setting.ExpenseItem{
			{Name: "Domain", Amount: 8},
			{Name: "Server", Amount: 30, Date: "2026-10-02"},
		},
	}}

	days, err := BuildFinanceDaily(start, start+3*86400, nil, months)

	require.NoError(t, err)
	require.Len(t, days, 3)
	assert.Equal(t, DailyFinance{Date: "2026-10-01", Expenses: 8}, days[0])
	assert.Equal(t, DailyFinance{Date: "2026-10-02", Expenses: 30}, days[1])
	assert.Equal(t, DailyFinance{Date: "2026-10-03"}, days[2])
}

func TestBuildFinanceDailyReturnsEveryDayOfTheRange(t *testing.T) {
	truncateTables(t)

	start := time.Date(2026, 10, 1, 0, 0, 0, 0, time.FixedZone("Asia/Shanghai", 8*60*60)).Unix()
	days, err := BuildFinanceDaily(start, start+2*86400, nil, nil)

	require.NoError(t, err)
	require.Len(t, days, 2)
	assert.Equal(t, "2026-10-01", days[0].Date)
	assert.Equal(t, "2026-10-02", days[1].Date)
}

func TestBuildFinanceDailyAddsUpstreamTopUps(t *testing.T) {
	truncateTables(t)
	account := UpstreamAccount{
		Name:         "upstream.example.test",
		Provider:     UpstreamProviderNewApi,
		BaseUrl:      "https://upstream.example.test",
		Credential:   "token",
		Currency:     "CNY",
		ExchangeRate: 1,
	}
	require.NoError(t, CreateUpstreamAccount(&account))
	paidAt := time.Date(2026, 10, 15, 4, 0, 0, 0, time.UTC).Unix()
	require.NoError(t, SyncUpstreamTopUps(account.Id, "CNY", 1, []UpstreamTopUp{
		{TradeNo: "a", Paid: 30, Status: "success", PaidAt: paidAt},
	}))

	start := time.Date(2026, 10, 15, 0, 0, 0, 0, time.FixedZone("Asia/Shanghai", 8*60*60)).Unix()
	days, err := BuildFinanceDaily(start, start+86400, nil, nil)
	require.NoError(t, err)
	require.Len(t, days, 1)
	assert.Equal(t, 30.0, days[0].Expenses)
}

func TestBuildFinanceDailyCountsGiftsAndTokenPlanUsage(t *testing.T) {
	truncateTables(t)
	originalRate := operation_setting.USDExchangeRate
	operation_setting.USDExchangeRate = 1
	t.Cleanup(func() { operation_setting.USDExchangeRate = originalRate })

	at := func(day, hour int) int64 {
		return time.Date(2026, 10, day, hour, 0, 0, 0, financeDayLocation).Unix()
	}
	require.NoError(t, DB.Create(&Checkin{
		UserId: 1, CheckinDate: "2026-10-14", QuotaAwarded: 500000, CreatedAt: at(14, 12),
	}).Error)
	require.NoError(t, DB.Create(&Redemption{
		UserId: 1, Key: "gift-code", Status: common.RedemptionCodeStatusUsed,
		Quota: 1000000, RedeemedTime: at(15, 10), UsedUserId: 2,
	}).Error)
	require.NoError(t, DB.Create(&CampaignAward{
		UserId: 3, Kind: CampaignAwardSolve, ChallengeId: "g1", Quota: 500000, CreatedAt: at(15, 11),
	}).Error)
	require.NoError(t, DB.Create(&Log{
		UserId: 4, Type: LogTypeTopup, CreatedAt: at(16, 9),
		Other:   `{"op":{"action":"user.quota_add","params":{"quota":500000,"reason":"gift"}}}`,
		Content: "manual quota addition",
	}).Error)
	require.NoError(t, DB.Create(&TokenPlanReservation{
		UserId: 1, WeekId: 1, Settled: true, SettledAt: at(15, 9), FreeUsed: 250000,
	}).Error)
	// A settlement that has not happened yet belongs to no day.
	require.NoError(t, DB.Create(&TokenPlanReservation{
		UserId: 1, WeekId: 2, Settled: false, SettledAt: at(16, 9), FreeUsed: 900000,
	}).Error)
	for i, charge := range []struct {
		day   int
		quota int
	}{
		{day: 14, quota: 500000},
		{day: 15, quota: 1500000},
	} {
		require.NoError(t, DB.Create(&Log{
			UserId: 1, Type: LogTypeConsume, CreatedAt: at(charge.day, 15), Quota: charge.quota,
			Content: "consume " + strconv.Itoa(i),
		}).Error)
	}
	for i, registration := range []struct {
		day  int
		role int
	}{
		{day: 15, role: common.RoleCommonUser},
		{day: 15, role: common.RoleCommonUser},
		{day: 15, role: common.RoleAdminUser},
		{day: 16, role: common.RoleCommonUser},
	} {
		require.NoError(t, DB.Create(&User{
			Username: "user-" + strconv.Itoa(i), AffCode: "aff-" + strconv.Itoa(i),
			Role: registration.role, Status: common.UserStatusEnabled,
			CreatedAt: at(registration.day, 10),
		}).Error)
	}

	// Gift spend is a per-day ledger written where the split is decided, so the
	// report reads it back instead of recomputing it.
	require.NoError(t, DB.Create(&GiftConsumptionDaily{DayKey: "2026-10-15", UserId: 1, Quota: 500_000}).Error)

	days, err := BuildFinanceDaily(at(14, 0), at(17, 0), nil, nil)

	require.NoError(t, err)
	require.Len(t, days, 3)
	// 500000 quota is one dollar; at a rate of 1 that is one unit of money.
	assert.Equal(t, "2026-10-14", days[0].Date)
	assert.Equal(t, 1.0, days[0].Gift)
	assert.Equal(t, 0.0, days[0].PlanFree)
	assert.Equal(t, 3.0, days[1].Gift, "a code and an event prize on the same day add up")
	assert.Equal(t, 0.5, days[1].PlanFree)
	assert.Equal(t, 1.0, days[2].Gift)
	assert.Equal(t, 0.0, days[2].PlanFree)
	// Consumption is what users were charged; the free share stays part of it.
	assert.Equal(t, 1.0, days[0].Consumption)
	assert.Equal(t, 3.0, days[1].Consumption)
	assert.Equal(t, 0.0, days[2].Consumption)
	// The gifted share of those charges, only on the day it was spent.
	assert.Equal(t, 0.0, days[0].GiftConsumed)
	assert.Equal(t, 1.0, days[1].GiftConsumed)
	assert.Equal(t, 0.0, days[2].GiftConsumed)
	// Administrators are not customer growth.
	assert.Equal(t, 0, days[0].NewUsers)
	assert.Equal(t, 2, days[1].NewUsers)
	assert.Equal(t, 1, days[2].NewUsers)
}
