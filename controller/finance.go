package controller

import (
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
)

const (
	financeDefaultMonths = 12
	financeMaxMonths     = 36
)

// financeMonth is one calendar month of money in and out. Top-ups are money
// received; gifts are quota given away, at its face value; expenses are what
// the expense ledger publishes for the month.
type financeMonth struct {
	Month          string  `json:"month"`
	OnlineTopUp    float64 `json:"online_topup"`
	ManualTopUp    float64 `json:"manual_topup"`
	GiftManual     float64 `json:"gift_manual"`
	GiftCheckin    float64 `json:"gift_checkin"`
	GiftRedemption float64 `json:"gift_redemption"`
	Expenses       float64 `json:"expenses"`
}

// GetFinanceSummary returns the last months of top-ups, gifts and expenses,
// newest first. Root only.
func GetFinanceSummary(c *gin.Context) {
	count, err := strconv.Atoi(c.DefaultQuery("months", strconv.Itoa(financeDefaultMonths)))
	if err != nil || count < 1 {
		count = financeDefaultMonths
	}
	if count > financeMaxMonths {
		count = financeMaxMonths
	}
	excluded := operation_setting.GetFinanceExcludedUserIds()
	months, err := buildFinanceSummary(time.Now(), count, excluded)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{
		"months":         months,
		"excluded_users": len(excluded),
	}})
}

// buildFinanceSummary leaves the excluded accounts, the operator's own test
// accounts for one, out of every figure.
func buildFinanceSummary(now time.Time, count int, excluded []int) ([]financeMonth, error) {
	expenses := make(map[string]float64)
	for _, month := range operation_setting.GetPublishedExpenseMonths(now) {
		for _, item := range month.Items {
			expenses[month.Month] += item.Amount
		}
	}

	first := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	months := make([]financeMonth, 0, count)
	for i := 0; i < count; i++ {
		start := first.AddDate(0, -i, 0)
		from, to := start.Unix(), start.AddDate(0, 1, 0).Unix()
		entry := financeMonth{Month: start.Format("2006-01")}

		online, err := model.SumPaidTopUps(from, to, excluded)
		if err != nil {
			return nil, err
		}
		checkin, err := model.SumCheckinQuota(from, to, excluded)
		if err != nil {
			return nil, err
		}
		redeemed, err := model.SumRedeemedQuota(from, to, excluded)
		if err != nil {
			return nil, err
		}
		adds, err := model.ListManualQuotaAdds(from, to, excluded)
		if err != nil {
			return nil, err
		}
		var manualPaid, manualGift float64
		for _, add := range adds {
			// Money was received for a paid reason; anything else, additions
			// from before reasons existed included, was given away.
			if model.IsPaidQuotaAddReason(add.Reason) {
				manualPaid += add.PaidAmount
			} else {
				manualGift += float64(add.Quota) / common.QuotaPerUnit
			}
		}

		entry.OnlineTopUp = roundCents(online)
		entry.ManualTopUp = roundCents(manualPaid)
		entry.GiftManual = roundCents(manualGift)
		entry.GiftCheckin = roundCents(float64(checkin) / common.QuotaPerUnit)
		entry.GiftRedemption = roundCents(float64(redeemed) / common.QuotaPerUnit)
		entry.Expenses = roundCents(expenses[entry.Month])
		months = append(months, entry)
	}
	return months, nil
}

func roundCents(value float64) float64 {
	return math.Round(value*100) / 100
}
