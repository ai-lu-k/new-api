package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildUpstreamReserveCostConvertsReportsAndNamesTheGaps(t *testing.T) {
	truncateTables(t)
	originalRate := operation_setting.USDExchangeRate
	operation_setting.USDExchangeRate = 7
	t.Cleanup(func() { operation_setting.USDExchangeRate = originalRate })
	now := time.Now()
	accounts := []UpstreamAccount{
		{
			Name: "OpenAI main", Provider: UpstreamProviderOpenAI, Credential: "key",
			Usage7d: 10, UsageStatus: UpstreamUsageStatusOK,
			UsageCheckedAt: now.Unix(), UsageWindowEnd: now.Unix() - 3600,
		},
		{
			Name: "Anthropic pending", Provider: UpstreamProviderAnthropic, Credential: "key",
			UsageStatus: UpstreamUsageStatusNever,
		},
		{
			Name: "CommandCode pool", Provider: UpstreamProviderCommandCode,
			Usage7d: 14, UsageStatus: UpstreamUsageStatusOK, UsageCheckedAt: now.Unix(),
		},
		{
			Name: "Stale gateway", Provider: UpstreamProviderNewApi, Credential: "key",
			Usage7d: 2, UsageStatus: UpstreamUsageStatusOK,
			UsageCheckedAt: now.Add(-72 * time.Hour).Unix(), UsageWindowEnd: now.Add(-72 * time.Hour).Unix(),
		},
	}
	for i := range accounts {
		require.NoError(t, DB.Create(&accounts[i]).Error)
	}

	cost, err := BuildUpstreamReserveCost(now)

	require.NoError(t, err)
	// 10 USD and 2 USD at a rate of 7; the subscription is not a daily cost.
	assert.Equal(t, 84.0, cost.Cost)
	assert.Equal(t, 3, cost.Total, "the CommandCode subscription is not a payable daily account")
	assert.Equal(t, 1, cost.Subscription)
	assert.True(t, cost.HasReports)
	assert.False(t, cost.Complete, "a never-read and a stale report both leave the target incomplete")
	assert.Equal(t, []string{"Anthropic pending"}, cost.Missing)
	assert.Equal(t, []string{"Stale gateway"}, cost.Stale)
	require.Len(t, cost.Accounts, 4)
	statuses := map[string]string{}
	for _, account := range cost.Accounts {
		statuses[account.Name] = account.Status
	}
	assert.Equal(t, map[string]string{
		"OpenAI main":       "ok",
		"Anthropic pending": UpstreamUsageStatusNever,
		"CommandCode pool":  "subscription",
		"Stale gateway":     "stale",
	}, statuses)
}

func TestBuildReserveTargetsComparesTheCumulativeBalance(t *testing.T) {
	now := time.Now()
	reported := UpstreamReserveCost{
		Cost:       210,
		HasReports: true,
		Complete:   true,
		Missing:    []string{},
		Stale:      []string{},
	}
	tests := []struct {
		name            string
		inputs          ReserveInputs
		daily           *float64
		target          *float64
		gap             *float64
		excess          *float64
		dailyComplete   bool
		extreme         *float64
		extremeGap      *float64
		extremeExcess   *float64
		extremeComplete bool
		faceValue       float64
	}{
		{
			name: "three days of the seven-day average, and the whole stock at face value",
			inputs: ReserveInputs{
				Now: now, WindowDays: 7, Balance: 100, Wallet: 500,
				PlanRemaining: 40, Cost: reported,
			},
			daily: floatPtrTest(30), target: floatPtrTest(90),
			gap: floatPtrTest(0), excess: floatPtrTest(10), dailyComplete: true,
			extreme: floatPtrTest(540), extremeGap: floatPtrTest(440),
			extremeExcess: floatPtrTest(0), extremeComplete: true,
			faceValue: 540,
		},
		{
			name: "a shortfall is reported as a gap, not a negative excess",
			inputs: ReserveInputs{
				Now: now, WindowDays: 7, Balance: 20, Wallet: 100,
				PlanRemaining: 0, Cost: reported,
			},
			daily: floatPtrTest(30), target: floatPtrTest(90),
			gap: floatPtrTest(70), excess: floatPtrTest(0), dailyComplete: true,
			extreme: floatPtrTest(100), extremeGap: floatPtrTest(80),
			extremeExcess: floatPtrTest(0), extremeComplete: true,
			faceValue: 100,
		},
		{
			name: "a genuine zero cost is a zero target, not a missing one",
			inputs: ReserveInputs{
				Now: now, WindowDays: 7, Balance: 100, Wallet: 500,
				PlanRemaining: 40,
				Cost:          UpstreamReserveCost{Cost: 0, HasReports: true, Complete: true},
			},
			daily: floatPtrTest(0), target: floatPtrTest(0),
			gap: floatPtrTest(0), excess: floatPtrTest(100), dailyComplete: true,
			extreme: floatPtrTest(540), extremeGap: floatPtrTest(440),
			extremeExcess: floatPtrTest(0), extremeComplete: true,
			faceValue: 540,
		},
		{
			name: "no cost report leaves the daily target unavailable but not the extreme one",
			inputs: ReserveInputs{
				Now: now, WindowDays: 7, Balance: 100, Wallet: 500,
				PlanRemaining: 40,
				Cost:          UpstreamReserveCost{Missing: []string{"Anthropic main"}},
			},
			daily: nil, target: nil, gap: nil, excess: nil, dailyComplete: false,
			extreme: floatPtrTest(540), extremeGap: floatPtrTest(440),
			extremeExcess: floatPtrTest(0), extremeComplete: true,
			faceValue: 540,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			targets := BuildReserveTargets(test.inputs)

			assert.Equal(t, test.daily, targets.Daily.DailyAverage)
			assert.Equal(t, test.target, targets.Daily.Target)
			assert.Equal(t, test.gap, targets.Daily.Gap)
			assert.Equal(t, test.excess, targets.Daily.Excess)
			assert.Equal(t, test.dailyComplete, targets.Daily.Complete)
			assert.Equal(t, test.inputs.Balance, targets.Baseline.Amount)
			assert.Equal(t, test.faceValue, targets.Extreme.FaceValue)
			assert.Equal(t, test.extreme, targets.Extreme.Target)
			assert.Equal(t, test.extremeGap, targets.Extreme.Gap)
			assert.Equal(t, test.extremeExcess, targets.Extreme.Excess)
			assert.Equal(t, test.extremeComplete, targets.Extreme.Complete)
		})
	}
}

func floatPtrTest(value float64) *float64 {
	return &value
}

// A retired plan leaves quota nobody can still spend, so the extreme target
// must not count that stock as money the balance has to cover.
func TestBuildReserveTargetsIgnoresRetiredPlanStock(t *testing.T) {
	previous := common.TokenPlanRetired
	common.TokenPlanRetired = true
	t.Cleanup(func() { common.TokenPlanRetired = previous })

	targets := BuildReserveTargets(ReserveInputs{
		Now: time.Now(), WindowDays: 7, Balance: 100, Wallet: 500, PlanRemaining: 40,
		Cost: UpstreamReserveCost{Cost: 210, HasReports: true, Complete: true},
	})

	assert.Equal(t, 0.0, targets.Extreme.PlanRemaining)
	assert.Equal(t, 500.0, targets.Extreme.FaceValue)
	assert.Equal(t, floatPtrTest(500), targets.Extreme.Target)
}
