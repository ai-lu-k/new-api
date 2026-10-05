package model

import (
	"encoding/json"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// Reasons an administrator gives when adding quota to a user by hand. A paid
// reason means money was received outside the site's own checkout, so the
// addition counts as a top-up; every other reason is a gift.
const (
	QuotaAddReasonOfflinePayment = "offline_payment"
	QuotaAddReasonGift           = "gift"
	QuotaAddReasonCompensation   = "compensation"
	QuotaAddReasonTest           = "test"
	QuotaAddReasonOther          = "other"
)

// AuditActionUserQuotaAdd is the action recorded for a manual quota addition.
const AuditActionUserQuotaAdd = "user.quota_add"

func IsQuotaAddReason(reason string) bool {
	switch reason {
	case QuotaAddReasonOfflinePayment, QuotaAddReasonGift, QuotaAddReasonCompensation,
		QuotaAddReasonTest, QuotaAddReasonOther:
		return true
	}
	return false
}

func IsPaidQuotaAddReason(reason string) bool {
	return reason == QuotaAddReasonOfflinePayment
}

// ManualQuotaAdd is one manual quota addition read back from the logs.
type ManualQuotaAdd struct {
	CreatedAt  int64
	Quota      int64
	Reason     string
	PaidAmount float64
}

// withoutUsers leaves the rows of the given accounts out of a query; the
// income summary uses it for the operator's own test accounts.
func withoutUsers(query *gorm.DB, column string, userIds []int) *gorm.DB {
	if len(userIds) == 0 {
		return query
	}
	return query.Where(column+" NOT IN ?", userIds)
}

// SumPaidTopUps returns the money received through the site's checkout for
// orders completed in [start, end). Orders paid from the wallet balance moved
// no money and are left out.
func SumPaidTopUps(start, end int64, excludedUserIds []int) (float64, error) {
	var total float64
	query := DB.Model(&TopUp{}).
		Where("status = ? AND payment_method <> ? AND complete_time >= ? AND complete_time < ?",
			common.TopUpStatusSuccess, PaymentMethodBalance, start, end)
	err := withoutUsers(query, "user_id", excludedUserIds).
		Select("COALESCE(SUM(money), 0)").Scan(&total).Error
	return total, err
}

// SumCheckinQuota returns the quota handed out by check-ins in [start, end).
func SumCheckinQuota(start, end int64, excludedUserIds []int) (int64, error) {
	var total int64
	query := DB.Model(&Checkin{}).
		Where("created_at >= ? AND created_at < ?", start, end)
	err := withoutUsers(query, "user_id", excludedUserIds).
		Select("COALESCE(SUM(quota_awarded), 0)").Scan(&total).Error
	return total, err
}

// SumRedeemedQuota returns the quota of redemption codes used in [start, end),
// codes deleted since then included.
func SumRedeemedQuota(start, end int64, excludedUserIds []int) (int64, error) {
	var total int64
	query := DB.Unscoped().Model(&Redemption{}).
		Where("status = ? AND redeemed_time >= ? AND redeemed_time < ?",
			common.RedemptionCodeStatusUsed, start, end)
	err := withoutUsers(query, "used_user_id", excludedUserIds).
		Select("COALESCE(SUM(quota), 0)").Scan(&total).Error
	return total, err
}

// ListManualQuotaAdds returns the manual quota additions logged in
// [start, end). An addition recorded before reasons existed has an empty
// reason.
func ListManualQuotaAdds(start, end int64, excludedUserIds []int) ([]ManualQuotaAdd, error) {
	var logs []Log
	query := LOG_DB.Model(&Log{}).
		Select("created_at", "other").
		Where("type = ? AND created_at >= ? AND created_at < ?", LogTypeTopup, start, end)
	err := withoutUsers(query, "user_id", excludedUserIds).
		Find(&logs).Error
	if err != nil {
		return nil, err
	}
	adds := make([]ManualQuotaAdd, 0, len(logs))
	for _, log := range logs {
		// Checkout and redemption logs carry no operation; skip them without
		// decoding.
		if !strings.Contains(log.Other, AuditActionUserQuotaAdd) {
			continue
		}
		var other AuditOther
		if err := common.UnmarshalJsonStr(log.Other, &other); err != nil || other.Op == nil ||
			other.Op.Action != AuditActionUserQuotaAdd {
			continue
		}
		add := ManualQuotaAdd{CreatedAt: log.CreatedAt}
		add.Quota = int64(auditNumber(other.Op.Params["quota"]))
		add.PaidAmount = auditNumber(other.Op.Params["paid_amount"])
		add.Reason = auditString(other.Op.Params["reason"])
		adds = append(adds, add)
	}
	return adds, nil
}

// Audit parameters come back from storage as raw JSON and are numbers or
// strings when they were just built in memory.
func auditNumber(value any) float64 {
	switch n := value.(type) {
	case json.RawMessage:
		var number float64
		if err := common.Unmarshal(n, &number); err != nil {
			return 0
		}
		return number
	case float64:
		return n
	case int:
		return float64(n)
	case int64:
		return float64(n)
	}
	return 0
}

func auditString(value any) string {
	switch text := value.(type) {
	case json.RawMessage:
		var decoded string
		if err := common.Unmarshal(text, &decoded); err != nil {
			return ""
		}
		return decoded
	case string:
		return text
	}
	return ""
}
