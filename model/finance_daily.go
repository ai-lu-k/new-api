package model

import (
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// financeDayLocation keeps the daily figures on the site's calendar day. The
// zone offset is fixed because China has no daylight saving time and the
// server may run in another zone.
var financeDayLocation = time.FixedZone("Asia/Shanghai", 8*60*60)

// DailyFinance is money in and out on one Asia/Shanghai calendar day, plus the
// quota given away that day and the part of the day's charges that gifted
// balance paid. Income is money received; gifts and gift spend are quota, not
// money.
type DailyFinance struct {
	Date        string  `json:"date"`
	OnlineTopUp float64 `json:"online_topup"`
	ManualTopUp float64 `json:"manual_topup"`
	Expenses    float64 `json:"expenses"`
	Gift        float64 `json:"gift"`
	// PlanFree is what the retired Token Plan allowance covered. It is history:
	// after the voucher cutover nothing settles free quota, so it stays zero.
	PlanFree float64 `json:"plan_free"`
	// GiftConsumed is the part of Consumption that came out of gifted balance.
	// It is only recorded from the day the ledger was introduced.
	GiftConsumed float64 `json:"gift_consumed"`
	// Consumption is what users were charged for settled requests that day.
	Consumption float64 `json:"consumption"`
	// NewUsers is how many ordinary accounts registered that day.
	NewUsers int `json:"new_users"`
}

// timestampedQuota is quota granted at one moment, for folding into days.
type timestampedQuota struct {
	Timestamp int64
	Quota     int64
}

// BuildFinanceDaily folds the money received and the ledger's expenses into
// Asia/Shanghai calendar days in [start, end). Every day of the range is
// returned, a day with nothing on it as zero.
//
// A ledger line without a payment date belongs to its month but not to a day,
// so it goes on the first day of that month. A range that starts later in the
// month puts it on the first day of the range instead, so the range never
// silently loses money the month did spend.
func BuildFinanceDaily(start, end int64, excludedUserIds []int, months []operation_setting.ExpenseMonth) ([]DailyFinance, error) {
	firstDay := financeDayStart(start)
	lastDay := financeDayStart(end - 1)
	dayCount := int(lastDay.Sub(firstDay)/(24*time.Hour)) + 1
	days := make([]DailyFinance, 0, dayCount)
	byDate := make(map[string]*DailyFinance, dayCount)
	for i := range dayCount {
		day := firstDay.AddDate(0, 0, i)
		days = append(days, DailyFinance{Date: day.Format("2006-01-02")})
	}
	for i := range days {
		byDate[days[i].Date] = &days[i]
	}

	payments, err := PaidTopUpsBetween(start, end, excludedUserIds)
	if err != nil {
		return nil, err
	}
	for _, payment := range payments {
		if day, ok := byDate[financeDayStart(payment.Timestamp).Format("2006-01-02")]; ok {
			day.OnlineTopUp += payment.Amount
		}
	}

	adds, err := ListManualQuotaAdds(start, end, excludedUserIds)
	if err != nil {
		return nil, err
	}
	giftQuota := make(map[string]int64)
	for _, add := range adds {
		date := financeDayStart(add.CreatedAt).Format("2006-01-02")
		if IsPaidQuotaAddReason(add.Reason) {
			if day, ok := byDate[date]; ok {
				day.ManualTopUp += add.PaidAmount
			}
			continue
		}
		giftQuota[date] += add.Quota
	}

	granted, err := quotaGrantedBetween(start, end, excludedUserIds)
	if err != nil {
		return nil, err
	}
	for _, grant := range granted {
		giftQuota[financeDayStart(grant.Timestamp).Format("2006-01-02")] += grant.Quota
	}
	for date, quota := range giftQuota {
		if day, ok := byDate[date]; ok {
			day.Gift += QuotaToMoney(quota)
		}
	}

	planFree, err := tokenPlanFreeBetween(start, end)
	if err != nil {
		return nil, err
	}
	for _, entry := range planFree {
		if day, ok := byDate[financeDayStart(entry.Timestamp).Format("2006-01-02")]; ok {
			day.PlanFree += QuotaToMoney(entry.Quota)
		}
	}

	giftSpent, err := GiftConsumedByDay(start, end)
	if err != nil {
		return nil, err
	}
	for date, quota := range giftSpent {
		if day, ok := byDate[date]; ok {
			day.GiftConsumed += QuotaToMoney(quota)
		}
	}

	charged, err := consumptionQuotaBetween(start, end)
	if err != nil {
		return nil, err
	}
	for _, entry := range charged {
		if day, ok := byDate[financeDayStart(entry.Timestamp).Format("2006-01-02")]; ok {
			day.Consumption += QuotaToMoney(entry.Quota)
		}
	}

	registrations, err := userRegistrationsBetween(start, end)
	if err != nil {
		return nil, err
	}
	for _, registeredAt := range registrations {
		if day, ok := byDate[financeDayStart(registeredAt).Format("2006-01-02")]; ok {
			day.NewUsers++
		}
	}

	upstream, err := UpstreamTopUpExpenseDays(start, end)
	if err != nil {
		return nil, err
	}
	for date, amount := range upstream {
		if day, ok := byDate[date]; ok {
			day.Expenses += amount
		}
	}

	for _, month := range months {
		monthStart, err := time.ParseInLocation("2006-01", month.Month, financeDayLocation)
		if err != nil || !monthStart.Before(lastDay.AddDate(0, 0, 1)) || !monthStart.AddDate(0, 1, 0).After(firstDay) {
			continue
		}
		firstOfMonth := monthStart.Format("2006-01-02")
		if monthStart.Before(firstDay) {
			firstOfMonth = days[0].Date
		}
		for _, item := range month.Items {
			date := item.Date
			if date == "" {
				date = firstOfMonth
			}
			if day, ok := byDate[date]; ok {
				day.Expenses += item.Amount
			}
		}
	}
	return days, nil
}

// quotaGrantedBetween returns every check-in, redemption code and event prize
// granted in [start, end), so the daily figures can show what was given away.
func quotaGrantedBetween(start, end int64, excludedUserIds []int) ([]timestampedQuota, error) {
	grants := make([]timestampedQuota, 0)

	var checkins []Checkin
	query := DB.Select("created_at", "quota_awarded").
		Where("created_at >= ? AND created_at < ?", start, end)
	if err := withoutUsers(query, "user_id", excludedUserIds).Find(&checkins).Error; err != nil {
		return nil, err
	}
	for _, checkin := range checkins {
		grants = append(grants, timestampedQuota{Timestamp: checkin.CreatedAt, Quota: int64(checkin.QuotaAwarded)})
	}

	var redemptions []Redemption
	query = DB.Unscoped().Select("redeemed_time", "quota").
		Where("status = ? AND redeemed_time >= ? AND redeemed_time < ?",
			common.RedemptionCodeStatusUsed, start, end)
	if err := withoutUsers(query, "used_user_id", excludedUserIds).Find(&redemptions).Error; err != nil {
		return nil, err
	}
	for _, redemption := range redemptions {
		grants = append(grants, timestampedQuota{Timestamp: redemption.RedeemedTime, Quota: int64(redemption.Quota)})
	}

	var awards []CampaignAward
	query = DB.Select("created_at", "quota").
		Where("created_at >= ? AND created_at < ?", start, end)
	if err := withoutUsers(query, "user_id", excludedUserIds).Find(&awards).Error; err != nil {
		return nil, err
	}
	for _, award := range awards {
		grants = append(grants, timestampedQuota{Timestamp: award.CreatedAt, Quota: int64(award.Quota)})
	}
	return grants, nil
}

// consumptionQuotaBetween returns the quota users were charged for settled
// requests in [start, end), one entry per request. Only the two columns the
// daily figures need are read, so a busy log table stays a single indexed scan
// without dialect-specific SQL.
func consumptionQuotaBetween(start, end int64) ([]timestampedQuota, error) {
	var rows []Log
	err := LOG_DB.Select("created_at", "quota").
		Where("type = ? AND created_at >= ? AND created_at < ?", LogTypeConsume, start, end).
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	charged := make([]timestampedQuota, 0, len(rows))
	for _, row := range rows {
		charged = append(charged, timestampedQuota{Timestamp: row.CreatedAt, Quota: int64(row.Quota)})
	}
	return charged, nil
}

// userRegistrationsBetween returns when ordinary accounts registered in
// [start, end). Administrators are not customer growth.
func userRegistrationsBetween(start, end int64) ([]int64, error) {
	var timestamps []int64
	err := DB.Model(&User{}).
		Where("created_at >= ? AND created_at < ? AND role < ?", start, end, common.RoleAdminUser).
		Pluck("created_at", &timestamps).Error
	if err != nil {
		return nil, err
	}
	return timestamps, nil
}

// tokenPlanFreeBetween returns the free quota settled on each request in
// [start, end). A settlement without a timestamp stays out: its day is unknown.
func tokenPlanFreeBetween(start, end int64) ([]timestampedQuota, error) {
	var rows []TokenPlanReservation
	err := DB.Select("settled_at", "free_used").
		Where("settled = ? AND settled_at >= ? AND settled_at < ?", true, start, end).
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	free := make([]timestampedQuota, 0, len(rows))
	for _, row := range rows {
		free = append(free, timestampedQuota{Timestamp: row.SettledAt, Quota: row.FreeUsed})
	}
	return free, nil
}

func financeDayStart(timestamp int64) time.Time {
	local := time.Unix(timestamp, 0).In(financeDayLocation)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, financeDayLocation)
}
