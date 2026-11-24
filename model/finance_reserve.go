package model

import (
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// ReserveHorizonDays is the horizon both reserve targets cover: three days of
// normal operation, or the whole consumable stock spent inside three days.
const ReserveHorizonDays = 3

// A cost report older than this no longer describes the latest seven complete
// days, so its account is marked stale instead of being accepted silently.
const reserveCostReportMaxAge = 48 * time.Hour

// UpstreamReserveAccount is one funding account's contribution to the daily
// cost line. Usage is what the provider billed in its seven-day window; Cost
// is that amount in the finance pages' display currency.
type UpstreamReserveAccount struct {
	Id        int     `json:"id"`
	Name      string  `json:"name"`
	Provider  string  `json:"provider"`
	Usage     float64 `json:"usage_7d"`
	Cost      float64 `json:"cost"`
	Included  bool    `json:"included"`
	Status    string  `json:"status"`
	WindowEnd int64   `json:"window_end"`
	CheckedAt int64   `json:"checked_at"`
}

// UpstreamReserveCost is what the funded upstream accounts actually paid over
// their last seven complete days, in the display currency. CommandCode is a
// subscription paid in advance, so its credits are not a per-day cost and its
// payment already sits in the expense ledger; it stays out of the sum.
type UpstreamReserveCost struct {
	Cost         float64                  `json:"cost"`
	Accounts     []UpstreamReserveAccount `json:"accounts"`
	Missing      []string                 `json:"missing_accounts"`
	Stale        []string                 `json:"stale_accounts"`
	Subscription int                      `json:"subscription_accounts"`
	Total        int                      `json:"total_accounts"`
	HasReports   bool                     `json:"has_reports"`
	Complete     bool                     `json:"complete"`
}

// BuildUpstreamReserveCost reads the cost reports already stored for every
// funding account. It never calls a provider: a report that was never read, or
// failed, is reported as missing so the target is shown as incomplete instead
// of being guessed.
func BuildUpstreamReserveCost(now time.Time) (UpstreamReserveCost, error) {
	accounts, err := ListUpstreamAccounts()
	if err != nil {
		return UpstreamReserveCost{}, err
	}
	rate := operation_setting.USDExchangeRate
	staleBefore := now.Add(-reserveCostReportMaxAge).Unix()
	cost := UpstreamReserveCost{
		Accounts: make([]UpstreamReserveAccount, 0, len(accounts)),
		Missing:  make([]string, 0),
		Stale:    make([]string, 0),
	}
	for _, account := range accounts {
		view := UpstreamReserveAccount{
			Id:        account.Id,
			Name:      account.Name,
			Provider:  account.Provider,
			Usage:     account.Usage7d,
			WindowEnd: account.UsageWindowEnd,
			CheckedAt: account.UsageCheckedAt,
		}
		if account.Provider == UpstreamProviderCommandCode || account.Provider == UpstreamProviderWorkBuddy {
			view.Status = "subscription"
			cost.Subscription++
			cost.Accounts = append(cost.Accounts, view)
			continue
		}
		cost.Total++
		if account.UsageStatus != UpstreamUsageStatusOK || account.UsageCheckedAt == 0 {
			view.Status = account.UsageStatus
			if view.Status == "" {
				view.Status = UpstreamUsageStatusNever
			}
			cost.Missing = append(cost.Missing, account.Name)
			cost.Accounts = append(cost.Accounts, view)
			continue
		}
		// Every cost report is billed in USD; the finance pages show CNY.
		view.Included = true
		view.Cost = roundMoney(account.Usage7d * rate)
		view.Status = "ok"
		if account.UsageWindowEnd > 0 && account.UsageWindowEnd < staleBefore {
			view.Status = "stale"
			cost.Stale = append(cost.Stale, account.Name)
		}
		cost.Cost = roundMoney(cost.Cost + view.Cost)
		cost.HasReports = true
		cost.Accounts = append(cost.Accounts, view)
	}
	cost.Complete = cost.Total > 0 && len(cost.Missing) == 0 && len(cost.Stale) == 0
	return cost, nil
}

// ReserveInputs gathers the facts the reserve targets compare. Balance is the
// cumulative historical balance, not a user's remaining quota.
type ReserveInputs struct {
	Now           time.Time
	WindowDays    int
	WindowStart   int64
	WindowEnd     int64
	Balance       float64
	Wallet        float64
	PlanRemaining float64
	Cost          UpstreamReserveCost
}

// ReserveBaseline is the comparison basis: everything received minus
// everything spent since the site began.
type ReserveBaseline struct {
	Amount float64 `json:"amount"`
	Scope  string  `json:"scope"`
	AsOf   int64   `json:"as_of"`
}

// ReserveDaily is three days of the seven-day average upstream cost.
type ReserveDaily struct {
	WindowDays   int                      `json:"window_days"`
	HorizonDays  int                      `json:"horizon_days"`
	WindowStart  int64                    `json:"window_start"`
	WindowEnd    int64                    `json:"window_end"`
	Cost         float64                  `json:"cost"`
	DailyAverage *float64                 `json:"daily_average"`
	Target       *float64                 `json:"target"`
	Gap          *float64                 `json:"gap"`
	Excess       *float64                 `json:"excess"`
	Complete     bool                     `json:"complete"`
	HasReports   bool                     `json:"has_reports"`
	Accounts     []UpstreamReserveAccount `json:"accounts"`
	Missing      []string                 `json:"missing_accounts"`
	Stale        []string                 `json:"stale_accounts"`
	Subscription int                      `json:"subscription_accounts"`
}

// ReserveExtreme is the whole consumable stock — every ordinary user's wallet,
// gift balance included, plus the Token Plan free quota still left — spent
// within three days at face value.
type ReserveExtreme struct {
	HorizonDays   int      `json:"horizon_days"`
	Wallet        float64  `json:"wallet"`
	PlanRemaining float64  `json:"plan_remaining"`
	FaceValue     float64  `json:"face_value"`
	Target        *float64 `json:"target"`
	Gap           *float64 `json:"gap"`
	Excess        *float64 `json:"excess"`
	Complete      bool     `json:"complete"`
}

// ReserveTargets answers one question: is the cumulative balance enough for
// three ordinary days and for the extreme case?
type ReserveTargets struct {
	AsOf     int64           `json:"as_of"`
	Baseline ReserveBaseline `json:"baseline"`
	Daily    ReserveDaily    `json:"daily"`
	Extreme  ReserveExtreme  `json:"extreme"`
}

// BuildReserveTargets compares the cumulative balance with the two targets.
// An unavailable target stays null with its reason reported, never zero.
func BuildReserveTargets(inputs ReserveInputs) ReserveTargets {
	baseline := roundMoney(inputs.Balance)
	targets := ReserveTargets{
		AsOf: inputs.Now.Unix(),
		Baseline: ReserveBaseline{
			Amount: baseline,
			Scope:  "all_history",
			AsOf:   inputs.Now.Unix(),
		},
		Daily: ReserveDaily{
			WindowDays:   inputs.WindowDays,
			HorizonDays:  ReserveHorizonDays,
			WindowStart:  inputs.WindowStart,
			WindowEnd:    inputs.WindowEnd,
			Cost:         roundMoney(inputs.Cost.Cost),
			Complete:     inputs.Cost.Complete,
			HasReports:   inputs.Cost.HasReports,
			Accounts:     inputs.Cost.Accounts,
			Missing:      inputs.Cost.Missing,
			Stale:        inputs.Cost.Stale,
			Subscription: inputs.Cost.Subscription,
		},
	}
	if inputs.WindowDays > 0 && inputs.Cost.HasReports {
		daily := roundMoney(inputs.Cost.Cost / float64(inputs.WindowDays))
		target := roundMoney(daily * ReserveHorizonDays)
		targets.Daily.DailyAverage = &daily
		targets.Daily.Target = &target
		targets.Daily.Gap, targets.Daily.Excess = reserveDifference(baseline, target)
	}

	wallet := roundMoney(max(inputs.Wallet, 0))
	planRemaining := roundMoney(max(inputs.PlanRemaining, 0))
	// A retired plan hands out no quota anyone can still spend, so its leftover
	// stock is not money the balance has to be able to cover.
	if common.TokenPlanRetired {
		planRemaining = 0
	}
	faceValue := roundMoney(wallet + planRemaining)
	// The extreme line takes the consumable stock at face value: the whole
	// wallet and plan quota gone within three days is the worst case the
	// operator wants to be able to fund, whatever the current cost share is.
	extremeTarget := faceValue
	targets.Extreme = ReserveExtreme{
		HorizonDays:   ReserveHorizonDays,
		Wallet:        wallet,
		PlanRemaining: planRemaining,
		FaceValue:     faceValue,
		Target:        &extremeTarget,
		Complete:      true,
	}
	targets.Extreme.Gap, targets.Extreme.Excess = reserveDifference(baseline, extremeTarget)
	return targets
}

func reserveDifference(balance, target float64) (*float64, *float64) {
	gap := roundMoney(max(target-balance, 0))
	excess := roundMoney(max(balance-target, 0))
	return &gap, &excess
}
