package model

import (
	"slices"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"gorm.io/gorm"
)

// QuotaToMoney converts internal quota units into the display currency the
// finance pages use (CNY at the configured USD exchange rate).
func QuotaToMoney(quota int64) float64 {
	return float64(quota) / common.QuotaPerUnit * operation_setting.USDExchangeRate
}

func roundMoney(value float64) float64 {
	return float64(int64(value*100+0.5)) / 100
}

// WalletSourceSummary is the ordinary users' wallet split: what they paid for
// and what they were given. The two always add up to the balance.
type WalletSourceSummary struct {
	Users   int64   `json:"users"`
	Balance float64 `json:"balance"`
	Paid    float64 `json:"paid"`
	Gift    float64 `json:"gift"`
	AsOf    int64   `json:"as_of"`
}

// WalletSourceUser is one ordinary account's split, for the detail view.
type WalletSourceUser struct {
	Id          int     `json:"id"`
	Username    string  `json:"username"`
	DisplayName string  `json:"display_name"`
	Status      int     `json:"status"`
	Balance     float64 `json:"balance"`
	Paid        float64 `json:"paid"`
	Gift        float64 `json:"gift"`
}

// BuildWalletSources splits each ordinary user's wallet. Money is spent from
// paid balance first, so what is left of the paid side is the smaller of the
// bought and the current balance. Everything else in the wallet is gift:
// check-ins, codes, event prizes, manual additions without an offline payment,
// and quota no record explains at all. Only money received is ever called
// paid, and the three figures always add up to the balance.
func BuildWalletSources() (WalletSourceSummary, []WalletSourceUser, error) {
	excluded := operation_setting.GetFinanceExcludedUserIds()
	var users []User
	query := DB.Select("id", "username", "display_name", "status", "quota", "used_quota").
		Where("role < ?", common.RoleAdminUser)
	if err := withoutUsers(query, "id", excluded).Order("id ASC").Find(&users).Error; err != nil {
		return WalletSourceSummary{}, nil, err
	}

	paid, err := paidQuotaByUser(quotaSourceScope{excluded: excluded})
	if err != nil {
		return WalletSourceSummary{}, nil, err
	}
	summary := WalletSourceSummary{AsOf: common.GetTimestamp()}
	rows := make([]WalletSourceUser, 0, len(users))
	for _, user := range users {
		balance := max(int64(user.Quota), 0)
		// Paid money is spent first, so no more of it can remain than the
		// wallet holds.
		paidLeft := min(max(paid[user.Id]-int64(user.UsedQuota), 0), balance)
		giftLeft := balance - paidLeft

		row := WalletSourceUser{
			Id:          user.Id,
			Username:    user.Username,
			DisplayName: user.DisplayName,
			Status:      user.Status,
			Balance:     roundMoney(QuotaToMoney(balance)),
			Paid:        roundMoney(QuotaToMoney(paidLeft)),
			Gift:        roundMoney(QuotaToMoney(giftLeft)),
		}
		summary.Users++
		summary.Balance = roundMoney(summary.Balance + row.Balance)
		summary.Paid = roundMoney(summary.Paid + row.Paid)
		summary.Gift = roundMoney(summary.Gift + row.Gift)
		rows = append(rows, row)
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].Balance != rows[j].Balance {
			return rows[i].Balance > rows[j].Balance
		}
		return rows[i].Id < rows[j].Id
	})
	return summary, rows, nil
}

type userQuotaTotal struct {
	UserId int
	Quota  int64
}

// quotaSourceScope selects which accounts a funding aggregate covers. The
// finance report excludes configured accounts from the whole set, while the
// user list asks about the accounts on the page (or, for a derived sort, every
// matching account). userIds is nil for "every account"; it is never an empty
// slice, because callers return early instead of asking about nothing.
type quotaSourceScope struct {
	userIds  []int
	excluded []int
}

func (scope quotaSourceScope) filter(query *gorm.DB, column string) *gorm.DB {
	if scope.userIds != nil {
		query = query.Where(column+" IN ?", scope.userIds)
	}
	return withoutUsers(query, column, scope.excluded)
}

func (scope quotaSourceScope) covers(userId int) bool {
	return scope.userIds == nil || slices.Contains(scope.userIds, userId)
}

// topUpPaidTotal is one account's successful orders per provider, before they
// are turned into the quota they bought.
type topUpPaidTotal struct {
	UserId   int
	Provider string
	Amount   int64
	Money    float64
}

// paidQuotaByUser sums the quota each account bought. An order stores what was
// paid, not the quota it bought: Stripe keeps the converted amount in Money,
// Creem already stores quota in Amount, and every other provider keeps the
// amount of dollars in Amount. Reading a single column raw made every paid
// balance look spent, which pushed the rest of each wallet into the unverified
// total.
func paidQuotaByUser(scope quotaSourceScope) (map[int]int64, error) {
	paid := make(map[int]int64)
	var orders []topUpPaidTotal
	query := DB.Model(&TopUp{}).
		Select("user_id, payment_provider AS provider, COALESCE(SUM(amount), 0) AS amount, COALESCE(SUM(money), 0) AS money").
		Where("status = ? AND payment_method <> ?", common.TopUpStatusSuccess, PaymentMethodBalance).
		Group("user_id, payment_provider")
	if err := scope.filter(query, "user_id").Scan(&orders).Error; err != nil {
		return nil, err
	}
	for _, order := range orders {
		switch order.Provider {
		case PaymentProviderStripe:
			paid[order.UserId] += int64(order.Money * common.QuotaPerUnit)
		case PaymentProviderCreem:
			paid[order.UserId] += order.Amount
		default:
			paid[order.UserId] += int64(float64(order.Amount) * common.QuotaPerUnit)
		}
	}
	adds, err := ListManualQuotaAdds(0, common.GetTimestamp(), scope.excluded)
	if err != nil {
		return nil, err
	}
	for _, add := range adds {
		if scope.covers(add.UserId) && add.Reason == QuotaAddReasonOfflinePayment {
			paid[add.UserId] += add.Quota
		}
	}
	return paid, nil
}

func giftQuotaByUser(scope quotaSourceScope) (map[int]int64, error) {
	gift := make(map[int]int64)
	var checkins []userQuotaTotal
	query := DB.Model(&Checkin{}).Select("user_id, COALESCE(SUM(quota_awarded), 0) AS quota").Group("user_id")
	if err := scope.filter(query, "user_id").Scan(&checkins).Error; err != nil {
		return nil, err
	}
	for _, row := range checkins {
		gift[row.UserId] += row.Quota
	}
	var redemptions []userQuotaTotal
	query = DB.Unscoped().Model(&Redemption{}).
		Select("used_user_id AS user_id, COALESCE(SUM(quota), 0) AS quota").
		Where("status = ?", common.RedemptionCodeStatusUsed).
		Group("used_user_id")
	if err := scope.filter(query, "used_user_id").Scan(&redemptions).Error; err != nil {
		return nil, err
	}
	for _, row := range redemptions {
		gift[row.UserId] += row.Quota
	}
	// Event prizes are given away, never paid for, so they belong to the gift
	// side here as they already do in the income report.
	var eventAwards []userQuotaTotal
	query = DB.Model(&CampaignAward{}).
		Select("user_id, COALESCE(SUM(quota), 0) AS quota").
		Group("user_id")
	if err := scope.filter(query, "user_id").Scan(&eventAwards).Error; err != nil {
		return nil, err
	}
	for _, row := range eventAwards {
		gift[row.UserId] += row.Quota
	}
	adds, err := ListManualQuotaAdds(0, common.GetTimestamp(), scope.excluded)
	if err != nil {
		return nil, err
	}
	for _, add := range adds {
		// Only a recorded offline payment was money received. Everything else
		// added by hand is a gift, including an addition recorded before
		// reasons existed.
		if scope.covers(add.UserId) && !IsPaidQuotaAddReason(add.Reason) {
			gift[add.UserId] += add.Quota
		}
	}
	return gift, nil
}

// FinanceConsumption is the settled user consumption of a period, split into
// the part Token Plan covered for free, the part gifted balance paid, and the
// rest, which the user's own money paid.
type FinanceConsumption struct {
	Total    float64 `json:"total"`
	PlanFree float64 `json:"plan_free"`
	// GiftConsumed is part of Wallet: gifted balance is spent through the same
	// wallet, it is only marked so it never buys usage levels.
	GiftConsumed float64 `json:"gift_consumed"`
	Wallet       float64 `json:"wallet"`
	Start        int64   `json:"start"`
	End          int64   `json:"end"`
}

// FinanceConsumptionBetween sums settled consumption in [start, end). The
// amount is what users were charged, never an estimate of upstream cost.
func FinanceConsumptionBetween(start, end int64) (FinanceConsumption, error) {
	var total int64
	err := LOG_DB.Model(&Log{}).
		Where("type = ? AND created_at >= ? AND created_at < ?", LogTypeConsume, start, end).
		Select("COALESCE(SUM(quota), 0)").Scan(&total).Error
	if err != nil {
		return FinanceConsumption{}, err
	}
	var planFree int64
	err = DB.Model(&TokenPlanReservation{}).
		Where("settled = ? AND settled_at >= ? AND settled_at < ?", true, start, end).
		Select("COALESCE(SUM(free_used), 0)").Scan(&planFree).Error
	if err != nil {
		return FinanceConsumption{}, err
	}
	giftConsumed, err := GiftConsumedBetween(start, end)
	if err != nil {
		return FinanceConsumption{}, err
	}
	wallet := max(total-planFree, 0)
	return FinanceConsumption{
		Total:        roundMoney(QuotaToMoney(total)),
		PlanFree:     roundMoney(QuotaToMoney(planFree)),
		GiftConsumed: roundMoney(QuotaToMoney(giftConsumed)),
		Wallet:       roundMoney(QuotaToMoney(wallet)),
		Start:        start,
		End:          end,
	}, nil
}

// SearchWalletSourceUsers keeps the rows whose name or id matches a search
// term, so the detail view can page without a second database pass.
func SearchWalletSourceUsers(rows []WalletSourceUser, search string) []WalletSourceUser {
	search = strings.ToLower(strings.TrimSpace(search))
	if search == "" {
		return rows
	}
	matched := make([]WalletSourceUser, 0, len(rows))
	for _, row := range rows {
		if strings.Contains(strings.ToLower(row.Username), search) ||
			strings.Contains(strings.ToLower(row.DisplayName), search) ||
			strings.Contains(strconv.Itoa(row.Id), search) {
			matched = append(matched, row)
		}
	}
	return matched
}
