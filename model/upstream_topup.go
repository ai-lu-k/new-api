package model

import (
	"errors"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// UpstreamTopUpMethodRedeem marks a payment a provider only records as a spent
// redemption code. Such a provider sells nothing else, so a used code is a
// completed purchase.
const UpstreamTopUpMethodRedeem = "redeem"

// UpstreamTopUp is one payment a new-api gateway recorded for the bound
// account. Paid is in the account's own currency; Rate is the CNY value of one
// unit, so the expense the site books is Paid*Rate. A trade number identifies
// the payment, so syncing again never books it twice.
type UpstreamTopUp struct {
	Id        int     `json:"id"`
	AccountId int     `json:"account_id" gorm:"not null;uniqueIndex:idx_upstream_topup_trade"`
	TradeNo   string  `json:"trade_no" gorm:"type:varchar(191);not null;uniqueIndex:idx_upstream_topup_trade"`
	Paid      float64 `json:"paid" gorm:"not null;default:0"`
	Currency  string  `json:"currency" gorm:"type:varchar(8);not null;default:''"`
	Rate      float64 `json:"rate" gorm:"not null;default:1"`
	Method    string  `json:"method" gorm:"type:varchar(32);not null;default:''"`
	Status    string  `json:"status" gorm:"type:varchar(16);not null;default:''"`
	// PaidAt is when the payment completed (or was created, when the gateway
	// never reported completion), in Unix seconds.
	PaidAt    int64 `json:"paid_at" gorm:"bigint;not null;default:0"`
	FetchedAt int64 `json:"fetched_at" gorm:"bigint;not null;default:0"`
}

func (UpstreamTopUp) TableName() string {
	return "upstream_topups"
}

// UpstreamTopUpSummary is what the account card shows about its payments.
type UpstreamTopUpSummary struct {
	Count     int64   `json:"count"`
	Total     float64 `json:"total"`
	CheckedAt int64   `json:"checked_at"`
}

// SyncUpstreamTopUps stores the payment history a gateway returned. The
// account's current currency and rate are written onto every row, so fixing a
// wrong rate corrects the booked expenses on the next sync instead of leaving
// old rows on a rate nobody can find.
func SyncUpstreamTopUps(accountId int, currency string, rate float64, rows []UpstreamTopUp) error {
	fetchedAt := common.GetTimestamp()
	return DB.Transaction(func(tx *gorm.DB) error {
		for _, row := range rows {
			if row.TradeNo == "" {
				continue
			}
			values := map[string]any{
				"paid":       row.Paid,
				"currency":   currency,
				"rate":       rate,
				"method":     row.Method,
				"status":     row.Status,
				"paid_at":    row.PaidAt,
				"fetched_at": fetchedAt,
			}
			var existing UpstreamTopUp
			err := tx.Where("account_id = ? AND trade_no = ?", accountId, row.TradeNo).First(&existing).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				created := row
				created.AccountId = accountId
				created.Currency = currency
				created.Rate = rate
				created.FetchedAt = fetchedAt
				if err := tx.Create(&created).Error; err != nil {
					return err
				}
				continue
			}
			if err != nil {
				return err
			}
			if err := tx.Model(&UpstreamTopUp{}).Where("id = ?", existing.Id).Updates(values).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// ListUpstreamTopUps returns one account's payment history, newest first.
// ListSuccessfulUpstreamTopUps returns the payments booked as expenses,
// newest first, across every account.
func ListSuccessfulUpstreamTopUps() ([]UpstreamTopUp, error) {
	var topUps []UpstreamTopUp
	// A pushed payment is either reported successful or, on a provider that
	// only sells redemption codes, a code that was spent.
	err := DB.Where("LOWER(status) = ? OR (LOWER(method) = ? AND LOWER(status) = ?)", "success", UpstreamTopUpMethodRedeem, "used").
		Order("paid_at DESC, id DESC").
		Find(&topUps).Error
	return topUps, err
}

func ListUpstreamTopUps(accountId int) ([]UpstreamTopUp, error) {
	var rows []UpstreamTopUp
	err := DB.Where("account_id = ?", accountId).Order("paid_at DESC, id DESC").Find(&rows).Error
	return rows, err
}

// UpstreamTopUpSummaryOf totals one account's successful payments in CNY.
func UpstreamTopUpSummaryOf(accountId int) (UpstreamTopUpSummary, error) {
	var rows []UpstreamTopUp
	err := DB.Select("paid", "rate", "status", "method", "fetched_at").Where("account_id = ?", accountId).Find(&rows).Error
	if err != nil {
		return UpstreamTopUpSummary{}, err
	}
	summary := UpstreamTopUpSummary{}
	for _, row := range rows {
		if row.FetchedAt > summary.CheckedAt {
			summary.CheckedAt = row.FetchedAt
		}
		if !isSuccessfulTopUp(row) {
			continue
		}
		summary.Count++
		summary.Total += row.Paid * row.Rate
	}
	return summary, nil
}

// UpstreamTopUpExpenseMonths is the CNY the site paid upstream, by
// Asia/Shanghai month.
func UpstreamTopUpExpenseMonths() (map[string]float64, error) {
	amounts, err := successfulTopUpAmounts()
	if err != nil {
		return nil, err
	}
	months := make(map[string]float64)
	for _, amount := range amounts {
		month := time.Unix(amount.paidAt, 0).In(financeDayLocation).Format("2006-01")
		months[month] += amount.cny
	}
	return months, nil
}

// UpstreamTopUpExpenseDays is the same money folded into Shanghai days.
func UpstreamTopUpExpenseDays(start, end int64) (map[string]float64, error) {
	amounts, err := successfulTopUpAmounts()
	if err != nil {
		return nil, err
	}
	days := make(map[string]float64)
	for _, amount := range amounts {
		if amount.paidAt < start || amount.paidAt >= end {
			continue
		}
		day := time.Unix(amount.paidAt, 0).In(financeDayLocation).Format("2006-01-02")
		days[day] += amount.cny
	}
	return days, nil
}

type topUpAmount struct {
	paidAt int64
	cny    float64
}

func successfulTopUpAmounts() ([]topUpAmount, error) {
	var rows []UpstreamTopUp
	if err := DB.Select("paid", "rate", "status", "method", "paid_at").Find(&rows).Error; err != nil {
		return nil, err
	}
	amounts := make([]topUpAmount, 0, len(rows))
	for _, row := range rows {
		if !isSuccessfulTopUp(row) {
			continue
		}
		amounts = append(amounts, topUpAmount{paidAt: row.PaidAt, cny: row.Paid * row.Rate})
	}
	return amounts, nil
}

func isSuccessfulTopUp(row UpstreamTopUp) bool {
	if strings.EqualFold(row.Status, "success") {
		return true
	}
	// A redemption code becomes a payment once the provider marks it used: the
	// credit only lands in the wallet after the code is spent, and an unspent
	// code is not money spent yet.
	return strings.EqualFold(row.Method, UpstreamTopUpMethodRedeem) && strings.EqualFold(row.Status, "used")
}
