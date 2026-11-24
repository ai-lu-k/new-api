package model

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
)

// TokenPlanUserUsage deliberately contains no token IDs, keys or ciphertext.
// Quotas are internal balance units, as in the personal Token Plan status.
type TokenPlanUserUsage struct {
	UserId          int    `json:"user_id"`
	Username        string `json:"username"`
	DisplayName     string `json:"display_name"`
	Status          int    `json:"status"`
	Activated       bool   `json:"activated"`
	WalletFallback  bool   `json:"wallet_fallback"`
	Level           int    `json:"level"`
	BaseQuota       int64  `json:"base_quota"`
	Multiplier      int    `json:"multiplier"`
	TotalQuota      int64  `json:"total_quota"`
	UsedQuota       int64  `json:"used_quota"`
	ReservedQuota   int64  `json:"reserved_quota"`
	RemainingQuota  int64  `json:"remaining_quota"`
	WalletUsedQuota int64  `json:"wallet_used_quota"`
	WeekStart       int64  `json:"week_start"`
	ResetsAt        int64  `json:"resets_at"`
	PersonalCycle   bool   `json:"personal_cycle"`
	CouponCycle     bool   `json:"coupon_cycle"`
}

type tokenPlanUsageSnapshot struct {
	TokenPlanUserUsage `gorm:"embedded"`
	// LifetimeLevelQuota is users.level_quota: paid consumption only, which is
	// what the plan allowance is derived from.
	LifetimeLevelQuota int
}

func (row *tokenPlanUsageSnapshot) calculate(thresholds [7]int) error {
	row.Level = CalculateUsageLevel(row.LifetimeLevelQuota, thresholds).Level
	var err error
	row.BaseQuota, err = TokenPlanQuota(row.Level)
	if err != nil {
		return err
	}
	row.Multiplier = max(1, row.Multiplier)
	row.TotalQuota, err = tokenPlanCycleQuota(row.Level, row.Multiplier)
	row.RemainingQuota = max(0, row.TotalQuota-row.UsedQuota)
	return err
}

// Resolve the same ledger as currentTokenPlanWeek without creating or updating
// anything. The joins are bounded per user by the account/week unique indexes.
func tokenPlanUsageQuery(db *gorm.DB, now time.Time, userIds []int) *gorm.DB {
	tables := make([]string, 3)
	for i, name := range []string{"User", "TokenPlanAccount", "TokenPlanWeek"} {
		var quoted strings.Builder
		db.Dialector.QuoteTo(&quoted, db.NamingStrategy.TableName(name))
		tables[i] = quoted.String()
	}
	calendar := TokenPlanWeekStart(now).Unix()
	// Modulo avoids dialect-specific integer division/rounding. A personal
	// anchor is never in the future; the active coupon join takes precedence.
	start := "CASE WHEN a.cycle_anchor > 0 THEN a.cycle_anchor + (? - a.cycle_anchor) - ((? - a.cycle_anchor) % 604800) ELSE ? END"
	wallet := db.Model(&TokenPlanReservation{}).Select("user_id, week_id, SUM(wallet_used) AS wallet_used").Where("settled = ?", true).Group("user_id, week_id")
	if userIds != nil {
		wallet = wallet.Where("user_id IN ?", userIds)
	}
	query := db.Table(tables[0]+" AS u").
		Joins("LEFT JOIN "+tables[1]+" AS a ON a.user_id = u.id").
		Joins("LEFT JOIN "+tables[2]+" AS c ON c.id = a.current_week_id AND c.user_id = u.id AND a.cycle_anchor > 0 AND c.cycle_end > ?", now.Unix()).
		Joins("LEFT JOIN "+tables[2]+" AS w ON w.user_id = u.id AND c.id IS NULL AND w.week_start = "+start, now.Unix(), now.Unix(), calendar).
		Joins("LEFT JOIN (?) AS r ON r.user_id = u.id AND r.week_id = COALESCE(c.id, w.id)", wallet).
		Where("u.deleted_at IS NULL").
		Select(`u.id AS user_id, u.username, u.display_name, u.status, u.level_quota AS lifetime_level_quota,
   CASE WHEN a.id IS NULL THEN 0 ELSE 1 END AS activated,
   COALESCE(a.wallet_fallback, FALSE) AS wallet_fallback,
   CASE WHEN a.cycle_anchor > 0 THEN 1 ELSE 0 END AS personal_cycle,
   CASE WHEN c.week_start < 0 THEN 1 ELSE 0 END AS coupon_cycle,
   COALESCE(c.multiplier, w.multiplier, 1) AS multiplier,
   COALESCE(c.used_quota, w.used_quota, 0) AS used_quota,
   COALESCE(c.reserved_quota, w.reserved_quota, 0) AS reserved_quota,
   COALESCE(r.wallet_used, 0) AS wallet_used_quota,
   COALESCE(c.cycle_start, w.week_start, `+start+`) AS week_start,
   COALESCE(c.cycle_end, w.week_start + 604800, (`+start+`) + 604800) AS resets_at`,
			now.Unix(), now.Unix(), calendar, now.Unix(), now.Unix(), calendar)
	if userIds != nil {
		query = query.Where("u.id IN ?", userIds)
	}
	return query
}

type TokenPlanOverview struct {
	Users           int64 `json:"users"`
	ActivatedUsers  int64 `json:"activated_users"`
	TotalQuota      int64 `json:"total_quota"`
	UsedQuota       int64 `json:"used_quota"`
	ReservedQuota   int64 `json:"reserved_quota"`
	RemainingQuota  int64 `json:"remaining_quota"`
	WalletUsedQuota int64 `json:"wallet_used_quota"`
	AsOf            int64 `json:"as_of"`
}

func GetTokenPlanOverview(ctx context.Context, now time.Time) (*TokenPlanOverview, error) {
	db := DB.WithContext(ctx)
	rows, err := tokenPlanUsageQuery(db, now, nil).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := &TokenPlanOverview{AsOf: now.Unix()}
	thresholds := operation_setting.GetUsageLevelThresholds()
	// Stream a single joined result instead of loading every user or issuing a
	// state query per account. Summation includes disabled, non-deleted users.
	for rows.Next() {
		var row tokenPlanUsageSnapshot
		if err := db.ScanRows(rows, &row); err != nil {
			return nil, err
		}
		if err := row.calculate(thresholds); err != nil {
			return nil, err
		}
		result.Users++
		if row.Activated {
			result.ActivatedUsers++
		}
		result.TotalQuota += row.TotalQuota
		result.UsedQuota += row.UsedQuota
		result.ReservedQuota += row.ReservedQuota
		result.RemainingQuota += row.RemainingQuota
		result.WalletUsedQuota += row.WalletUsedQuota
	}
	return result, rows.Err()
}

// ListTokenPlanUsers pages the account snapshot. minLevel filters by the same
// cumulative usage thresholds that produce the displayed level, so a minimum of
// 1 excludes accounts that never used any quota while the total stays exact.
func ListTokenPlanUsers(ctx context.Context, search string, minLevel, offset, limit int, now time.Time) ([]TokenPlanUserUsage, int64, error) {
	db := DB.WithContext(ctx)
	query := db.Model(&User{})
	thresholds := operation_setting.GetUsageLevelThresholds()
	if minLevel > 0 {
		query = query.Where("level_quota >= ?", thresholds[min(minLevel, len(thresholds)-1)])
	}
	search = strings.TrimSpace(search)
	if search != "" {
		if id, err := strconv.Atoi(search); err == nil && id > 0 {
			query = query.Where("id = ? OR username LIKE ?", id, "%"+search+"%")
		} else {
			query = query.Where("username LIKE ?", "%"+search+"%")
		}
	}
	var count int64
	if err := query.Count(&count).Error; err != nil {
		return nil, 0, err
	}
	var userIds []int
	if err := query.Order("id DESC").Offset(max(0, offset)).Limit(min(100, max(1, limit))).Pluck("id", &userIds).Error; err != nil {
		return nil, 0, err
	}
	if len(userIds) == 0 {
		return []TokenPlanUserUsage{}, count, nil
	}
	var raw []tokenPlanUsageSnapshot
	// Restrict the reservation aggregation to this page's users as well.
	err := tokenPlanUsageQuery(db, now, userIds).Order("u.id DESC").Scan(&raw).Error
	if err != nil {
		return nil, 0, err
	}
	result := make([]TokenPlanUserUsage, 0, len(raw))
	for i := range raw {
		if err := raw[i].calculate(thresholds); err != nil {
			return nil, 0, err
		}
		result = append(result, raw[i].TokenPlanUserUsage)
	}
	return result, count, nil
}

type TokenPlanUsageTotals struct {
	Requests   int64 `json:"requests"`
	FreeUsed   int64 `json:"free_used"`
	WalletUsed int64 `json:"wallet_used"`
}
type TokenPlanUsageDay struct {
	Date       string `json:"date"`
	Requests   int64  `json:"requests"`
	FreeUsed   *int64 `json:"free_used"`
	WalletUsed *int64 `json:"wallet_used"`
}
type TokenPlanUsageTrend struct {
	Days    []TokenPlanUsageDay  `json:"days"`
	Total   TokenPlanUsageTotals `json:"total"`
	Undated TokenPlanUsageTotals `json:"undated"`
}

// Daily net amounts stay on the FIRST settlement day, even after later
// corrections/refunds. Legacy settled reservations have no trustworthy date.
// A day without dated facts is null, never an invented zero. This data lives
// in the primary ledger and is independent of consume-log retention/storage.
func GetTokenPlanUsageTrend(ctx context.Context, start, end time.Time, userId int) (*TokenPlanUsageTrend, error) {
	if start.Unix() <= 0 || !start.Before(end) || end.Sub(start) > 93*24*time.Hour || userId < 0 {
		return nil, errors.New("invalid Token Plan statistics range")
	}
	result := &TokenPlanUsageTrend{Days: make([]TokenPlanUsageDay, 0)}
	query := DB.WithContext(ctx).Model(&TokenPlanReservation{}).Where("settled = ?", true)
	if userId > 0 {
		query = query.Where("user_id = ?", userId)
	}
	var daily []struct {
		DayStart             int64
		TokenPlanUsageTotals `gorm:"embedded"`
	}
	// All supported engines implement integer modulo identically for these
	// positive timestamps. Day boundaries are always Asia/Shanghai (UTC+8).
	const dayBucket = "settled_at - ((settled_at + 28800) % 86400)"
	err := query.Session(&gorm.Session{}).Where("settled_at >= ? AND settled_at < ?", start.Unix(), end.Unix()).
		Select(dayBucket + " AS day_start, COUNT(*) AS requests, COALESCE(SUM(free_used),0) AS free_used, COALESCE(SUM(wallet_used),0) AS wallet_used").Group(dayBucket).Scan(&daily).Error
	if err != nil {
		return nil, err
	}
	byDay := make(map[int64]TokenPlanUsageTotals, len(daily))
	for _, row := range daily {
		byDay[row.DayStart] = row.TokenPlanUsageTotals
		result.Total.Requests += row.Requests
		result.Total.FreeUsed += row.FreeUsed
		result.Total.WalletUsed += row.WalletUsed
	}
	for date := start; date.Before(end); date = date.AddDate(0, 0, 1) {
		row := TokenPlanUsageDay{Date: date.Format(time.DateOnly)}
		if totals, ok := byDay[date.Unix()]; ok {
			row.Requests, row.FreeUsed, row.WalletUsed = totals.Requests, &totals.FreeUsed, &totals.WalletUsed
		}
		result.Days = append(result.Days, row)
	}
	err = query.Where("settled_at = ?", 0).Select("COUNT(*) AS requests, COALESCE(SUM(free_used),0) AS free_used, COALESCE(SUM(wallet_used),0) AS wallet_used").Scan(&result.Undated).Error
	return result, err
}
