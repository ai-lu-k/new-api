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

// CommandCode reports contain only hashed member identities and numeric facts.
// The host collector reads the pool; the gateway never receives its API keys.
type CommandCodePlan struct {
	Plan      string  `json:"plan"`
	Count     int     `json:"count"`
	Enabled   int     `json:"enabled"`
	CostCNY   float64 `json:"cost_cny"`
	WeeklyCap float64 `json:"weekly_cap"`
	Available float64 `json:"available"`
}

type CommandCodePurchase struct {
	Id      string  `json:"id"`
	Plan    string  `json:"plan"`
	PaidCNY float64 `json:"paid_cny"`
	PaidAt  int64   `json:"paid_at"`
}

type CommandCodeFinance struct {
	Version             int                   `json:"version"`
	GeneratedAt         int64                 `json:"generated_at"`
	FirstObservedAt     int64                 `json:"first_observed_at"`
	ObservedDays        float64               `json:"observed_days"`
	Usage7d             float64               `json:"usage_7d"`
	UsageComplete       bool                  `json:"usage_complete"`
	UsageEstimated      bool                  `json:"usage_estimated"`
	WindowUsage         float64               `json:"window_usage"`
	Target3d            float64               `json:"target_3d"`
	TargetEstimated     bool                  `json:"target_estimated"`
	Balance             float64               `json:"balance"`
	WalletBalance       float64               `json:"wallet_balance"`
	UnknownCount        int                   `json:"unknown_count"`
	UnknownEnabledCount int                   `json:"unknown_enabled_count"`
	StaleCount          int                   `json:"stale_count"`
	Plans               []CommandCodePlan     `json:"plans"`
	Purchases           []CommandCodePurchase `json:"-"`
}

var commandCodeFinanceMu sync.Mutex

func ReadCommandCodeFinance(now time.Time) (*CommandCodeFinance, error) {
	path := os.Getenv("COMMANDCODE_FINANCE_REPORT")
	if path == "" {
		return nil, errors.New("commandcode finance report is unavailable")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, errors.New("commandcode finance report is unavailable")
	}
	defer file.Close()
	body, err := io.ReadAll(io.LimitReader(file, 8<<20))
	if err != nil {
		return nil, errors.New("commandcode finance report is unavailable")
	}
	// Purchases are input-only. They are omitted when this report is returned
	// from the root dashboard; the ordinary booking API exposes payment rows.
	var input struct {
		CommandCodeFinance
		Purchases []CommandCodePurchase `json:"purchases"`
	}
	if common.Unmarshal(body, &input) != nil {
		return nil, errors.New("invalid commandcode finance report")
	}
	report := &input.CommandCodeFinance
	report.Purchases = input.Purchases
	if report.Version != 1 || report.GeneratedAt > now.Unix()+60 || now.Unix()-report.GeneratedAt > 300 || report.FirstObservedAt <= 0 || report.FirstObservedAt > report.GeneratedAt || len(report.Plans) != 2 || len(report.Purchases) > 10000 {
		return nil, errors.New("invalid or stale commandcode finance report")
	}
	values := []float64{report.ObservedDays, report.Usage7d, report.WindowUsage, report.Target3d, report.Balance, report.WalletBalance}
	for _, plan := range report.Plans {
		if (plan.Plan != "go" && plan.Plan != "goat") || plan.Count < 0 || plan.Enabled < 0 || plan.Enabled > plan.Count {
			return nil, errors.New("invalid commandcode finance report")
		}
		values = append(values, plan.CostCNY, plan.WeeklyCap, plan.Available)
	}
	if report.Plans[0].Plan == report.Plans[1].Plan || report.ObservedDays > 7 || report.UnknownCount < 0 || report.StaleCount < 0 || report.UnknownEnabledCount < 0 || report.UnknownEnabledCount > report.UnknownCount {
		return nil, errors.New("invalid commandcode finance report")
	}
	goPrice, _ := strconv.ParseFloat(os.Getenv("COMMANDCODE_GO_COST_CNY"), 64)
	goatPrice, _ := strconv.ParseFloat(os.Getenv("COMMANDCODE_GOAT_COST_CNY"), 64)
	seen := make(map[string]bool, len(report.Purchases))
	for _, purchase := range report.Purchases {
		expected := 0.0
		switch purchase.Plan {
		case "go":
			expected = goPrice
		case "goat":
			expected = goatPrice
		}
		if expected <= 0 || math.IsNaN(expected) || math.IsInf(expected, 0) || expected > 1e12 || purchase.PaidCNY != expected || purchase.PaidAt <= 0 || purchase.PaidAt > now.Unix()+60 || len(purchase.Id) != 64 || strings.ContainsAny(purchase.Id, "\r\n") || seen[purchase.Id] {
			return nil, errors.New("invalid commandcode purchase")
		}
		for _, character := range purchase.Id {
			if !strings.ContainsRune("0123456789abcdef", character) {
				return nil, errors.New("invalid commandcode purchase")
			}
		}
		seen[purchase.Id] = true
	}
	for _, value := range values {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 || value > 1e12 {
			return nil, errors.New("invalid commandcode finance report")
		}
	}
	return report, nil
}

// SyncCommandCodeFinance uses the existing upstream purchase ledger. A stable
// credential hash is the trade number, so retries and key re-imports book once.
func SyncCommandCodeFinance(accountId int, now time.Time) error {
	commandCodeFinanceMu.Lock()
	defer commandCodeFinanceMu.Unlock()
	accounts, err := model.ListUpstreamAccounts()
	if err != nil {
		return err
	}
	primary := 0
	for _, account := range accounts {
		if account.Provider == model.UpstreamProviderCommandCode {
			primary = account.Id
			break
		}
	}
	if primary != accountId || primary == 0 {
		return errors.New("only one commandcode funding account is supported")
	}
	report, err := ReadCommandCodeFinance(now)
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
		if booked["commandcode:"+purchase.Id] {
			continue
		}
		rows = append(rows, model.UpstreamTopUp{TradeNo: "commandcode:" + purchase.Id, Paid: purchase.PaidCNY, Method: "CommandCode " + strings.ToUpper(purchase.Plan), Status: "success", PaidAt: purchase.PaidAt})
	}
	if err := model.SyncUpstreamTopUps(accountId, "CNY", 1, rows); err != nil {
		return err
	}
	if err := model.SaveUpstreamBalance(accountId, &report.Balance, report.GeneratedAt, ""); err != nil {
		return err
	}
	start := max(report.FirstObservedAt, now.Add(-7*24*time.Hour).Unix())
	return model.SaveUpstreamUsage(accountId, report.Usage7d, start, report.GeneratedAt, now.Unix(), model.UpstreamUsageStatusOK, "")
}

// The report path is host-configured, never supplied through a browser. Nothing
// is written until the operator adds the single CommandCode funding account.
func SyncCommandCodeFinanceLoop() {
	for {
		accounts, err := model.ListUpstreamAccounts()
		if err == nil {
			for _, account := range accounts {
				if account.Provider != model.UpstreamProviderCommandCode {
					continue
				}
				if err := SyncCommandCodeFinance(account.Id, time.Now()); err != nil {
					common.SysError("CommandCode finance sync failed: " + err.Error())
				}
				break
			}
		}
		time.Sleep(time.Minute)
	}
}
