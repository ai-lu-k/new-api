package model

import (
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Users carry two level ledgers next to the statistics-only used_quota:
//
//	level_quota  consumption paid from the user's own money; it is the only
//	             input of CalculateUsageLevel
//	bonus_quota  how much of the current balance was given away (check-in,
//	             redemption code, event prize, registration/invitation reward,
//	             manual addition without an offline payment)
//
// A charge is taken out of bonus_quota first, so gift money never buys level
// progress. used_quota keeps its historical meaning — everything that was
// charged — and stays the source of the consumption statistics.

// splitLevelConsumption splits one consumption delta into the part taken from
// the remaining gifted balance and the part that came out of real money.
//
// A refund only lowers the statistics counter. It neither restores bonus_quota
// nor takes level_quota back: the charge that is being undone may have been
// paid from gifted balance, and a level must never fall, so the safe direction
// is to leave both ledgers alone. The refunded money returns to the wallet as
// ordinary balance, which means spending it again does count — that asymmetry
// is intentional and keeps the rule easy to explain.
func splitLevelConsumption(bonusQuota, delta int) (bonusDelta, levelDelta int) {
	if delta <= 0 {
		return 0, 0
	}
	consumed := min(delta, max(0, bonusQuota))
	return -consumed, delta - consumed
}

// lockUserLevelLedgers returns the two balances of one locked user row.
// SQLite has no FOR UPDATE, so it is given a write first (the same trick
// lockUserRow uses) to keep its deferred transaction from upgrading mid-read.
func lockUserLevelLedgers(tx *gorm.DB, userId int) (*User, error) {
	if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		if err := tx.Model(&User{}).Where("id = ?", userId).UpdateColumn("id", gorm.Expr("id")).Error; err != nil {
			return nil, err
		}
	}
	var user User
	err := lockForUpdate(tx).Select("id", "level_quota", "bonus_quota").First(&user, userId).Error
	return &user, err
}

// applyUserQuotaLedger applies one balance/usage change to a user in a single
// statement: the wallet delta, the statistics counter, the request counter and
// both level ledgers. The split is decided from the locked row inside the
// caller's transaction, so a settlement can never deduct used_quota while
// leaving the level ledgers behind, and two concurrent settlements cannot
// both spend the same gifted balance.
//
// The batch queue nets the deltas of one interval per user, so a charge and its
// refund inside the same window cancel out and leave the gift balance untouched
// instead of being restored. That only ever shrinks the paid side — a level can
// lag but never be inflated by gift money.
func applyUserQuotaLedger(tx *gorm.DB, userId int, quotaDelta int, usedQuotaDelta int, requestDelta int) error {
	updates := make(map[string]any, 5)
	var giftSpent int
	if quotaDelta != 0 {
		updates["quota"] = gorm.Expr("quota + ?", quotaDelta)
	}
	if requestDelta != 0 {
		updates["request_count"] = gorm.Expr("request_count + ?", requestDelta)
	}
	if usedQuotaDelta != 0 {
		user, err := lockUserLevelLedgers(tx, userId)
		if err != nil {
			return err
		}
		bonusDelta, levelDelta := splitLevelConsumption(user.BonusQuota, usedQuotaDelta)
		updates["used_quota"] = gorm.Expr("used_quota + ?", usedQuotaDelta)
		if levelDelta != 0 {
			updates["level_quota"] = gorm.Expr("level_quota + ?", levelDelta)
		}
		if bonusDelta != 0 {
			updates["bonus_quota"] = gorm.Expr("bonus_quota + ?", bonusDelta)
			giftSpent = -bonusDelta
		}
	}
	if len(updates) == 0 {
		return nil
	}
	if err := tx.Model(&User{}).Where("id = ?", userId).Updates(updates).Error; err != nil {
		return err
	}
	// Only the lock above knows how much of this charge came out of gifted
	// balance, so the daily ledger is written in the same transaction.
	return addGiftConsumption(tx, userId, int64(giftSpent), time.Unix(common.GetTimestamp(), 0))
}

// CreditGiftQuota credits quota the platform gave away. The wallet really
// grows, and bonus_quota records that this money is not the user's own, so
// spending it later never counts toward the level. The balance ceiling is
// enforced in the same conditional update as the credit.
func CreditGiftQuota(tx *gorm.DB, userId int, quota int) error {
	if quota < 0 {
		return errors.New("quota 不能为负数！")
	}
	if quota == 0 {
		return nil
	}
	if err := common.ValidateWalletQuota(quota); err != nil {
		return err
	}
	result := tx.Model(&User{}).
		Where("id = ? AND quota <= ?", userId, common.MaxWalletQuota-quota).
		Updates(map[string]any{
			"quota":       gorm.Expr("quota + ?", quota),
			"bonus_quota": gorm.Expr("bonus_quota + ?", quota),
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 1 {
		return nil
	}
	var count int64
	if err := tx.Model(&User{}).Where("id = ?", userId).Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return gorm.ErrRecordNotFound
	}
	return ErrWalletQuotaLimitExceeded
}

// UsageLevelGiftExclusionMigrationKey marks the one-time backfill of the two
// level ledgers. Its presence means the backfill already ran.
const UsageLevelGiftExclusionMigrationKey = "usage_level.gift_exclusion_migrated"

// MigrateUsageLevelGiftExclusion seeds level_quota from used_quota so no
// existing level drops, and estimates the still-unspent gifted balance once.
//
// The estimate is the gift total recorded for the account (check-ins,
// redemption codes, event prizes, registration/invitation rewards, manual
// additions without an offline payment) minus what the account already spent,
// where spending is estimated as used_quota minus Token Plan's cumulative free
// allowance. Two consequences are accepted on purpose: a gift that no ledger
// records (a legacy signup grant) is not reconstructed, and a pre-fix Token
// Plan allowance that never entered used_quota lowers the estimate instead of
// inflating it. Both only shrink the gift side, so no real payment is ever
// misclassified as a gift.
//
// The aggregates are read before the write transaction: one connection held by
// an open transaction deadlocks against a nested query on a single-connection
// SQLite pool. The writes then happen in one transaction whose first statement
// inserts the marker, so a second gateway instance starting at the same time
// writes nothing, and a crash rolls the backfill back instead of leaving it
// half applied.
func MigrateUsageLevelGiftExclusion(db *gorm.DB) error {
	if !db.Migrator().HasColumn(&User{}, "level_quota") || !db.Migrator().HasColumn(&User{}, "bonus_quota") {
		return nil
	}
	// The backfill aggregates several tables; skip that work on every restart
	// once the marker proves it already ran. Option is keyed by `key`, so the
	// probe must not ask for an id column.
	var marker Option
	if err := db.Where(&Option{Key: UsageLevelGiftExclusionMigrationKey}).First(&marker).Error; err == nil {
		return nil
	}
	gift, err := giftQuotaByUser(quotaSourceScope{})
	if err != nil {
		return err
	}
	var rewards []userQuotaTotal
	if err := db.Model(&RegistrationReward{}).
		Select("user_id, COALESCE(SUM(signup_quota + invitee_quota), 0) AS quota").
		Where("issued_at > 0").Group("user_id").Scan(&rewards).Error; err != nil {
		return err
	}
	for _, row := range rewards {
		gift[row.UserId] += row.Quota
	}
	// Referral rewards are Token Plan reset coupons today: they grant plan
	// allowance, never wallet quota, so they add nothing here.
	free := make(map[int]int64)
	var freeRows []userQuotaTotal
	if err := db.Model(&TokenPlanReservation{}).
		Select("user_id, COALESCE(SUM(free_used), 0) AS quota").
		Where("settled = ?", true).Group("user_id").Scan(&freeRows).Error; err != nil {
		return err
	}
	for _, row := range freeRows {
		free[row.UserId] = row.Quota
	}
	var users []User
	if err := db.Select("id", "quota", "used_quota").Find(&users).Error; err != nil {
		return err
	}

	claimed := false
	err = db.Transaction(func(tx *gorm.DB) error {
		marker := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&Option{Key: UsageLevelGiftExclusionMigrationKey, Value: "running"})
		if marker.Error != nil {
			return marker.Error
		}
		if marker.RowsAffected == 0 {
			return nil
		}
		claimed = true
		for i := range users {
			user := &users[i]
			spent := max(0, user.UsedQuota-int(free[user.Id]))
			bonus := min(max(0, int(gift[user.Id])-spent), max(0, user.Quota))
			// level_quota is seeded from the live used_quota in the same
			// statement, so a charge committed while the backfill runs is kept
			// instead of being overwritten by a stale snapshot. The gift seed
			// is added instead of assigned, so a credit that landed between the
			// aggregate reads and this transaction survives.
			if err := tx.Model(&User{}).Where("id = ?", user.Id).
				Updates(map[string]any{
					"level_quota": gorm.Expr("used_quota"),
					"bonus_quota": gorm.Expr("bonus_quota + ?", bonus),
				}).Error; err != nil {
				return err
			}
		}
		return tx.Model(&Option{}).Where(&Option{Key: UsageLevelGiftExclusionMigrationKey}).Update("value", "true").Error
	})
	if err != nil {
		return fmt.Errorf("failed to seed the usage level ledgers: %w", err)
	}
	if claimed {
		common.SysLog("usage level gift exclusion migrated: level_quota seeded from used_quota")
	}
	return nil
}
