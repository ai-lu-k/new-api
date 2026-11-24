package model

import (
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildWalletSourcesSplitsPaidThenGift(t *testing.T) {
	truncateTables(t)
	originalRate := operation_setting.USDExchangeRate
	operation_setting.USDExchangeRate = 7
	t.Cleanup(func() { operation_setting.USDExchangeRate = originalRate })

	// 500000 quota is one USD, so at a rate of 7 it is ¥7.
	users := []User{
		{Username: "payer", AffCode: "payer-aff", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Quota: 300000, UsedQuota: 700000},
		{Username: "unknown", AffCode: "unknown-aff", Role: common.RoleCommonUser, Status: common.UserStatusDisabled, Quota: 500000, UsedQuota: 0},
		{Username: "contestant", AffCode: "contestant-aff", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Quota: 200000, UsedQuota: 0},
		{Username: "admin", AffCode: "admin-aff", Role: common.RoleAdminUser, Status: common.UserStatusEnabled, Quota: 900000, UsedQuota: 0},
	}
	for i := range users {
		require.NoError(t, DB.Create(&users[i]).Error)
	}
	payer := users[0]
	contestant := users[2]

	// One dollar bought 500000 quota, which is the whole paid side.
	require.NoError(t, DB.Create(&TopUp{
		UserId: payer.Id, Amount: 1, Money: 1, TradeNo: "wallet-source-1",
		PaymentMethod: PaymentMethodStripe, PaymentProvider: PaymentProviderEpay,
		Status: common.TopUpStatusSuccess, CompleteTime: 100,
	}).Error)
	require.NoError(t, DB.Create(&Checkin{UserId: payer.Id, CheckinDate: "2026-10-01", QuotaAwarded: 500000}).Error)
	// An event prize is given away, so it is gift balance rather than a part of
	// the wallet the records cannot explain.
	require.NoError(t, DB.Create(&CampaignAward{
		UserId: contestant.Id, Kind: CampaignAwardSolve, ChallengeId: "c2", Quota: 200000, CreatedAt: 200,
	}).Error)

	summary, rows, err := BuildWalletSources()

	require.NoError(t, err)
	require.Len(t, rows, 3, "administrators stay out of the ordinary wallet view")
	var payerRow, unknownRow, contestantRow WalletSourceUser
	for _, row := range rows {
		switch row.Username {
		case "payer":
			payerRow = row
		case "unknown":
			unknownRow = row
		case "contestant":
			contestantRow = row
		}
	}
	// Paid quota was used up first, then 200000 of the gift quota.
	assert.Equal(t, WalletSourceUser{
		Id: payerRow.Id, Username: "payer", Status: common.UserStatusEnabled,
		Balance: 4.2, Paid: 0, Gift: 4.2,
	}, payerRow)
	// Nothing explains this balance, so it is gift rather than paid: only
	// money received is ever called paid.
	assert.Equal(t, 7.0, unknownRow.Balance)
	assert.Equal(t, 7.0, unknownRow.Gift)
	assert.Equal(t, WalletSourceUser{
		Id: contestantRow.Id, Username: "contestant", Status: common.UserStatusEnabled,
		Balance: 2.8, Paid: 0, Gift: 2.8,
	}, contestantRow)
	assert.Equal(t, 3.0, float64(summary.Users))
	assert.Equal(t, 14.0, summary.Balance)
	assert.Equal(t, 14.0, summary.Gift)
}

func TestBuildWalletSourcesReadsEachProviderTopUpAsQuota(t *testing.T) {
	truncateTables(t)
	originalRate := operation_setting.USDExchangeRate
	operation_setting.USDExchangeRate = 1
	t.Cleanup(func() { operation_setting.USDExchangeRate = originalRate })

	// Every provider stores what was paid in its own column, so an order must be
	// read the way it was written. 500000 quota is one dollar.
	orders := []struct {
		username string
		topUp    TopUp
		paid     float64
	}{
		// A checkout payment keeps the converted amount in Money.
		{username: "stripe", topUp: TopUp{
			Amount: 1, Money: 2, PaymentProvider: PaymentProviderStripe,
		}, paid: 2},
		// Creem already stores quota in Amount.
		{username: "creem", topUp: TopUp{
			Amount: 1000000, Money: 2, PaymentProvider: PaymentProviderCreem,
		}, paid: 2},
		// Everything else keeps the amount of dollars in Amount.
		{username: "epay", topUp: TopUp{
			Amount: 2, Money: 14, PaymentProvider: PaymentProviderEpay,
		}, paid: 2},
	}
	for i, order := range orders {
		user := User{
			Username: order.username, AffCode: order.username + "-aff",
			Role: common.RoleCommonUser, Status: common.UserStatusEnabled,
			// Every order bought two dollars of balance and nothing was spent.
			Quota: 1000000,
		}
		require.NoError(t, DB.Create(&user).Error)
		order.topUp.UserId = user.Id
		order.topUp.TradeNo = "provider-" + strconv.Itoa(i)
		order.topUp.PaymentMethod = "alipay"
		order.topUp.Status = common.TopUpStatusSuccess
		order.topUp.CompleteTime = 100
		require.NoError(t, DB.Create(&order.topUp).Error)
	}

	summary, rows, err := BuildWalletSources()

	require.NoError(t, err)
	require.Len(t, rows, len(orders))
	assert.Equal(t, 6.0, summary.Paid, "each order is read as the quota it bought")
	assert.Equal(t, 0.0, summary.Gift)
	assert.Equal(t, 6.0, summary.Balance)
}

func TestBuildWalletSourcesCountsUnexplainedQuotaAsGifts(t *testing.T) {
	truncateTables(t)
	originalRate := operation_setting.USDExchangeRate
	operation_setting.USDExchangeRate = 1
	t.Cleanup(func() { operation_setting.USDExchangeRate = originalRate })

	granted := User{
		Username: "granted", AffCode: "granted-aff", Role: common.RoleCommonUser,
		Status: common.UserStatusEnabled, Quota: 1000000,
	}
	require.NoError(t, DB.Create(&granted).Error)
	// An addition recorded before reasons existed received no money, so the
	// only defensible reading is a gift.
	require.NoError(t, DB.Create(&Log{
		UserId: granted.Id, Type: LogTypeTopup, CreatedAt: 100,
		Other:   `{"op":{"action":"user.quota_add","params":{"quota":1000000}}}`,
		Content: "manual quota addition",
	}).Error)
	// Records that explain more than the balance leave no negative remainder:
	// nothing is left to call gift.
	overexplained := User{
		Username: "overexplained", AffCode: "overexplained-aff", Role: common.RoleCommonUser,
		Status: common.UserStatusEnabled, Quota: 0,
	}
	require.NoError(t, DB.Create(&overexplained).Error)
	require.NoError(t, DB.Create(&Log{
		UserId: overexplained.Id, Type: LogTypeTopup, CreatedAt: 100,
		Other:   `{"op":{"action":"user.quota_add","params":{"quota":5000000,"reason":"gift"}}}`,
		Content: "manual quota addition",
	}).Error)

	summary, rows, err := BuildWalletSources()

	require.NoError(t, err)
	require.Len(t, rows, 2)
	assert.Equal(t, 0.0, summary.Paid)
	assert.Equal(t, 2.0, summary.Gift)
	assert.Equal(t, 2.0, summary.Balance)
	assert.Equal(t, 2.0, rows[0].Gift)
	assert.Equal(t, 0.0, rows[1].Gift, "a wallet smaller than its records has no gift left")
}

func TestFinanceConsumptionBetweenSplitsPlanFreeUsage(t *testing.T) {
	truncateTables(t)
	originalRate := operation_setting.USDExchangeRate
	operation_setting.USDExchangeRate = 7
	t.Cleanup(func() { operation_setting.USDExchangeRate = originalRate })

	start, end := int64(1_000_000), int64(1_100_000)
	require.NoError(t, DB.Create(&Log{UserId: 1, Type: LogTypeConsume, CreatedAt: start + 10, Quota: 1_000_000}).Error)
	require.NoError(t, DB.Create(&Log{UserId: 1, Type: LogTypeConsume, CreatedAt: start + 20, Quota: 100_000}).Error)
	// Outside the window.
	require.NoError(t, DB.Create(&Log{UserId: 1, Type: LogTypeConsume, CreatedAt: end + 10, Quota: 900_000}).Error)
	require.NoError(t, DB.Create(&TokenPlanReservation{UserId: 1, WeekId: 1, Settled: true, SettledAt: start + 15, FreeUsed: 400_000}).Error)
	// The gifted share of the wallet spend, recorded on the day it happened.
	require.NoError(t, DB.Create(&GiftConsumptionDaily{DayKey: financeDayStart(start+10).Format("2006-01-02"), UserId: 1, Quota: 700_000}).Error)

	consumption, err := FinanceConsumptionBetween(start, end)

	require.NoError(t, err)
	assert.Equal(t, 15.4, consumption.Total)
	assert.Equal(t, 5.6, consumption.PlanFree)
	assert.Equal(t, 9.8, consumption.Wallet)
	assert.Equal(t, 9.8, consumption.GiftConsumed, "gift is part of the wallet spend, not extra")
}

func TestUpstreamAccountKeepsUsageOutOfEdits(t *testing.T) {
	truncateTables(t)

	account := UpstreamAccount{Name: "OpenAI org", Provider: UpstreamProviderOpenAI, Credential: "sk-admin"}
	require.NoError(t, CreateUpstreamAccount(&account))
	require.NotZero(t, account.Id)

	require.NoError(t, SaveUpstreamUsage(account.Id, 21, 100, 200, 300, UpstreamUsageStatusOK, ""))
	remote := 7.5
	require.NoError(t, SaveUpstreamBalance(account.Id, &remote, 350, ""))
	balance := 12.5
	account.Name = "OpenAI org renamed"
	account.ManualBalance = &balance
	account.ManualBalanceUpdatedAt = 400
	require.NoError(t, UpdateUpstreamAccount(&account))

	reloaded, err := GetUpstreamAccount(account.Id)
	require.NoError(t, err)
	assert.Equal(t, "OpenAI org renamed", reloaded.Name)
	assert.Equal(t, "sk-admin", reloaded.Credential)
	assert.Equal(t, 21.0, reloaded.Usage7d)
	assert.Equal(t, UpstreamUsageStatusOK, reloaded.UsageStatus)
	assert.Equal(t, 12.5, *reloaded.ManualBalance)
	assert.Equal(t, 7.5, *reloaded.RemoteBalance)
	assert.Equal(t, int64(350), reloaded.RemoteBalanceAt)

	// A failed wallet read explains itself and keeps the last amount.
	require.NoError(t, SaveUpstreamBalance(account.Id, nil, 500, "the access token needs the profile:read scope to read the balance"))
	reloaded, err = GetUpstreamAccount(account.Id)
	require.NoError(t, err)
	assert.Equal(t, 7.5, *reloaded.RemoteBalance)
	assert.Equal(t, int64(350), reloaded.RemoteBalanceAt)
	assert.Contains(t, reloaded.BalanceError, "profile:read")

	require.NoError(t, DeleteUpstreamAccount(account.Id))
	_, err = GetUpstreamAccount(account.Id)
	assert.ErrorIs(t, err, ErrUpstreamAccountNotFound)
}
