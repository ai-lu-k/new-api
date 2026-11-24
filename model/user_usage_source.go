package model

import (
	"cmp"
	"errors"
	"slices"

	"gorm.io/gorm"
)

// UserUsageSource is one account's lifetime consumption split by what paid for
// it. TokenPlanUsed is the part the Token Plan allowance covered for free and is
// therefore already inside the account's total used quota; GiftUsed is the part
// the account's own wallet paid for with quota that was given to it.
// GiftPlanUsed is simply those two free sources added up.
//
// GiftUsed and GiftRemaining are read from the balance ledgers, never rebuilt
// from top-up records: an order says how much money arrived, never which
// balance a charge left.
//
// GiftKnown is false before the one-time backfill seeds those ledgers: without
// them the gift share of the wallet cannot be read at all, so callers must
// report the gift figure — and GiftPlanUsed, which contains it — as untracked
// instead of as zero.
type UserUsageSource struct {
	GiftUsed      int64 `json:"gift_used"`
	TokenPlanUsed int64 `json:"token_plan_used"`
	GiftPlanUsed  int64 `json:"gift_plan_used"`
	GiftKnown     bool  `json:"gift_known"`
	// GiftQuota is every quota unit the account was ever given (check-in
	// rewards, redemption codes, event prizes, manual grants). GiftRemaining is
	// the part of the current wallet balance that gift quota still funds, taken
	// from bonus_quota: a charge is paid out of gifted balance first, so that
	// column is already the gift share of the wallet. Both are served so the
	// wallet can say how much of the remaining balance is a gift instead of
	// only how much was spent.
	GiftQuota     int64 `json:"gift_quota"`
	GiftRemaining int64 `json:"gift_remaining"`
}

type userUsedQuotaTotal struct {
	UserId     int
	UsedQuota  int64
	LevelQuota int64
	Quota      int64
	// BonusQuota is only selected once the backfill seeded the ledgers; the
	// column does not exist before that.
	BonusQuota int64
}

// usageLevelLedgersSeeded reports whether the one-time gift backfill already
// seeded level_quota for every account. Its marker is written inside the
// backfill transaction, so a half-applied backfill never reads as done. A
// database without the options table never ran the backfill at all.
func usageLevelLedgersSeeded() (bool, error) {
	if !DB.Migrator().HasTable(&Option{}) {
		return false, nil
	}
	var marker Option
	err := DB.Where(&Option{Key: UsageLevelGiftExclusionMigrationKey}).First(&marker).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return marker.Value == "true", nil
}

// UserUsageSources reads the lifetime funding split for the given accounts.
func UserUsageSources(userIds []int) (map[int]UserUsageSource, error) {
	if len(userIds) == 0 {
		return map[int]UserUsageSource{}, nil
	}

	// The seed marker also decides whether bonus_quota exists at all, so it is
	// read before the totals: a database that never ran the backfill has no
	// gift ledger to select.
	seeded, err := usageLevelLedgersSeeded()
	if err != nil {
		return nil, err
	}
	columns := "id AS user_id, used_quota, level_quota, quota"
	if seeded {
		columns += ", bonus_quota"
	}
	var totals []userUsedQuotaTotal
	if err := DB.Unscoped().Model(&User{}).Select(columns).
		Where("id IN ?", userIds).Find(&totals).Error; err != nil {
		return nil, err
	}

	var planRows []userQuotaTotal
	if err := DB.Model(&TokenPlanReservation{}).
		Select("user_id, COALESCE(SUM(free_used), 0) AS quota").
		Where("settled = ? AND user_id IN ?", true, userIds).
		Group("user_id").Scan(&planRows).Error; err != nil {
		return nil, err
	}
	gift, err := giftQuotaByUser(quotaSourceScope{userIds: userIds})
	if err != nil {
		return nil, err
	}
	planFree := make(map[int]int64, len(planRows))
	for _, row := range planRows {
		planFree[row.UserId] = row.Quota
	}

	sources := make(map[int]UserUsageSource, len(totals))
	for _, total := range totals {
		giftQuota := gift[total.UserId]
		// Before the backfill the gift balance cannot be read at all; the
		// used_quota/level_quota gap is then the only clue and the figure stays
		// untraceable, exactly as it did before the ledger existed.
		giftUsed := max(total.UsedQuota-total.LevelQuota, 0)
		giftRemaining := int64(0)
		if seeded {
			// bonus_quota is the gift share of the current wallet: a charge is
			// taken out of it before any real money, so it is already the
			// answer. Rebuilding the figure as "granted minus the ledger gap"
			// cannot work, because level_quota was seeded from used_quota: gift
			// that was spent before that seeding sits inside the seed, never
			// reaches the gap, and comes back as unspent gift — which then
			// inflated the wallet as soon as a charge emptied the real gift
			// balance.
			giftRemaining = min(max(total.BonusQuota, 0), max(total.Quota, 0))
			giftUsed = max(giftQuota-giftRemaining, 0)
		}
		sources[total.UserId] = UserUsageSource{
			TokenPlanUsed: planFree[total.UserId],
			GiftUsed:      giftUsed,
			GiftPlanUsed:  giftUsed + planFree[total.UserId],
			GiftKnown:     seeded,
			GiftQuota:     giftQuota,
			GiftRemaining: giftRemaining,
		}
	}
	return sources, nil
}

// isUsageSourceSortKey reports whether a user-list sort key is one of the
// lifetime funding figures. Their value is assembled from several funding
// tables plus the log database, so no portable ORDER BY can express them and
// the whole filtered set is ordered in Go instead.
func isUsageSourceSortKey(sortBy string) bool {
	return sortBy == "gift_used" || sortBy == "token_plan_used" || sortBy == "gift_plan_used"
}

// sortKeyDependsOnGift reports whether a derived metric includes the gift part,
// which is the part that can be untraceable.
func sortKeyDependsOnGift(sortBy string) bool {
	return sortBy == "gift_used" || sortBy == "gift_plan_used"
}

// usageSourceSortValue reads the metric a derived sort orders by.
func usageSourceSortValue(source UserUsageSource, sortBy string) int64 {
	switch sortBy {
	case "gift_used":
		return source.GiftUsed
	case "gift_plan_used":
		return source.GiftPlanUsed
	default:
		return source.TokenPlanUsed
	}
}

// sortUserIdsByUsageSource orders the ids the way the list shows them. An
// account whose gift usage cannot be traced always sorts last, so it never poses
// as the smallest or the largest consumer; ties fall back to id descending,
// matching the database ordering the other columns use.
func sortUserIdsByUsageSource(ids []int, sources map[int]UserUsageSource, order UserSortOptions) {
	slices.SortFunc(ids, func(a, b int) int {
		left, right := sources[a], sources[b]
		if sortKeyDependsOnGift(order.SortBy) && left.GiftKnown != right.GiftKnown {
			if left.GiftKnown {
				return -1
			}
			return 1
		}
		leftValue, rightValue := usageSourceSortValue(left, order.SortBy), usageSourceSortValue(right, order.SortBy)
		if leftValue != rightValue {
			if order.SortOrder == "asc" {
				return cmp.Compare(leftValue, rightValue)
			}
			return cmp.Compare(rightValue, leftValue)
		}
		return cmp.Compare(b, a)
	})
}

// pageUsersByUsageSource orders the whole filtered set in Go and then reads the
// requested page back by id, so callers still receive complete rows. Ordering
// before paging keeps the sort stable across pages. It runs outside a
// transaction on purpose: the aggregates read several tables, which would
// otherwise hold the single SQLite connection while they wait for it.
func pageUsersByUsageSource(base *gorm.DB, startIdx, num int, order UserSortOptions) ([]*User, int64, error) {
	var total int64
	if err := base.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var ids []int
	if err := base.Session(&gorm.Session{}).Pluck("id", &ids).Error; err != nil {
		return nil, 0, err
	}
	if len(ids) == 0 {
		return []*User{}, total, nil
	}
	sources, err := UserUsageSources(ids)
	if err != nil {
		return nil, 0, err
	}
	sortUserIdsByUsageSource(ids, sources, order)
	if startIdx >= len(ids) {
		return []*User{}, total, nil
	}
	pageIds := ids[startIdx:min(startIdx+num, len(ids))]

	var users []*User
	if err := base.Session(&gorm.Session{}).Omit("password", "access_token").
		Where("id IN ?", pageIds).Find(&users).Error; err != nil {
		return nil, 0, err
	}
	// IN returns rows in no particular order, so restore the sorted order.
	byId := make(map[int]*User, len(users))
	for _, user := range users {
		byId[user.Id] = user
	}
	ordered := make([]*User, 0, len(pageIds))
	for _, id := range pageIds {
		if user, ok := byId[id]; ok {
			ordered = append(ordered, user)
		}
	}
	return ordered, total, nil
}
