package service

import (
	"errors"
	"io"
	"math"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// WorkBuddy is a prepaid credit pool: every domestic account is bought for a
// fixed price and its credits are spent per token upstream. The host collector
// reads the pool and writes one report; the gateway never sees the accounts'
// tokens. Amounts in this report are the pool's own unit (credits), not money:
// the money the operator paid is the purchase list, one row per account.
type WorkBuddyPurchase struct {
	Id      string  `json:"id"`
	PaidCNY float64 `json:"paid_cny"`
	PaidAt  int64   `json:"paid_at"`
}

// WorkBuddyRealm is how many pooled accounts one realm holds. The money
// figures above stay domestic-only; this is only the headcount.
type WorkBuddyRealm struct {
	Realm   string `json:"realm"`
	Total   int    `json:"total"`
	Enabled int    `json:"enabled"`
}

type WorkBuddyFinance struct {
	Version         int   `json:"version"`
	GeneratedAt     int64 `json:"generated_at"`
	FirstObservedAt int64 `json:"first_observed_at"`
	// ObservedDays is how many complete days the ledger actually covers, so a
	// window that is not yet full is reported as such instead of as seven days.
	ObservedDays  float64 `json:"observed_days"`
	WindowStart   int64   `json:"window_start"`
	Usage7d       float64 `json:"usage_7d"`
	UsageComplete bool    `json:"usage_complete"`
	Target3d      float64 `json:"target_3d"`
	Balance       float64 `json:"balance"`
	// ExpiringCredits is the part of Balance that lapses inside the reserve
	// horizon, so the gap is not read as if it were all spendable next week.
	ExpiringCredits float64             `json:"expiring_credits"`
	AccountsTotal   int                 `json:"accounts_total"`
	AccountsEnabled int                 `json:"accounts_enabled"`
	StaleCount      int                 `json:"stale_count"`
	BillingSince    int64               `json:"billing_since"`
	Realms          []WorkBuddyRealm    `json:"realms"`
	Purchases       []WorkBuddyPurchase `json:"-"`
}

var workBuddyFinanceMu sync.Mutex

func ReadWorkBuddyFinance(now time.Time) (*WorkBuddyFinance, error) {
	path := os.Getenv("WORKBUDDY_FINANCE_REPORT")
	if path == "" {
		return nil, errors.New("workbuddy finance report is unavailable")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, errors.New("workbuddy finance report is unavailable")
	}
	defer file.Close()
	body, err := io.ReadAll(io.LimitReader(file, 8<<20))
	if err != nil {
		return nil, errors.New("workbuddy finance report is unavailable")
	}
	// Purchases are input-only: the account card gets its money from the
	// booked ledger, not from this document.
	var input struct {
		WorkBuddyFinance
		Purchases []WorkBuddyPurchase `json:"purchases"`
	}
	if common.Unmarshal(body, &input) != nil {
		return nil, errors.New("invalid workbuddy finance report")
	}
	report := &input.WorkBuddyFinance
	report.Purchases = input.Purchases
	if report.Version != 1 || report.GeneratedAt > now.Unix()+60 || now.Unix()-report.GeneratedAt > 300 || report.FirstObservedAt <= 0 || report.FirstObservedAt > report.GeneratedAt {
		return nil, errors.New("invalid or stale workbuddy finance report")
	}
	if report.AccountsTotal <= 0 || report.AccountsEnabled < 0 || report.AccountsEnabled > report.AccountsTotal || report.StaleCount < 0 || report.StaleCount > report.AccountsTotal {
		return nil, errors.New("invalid workbuddy finance report")
	}
	if report.ObservedDays > 7 || report.WindowStart < 0 || report.BillingSince <= 0 || len(report.Purchases) > report.AccountsTotal {
		return nil, errors.New("invalid workbuddy finance report")
	}
	values := []float64{report.ObservedDays, report.Usage7d, report.Target3d, report.Balance, report.ExpiringCredits}
	for _, value := range values {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 || value > 1e12 {
			return nil, errors.New("invalid workbuddy finance report")
		}
	}
	if report.ExpiringCredits > report.Balance {
		return nil, errors.New("invalid workbuddy finance report")
	}
	unitCost, _ := strconv.ParseFloat(os.Getenv("WORKBUDDY_ACCOUNT_COST_CNY"), 64)
	seen := make(map[string]bool, len(report.Purchases))
	for _, purchase := range report.Purchases {
		if unitCost <= 0 || math.IsNaN(unitCost) || math.IsInf(unitCost, 0) || unitCost > 1e12 || purchase.PaidCNY != unitCost || purchase.PaidAt < report.BillingSince || purchase.PaidAt > now.Unix()+60 || len(purchase.Id) != 64 || seen[purchase.Id] {
			return nil, errors.New("invalid workbuddy purchase")
		}
		for _, character := range purchase.Id {
			if !strings.ContainsRune("0123456789abcdef", character) {
				return nil, errors.New("invalid workbuddy purchase")
			}
		}
		seen[purchase.Id] = true
	}
	return report, nil
}

// SyncWorkBuddyFinance books one pooled account per purchase and stores the
// credit reading. A hashed account id is the trade number, so a re-read books
// nothing twice.
func SyncWorkBuddyFinance(accountId int, now time.Time) error {
	workBuddyFinanceMu.Lock()
	defer workBuddyFinanceMu.Unlock()
	accounts, err := model.ListUpstreamAccounts()
	if err != nil {
		return err
	}
	primary := 0
	for _, account := range accounts {
		if account.Provider == model.UpstreamProviderWorkBuddy {
			primary = account.Id
			break
		}
	}
	if primary != accountId || primary == 0 {
		return errors.New("only one workbuddy funding account is supported")
	}
	report, err := ReadWorkBuddyFinance(now)
	if err != nil {
		return err
	}
	existing, err := model.ListUpstreamTopUps(accountId)
	if err != nil {
		return err
	}
	booked := make(map[string]bool, len(existing))
	for _, row := range existing {
		booked[row.TradeNo] = true
	}
	rows := make([]model.UpstreamTopUp, 0, len(report.Purchases))
	for _, purchase := range report.Purchases {
		if booked["workbuddy:"+purchase.Id] {
			continue
		}
		rows = append(rows, model.UpstreamTopUp{TradeNo: "workbuddy:" + purchase.Id, Paid: purchase.PaidCNY, Method: "WorkBuddy account", Status: "success", PaidAt: purchase.PaidAt})
	}
	if err := model.SyncUpstreamTopUps(accountId, "CNY", 1, rows); err != nil {
		return err
	}
	balance := math.Round(report.Balance*100) / 100
	if err := model.SaveUpstreamBalance(accountId, &balance, report.GeneratedAt, ""); err != nil {
		return err
	}
	start := report.WindowStart
	if start == 0 {
		start = max(report.FirstObservedAt, now.Add(-7*24*time.Hour).Unix())
	}
	usage := math.Round(report.Usage7d*100) / 100
	return model.SaveUpstreamUsage(accountId, usage, start, report.GeneratedAt, now.Unix(), model.UpstreamUsageStatusOK, "")
}

// The report path is host-configured, never supplied through a browser.
func SyncWorkBuddyFinanceLoop() {
	for {
		accounts, err := model.ListUpstreamAccounts()
		if err == nil {
			for _, account := range accounts {
				if account.Provider != model.UpstreamProviderWorkBuddy {
					continue
				}
				if err := SyncWorkBuddyFinance(account.Id, time.Now()); err != nil {
					common.SysError("WorkBuddy finance sync failed: " + err.Error())
				}
				break
			}
		}
		time.Sleep(time.Minute)
	}
}
