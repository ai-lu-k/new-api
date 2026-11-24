package model

import (
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
)

var ErrTokenPlanWalletInsufficient = errors.New("Token Plan weekly quota and balance cannot cover this request reservation; top up or lower the output limit")

var ErrTokenPlanRetired = errors.New("Token Plan has been retired; use vouchers and wallet balance")

// Reservation amounts never enter UsedQuota. Persist the split so a deferred
// task's settlement/refund survives restarts and stays in its original week.
type TokenPlanReservation struct {
	Id             int
	UserId         int `gorm:"index;not null"`
	WeekId         int `gorm:"not null"`
	WalletFallback bool
	ReservedQuota  int64
	FreeReserved   int64
	WalletReserved int64
	ActualQuota    int64
	FreeUsed       int64
	WalletUsed     int64
	Settled        bool
	// Zero means the settlement predates date tracking; do not invent history.
	SettledAt int64 `gorm:"index;not null;default:0"`
}

// TokenPlanSettings carries the per-user switches. A nil field keeps its stored
// value, so saving one switch never overwrites the other.
type TokenPlanSettings struct {
	WalletFallback  *bool
	AutoResetCoupon *bool
}

func UpdateTokenPlanSettings(userId int, settings TokenPlanSettings) error {
	if common.TokenPlanRetired {
		return ErrTokenPlanRetired
	}
	updates := map[string]any{}
	if settings.WalletFallback != nil {
		updates["wallet_fallback"] = *settings.WalletFallback
	}
	if settings.AutoResetCoupon != nil {
		updates["auto_reset_coupon"] = *settings.AutoResetCoupon
	}
	if len(updates) == 0 {
		return errors.New("no Token Plan setting to update")
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id", "status").First(&user, userId).Error; err != nil {
			return err
		}
		if user.Status != common.UserStatusEnabled {
			return errors.New("user is disabled")
		}
		result := tx.Model(&TokenPlanAccount{}).Where("user_id = ?", userId).Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			var count int64
			if err := tx.Model(&TokenPlanAccount{}).Where("user_id = ?", userId).Count(&count).Error; err != nil {
				return err
			}
			if count == 0 {
				return gorm.ErrRecordNotFound
			}
		}
		return nil
	})
}

func ReserveTokenPlanRequest(userId, tokenId int, amount int64, now time.Time) (*TokenPlanReservation, error) {
	if common.TokenPlanRetired {
		return nil, ErrTokenPlanRetired
	}
	if amount < 0 || amount > int64(common.MaxQuota) {
		return nil, errors.New("invalid Token Plan reservation")
	}
	var reservation TokenPlanReservation
	var cacheHeld int64
	var autoReset *TokenPlanResetOperation
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).First(&user, userId).Error; err != nil {
			return err
		}
		if user.Status != common.UserStatusEnabled {
			return errors.New("user is disabled")
		}
		var account TokenPlanAccount
		if err := tx.Where("user_id = ? AND token_id = ?", userId, tokenId).First(&account).Error; err != nil {
			return err
		}
		week, err := currentTokenPlanWeek(tx, &account, now)
		if err != nil {
			return err
		}
		total, err := tokenPlanCycleQuota(CalculateUsageLevel(user.LevelQuota, operation_setting.GetUsageLevelThresholds()).Level, max(1, week.Multiplier))
		if err != nil {
			return err
		}
		// Only consumption that actually reached the ceiling justifies spending
		// one coupon: pending reservations and a large estimate must not reset.
		// The natural calendar rollover above always wins, and a failed
		// admission rolls the reset back, so it never burns a coupon.
		if amount > 0 && account.AutoResetCoupon && total > 0 && week.UsedQuota >= total {
			var resetWeek *TokenPlanWeek
			var resetTotal int64
			resetWeek, resetTotal, autoReset, err = autoResetTokenPlanCoupon(tx, &user, &account, week, now)
			if err != nil && !errors.Is(err, ErrTokenPlanNoCoupon) {
				return err
			}
			if err == nil {
				week, total = resetWeek, resetTotal
			}
		}
		free := min(amount, max(0, total-week.UsedQuota-week.ReservedQuota))
		wallet := amount - free
		if wallet > 0 && !account.WalletFallback {
			return ErrTokenPlanExhausted
		}
		if wallet > 0 && wallet > int64(user.Quota) {
			return ErrTokenPlanWalletInsufficient
		}
		if wallet > 0 && common.RedisEnabled {
			if err := holdTokenPlanWalletCache(user, wallet); err != nil {
				return err
			}
			cacheHeld = wallet
		}
		reservation = TokenPlanReservation{UserId: userId, WeekId: week.Id, WalletFallback: account.WalletFallback, ReservedQuota: amount, FreeReserved: free, WalletReserved: wallet}
		if err := tx.Create(&reservation).Error; err != nil {
			return err
		}
		if err := tx.Model(&week).UpdateColumn("reserved_quota", gorm.Expr("reserved_quota + ?", free)).Error; err != nil {
			return err
		}
		if wallet > 0 {
			if user.TokenPlanWalletHold > int64(common.MaxWalletQuota)-wallet {
				return errors.New("Token Plan wallet reservation overflow")
			}
			return tx.Model(&user).Updates(map[string]any{"quota": gorm.Expr("quota - ?", wallet), "token_plan_reserved_quota": gorm.Expr("token_plan_reserved_quota + ?", wallet)}).Error
		}
		return nil
	})
	if err != nil && cacheHeld > 0 {
		syncTokenPlanWalletCache(userId, cacheHeld)
	}
	if err == nil && autoReset != nil {
		common.SysLog(fmt.Sprintf("Token Plan automatic reset (userId=%d, couponId=%d, multiplier=%d, weekId=%d)", userId, autoReset.CouponId, autoReset.NewMultiplier, autoReset.WeekId))
	}
	return &reservation, err
}

// ResizeTokenPlanReservation is used before a more expensive retry/realtime
// segment; it checks capacity without turning pending work into consumption.
func ResizeTokenPlanReservation(userId, reservationId int, target int64) error {
	_, err := updateTokenPlanRequest(userId, reservationId, target, false)
	return err
}

// SettleTokenPlanRequest accepts the absolute actual charge, making retries
// idempotent. Actual usage exceeding an estimate stays accountable: without
// opt-in it is retained as free-plan debt, never an unauthorized wallet debit.
func SettleTokenPlanRequest(userId, reservationId int, actual int64) (*TokenPlanReservation, error) {
	return updateTokenPlanRequest(userId, reservationId, actual, true)
}

func updateTokenPlanRequest(userId, reservationId int, amount int64, settle bool) (*TokenPlanReservation, error) {
	if amount < 0 || amount > int64(common.MaxQuota) {
		return nil, errors.New("invalid Token Plan charge")
	}
	var reservation TokenPlanReservation
	var walletDelta, cacheHeld int64
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).First(&user, userId).Error; err != nil {
			return err
		}
		if !settle && user.Status != common.UserStatusEnabled {
			return errors.New("user is disabled")
		}
		if err := lockForUpdate(tx).Where("id = ? AND user_id = ?", reservationId, userId).First(&reservation).Error; err != nil {
			return err
		}
		if reservation.Settled && (!settle || reservation.ActualQuota == amount) {
			return nil
		}
		var week TokenPlanWeek
		if err := lockForUpdate(tx).Where("id = ? AND user_id = ?", reservation.WeekId, userId).First(&week).Error; err != nil {
			return err
		}
		total, err := tokenPlanCycleQuota(CalculateUsageLevel(user.LevelQuota, operation_setting.GetUsageLevelThresholds()).Level, max(1, week.Multiplier))
		if err != nil {
			return err
		}
		available := max(0, total-(week.UsedQuota-reservation.FreeUsed)-(week.ReservedQuota-reservation.FreeReserved))
		free := min(amount, available)
		wallet := amount - free
		if !reservation.WalletFallback && wallet > 0 {
			if !settle {
				return ErrTokenPlanExhausted
			}
			free, wallet = amount, 0
		}
		walletDelta = reservation.WalletReserved + reservation.WalletUsed - wallet
		if !settle && walletDelta < 0 && int64(user.Quota) < -walletDelta {
			return ErrTokenPlanWalletInsufficient
		}
		if !settle && walletDelta < 0 && common.RedisEnabled {
			if err := holdTokenPlanWalletCache(user, -walletDelta); err != nil {
				return err
			}
			cacheHeld = -walletDelta
		}
		if walletDelta > 0 && int64(user.Quota) > int64(common.MaxWalletQuota)-walletDelta {
			return ErrWalletQuotaLimitExceeded
		}
		userUpdates := map[string]any{"quota": gorm.Expr("quota + ?", walletDelta)}
		if settle {
			// Only settled wallet spending contributes to usage levels. Keep its
			// delta in this transaction so retries and refunds cannot count twice.
			// The wallet portion follows the same gift/paid split as any other
			// charge: gifted balance is spent first, so only the rest reaches
			// level_quota. user is the locked row, so the split is exact.
			walletConsumed := int(wallet - reservation.WalletUsed)
			bonusDelta, levelDelta := splitLevelConsumption(user.BonusQuota, walletConsumed)
			userUpdates["used_quota"] = gorm.Expr("used_quota + ?", walletConsumed)
			if levelDelta != 0 {
				userUpdates["level_quota"] = gorm.Expr("level_quota + ?", levelDelta)
			}
			if bonusDelta != 0 {
				userUpdates["bonus_quota"] = gorm.Expr("bonus_quota + ?", bonusDelta)
			}
			if !reservation.Settled {
				reservation.SettledAt = time.Now().Unix()
			}
			used := week.UsedQuota - reservation.FreeUsed
			if used < 0 || used > int64(common.MaxWalletQuota)-free {
				return errors.New("Token Plan actual quota overflow")
			}
			week.UsedQuota = used + free
			week.ReservedQuota -= reservation.FreeReserved
			user.TokenPlanWalletHold -= reservation.WalletReserved
			reservation.ActualQuota, reservation.FreeUsed, reservation.WalletUsed = amount, free, wallet
			reservation.FreeReserved, reservation.WalletReserved, reservation.ReservedQuota = 0, 0, 0
			reservation.Settled = true
		} else {
			if week.ReservedQuota-reservation.FreeReserved > int64(common.MaxWalletQuota)-free {
				return errors.New("Token Plan reservation overflow")
			}
			week.ReservedQuota += free - reservation.FreeReserved
			if user.TokenPlanWalletHold-reservation.WalletReserved > int64(common.MaxWalletQuota)-wallet {
				return errors.New("Token Plan wallet reservation overflow")
			}
			user.TokenPlanWalletHold += wallet - reservation.WalletReserved
			reservation.ReservedQuota, reservation.FreeReserved, reservation.WalletReserved = amount, free, wallet
		}
		if week.ReservedQuota < 0 || user.TokenPlanWalletHold < 0 {
			return errors.New("Token Plan reservation accounting mismatch")
		}
		userUpdates["token_plan_reserved_quota"] = user.TokenPlanWalletHold
		if err := tx.Model(&user).Updates(userUpdates).Error; err != nil {
			return err
		}
		if err := tx.Model(&week).Updates(map[string]any{"used_quota": week.UsedQuota, "reserved_quota": week.ReservedQuota}).Error; err != nil {
			return err
		}
		return tx.Save(&reservation).Error
	})
	if err != nil && cacheHeld > 0 {
		syncTokenPlanWalletCache(userId, cacheHeld)
	}
	if err == nil && cacheHeld == 0 {
		syncTokenPlanWalletCache(userId, walletDelta)
	}
	return &reservation, err
}

func syncTokenPlanWalletCache(userId int, delta int64) {
	if delta == 0 || !common.RedisEnabled {
		return
	}
	if _, err := cacheApplyUserQuotaDelta(userId, delta); err != nil {
		common.SysError(fmt.Sprintf("Token Plan wallet cache update failed (userId=%d): %v", userId, err))
		// Never leave a stale, overly generous balance after a failed cache write.
		if err := invalidateUserCache(userId); err != nil {
			common.SysError("Token Plan wallet cache invalidation failed: " + err.Error())
		}
	}
}

// Coordinate wallet holds with the ordinary wallet's atomic Redis balance,
// including pending batch deltas. The database row remains locked until the
// ledger is committed; callers compensate the cache if the transaction fails.
func holdTokenPlanWalletCache(user User, amount int64) error {
	result, err := cacheTryReserveUserQuota(user.Id, amount)
	if err == nil && result == cacheQuotaMiss {
		if err = populateUserCache(user); err == nil {
			result, err = cacheTryReserveUserQuota(user.Id, amount)
		}
	}
	if err != nil {
		return err
	}
	if result == cacheQuotaInsufficient {
		return ErrTokenPlanWalletInsufficient
	}
	if result != cacheQuotaOK {
		return errors.New("Token Plan wallet cache unavailable")
	}
	return nil
}
