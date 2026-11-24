package model

import (
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// The Token Plan era left two kinds of value behind: reset coupons nobody has
// spent, and this week's unused free allowance. Both become vouchers, because a
// voucher is the only shape left that can carry a deadline.
//
// The conversion is one-way and idempotent: every batch it writes names its
// source in request_id, so a second run finds the batch and does nothing.

const (
	// legacyVoucherAdminId marks a batch no administrator submitted. It is a
	// valid value for the (admin_id, request_id) unique index and keeps the
	// migration distinguishable from a real grant.
	legacyVoucherAdminId = 0

	// legacyQuotaValidityDays is how long the converted weekly allowance stays
	// openable. The allowance itself used to reset every week, so a month is
	// already generous.
	legacyQuotaValidityDays = 30

	// legacyQuotaReason is what the owner sees on the card.
	legacyQuotaReason  = "Token Plan 剩余额度折算"
	legacyCouponReason = "原重置券折算"
)

var (
	ErrLegacyCouponUnmapped   = errors.New("reset coupon multiplier has no voucher value")
	ErrLegacyQuotaUnavailable = errors.New("legacy quota cannot be converted")
)

// LegacyCouponFaceValueYuan is what one reset coupon is worth as a voucher.
// ×1 was a plain reset with no multiplier, which the product decided to keep
// worth ¥1 rather than dropping it.
func LegacyCouponFaceValueYuan(multiplier int) (float64, error) {
	switch multiplier {
	case 1:
		return 1, nil
	case 3:
		return 3, nil
	case 5:
		return 5, nil
	case 10:
		return 10, nil
	default:
		return 0, fmt.Errorf("%w: %d", ErrLegacyCouponUnmapped, multiplier)
	}
}

// VoucherMigrationReport says what one conversion pass did. Totals are in quota
// units so the caller can print money with the same helper the UI uses.
type VoucherMigrationReport struct {
	Converted  int   `json:"converted"`
	Skipped    int   `json:"skipped"`
	Failed     int   `json:"failed"`
	Lapsed     int   `json:"lapsed"`
	TotalQuota int64 `json:"total_quota"`
}

// MigrateLegacyCouponsToVouchers turns every still-openable reset coupon into a
// voucher that keeps the coupon's own deadline. Coupons whose deadline already
// passed are marked expired instead of being converted, so the owner sees them
// lapse rather than silently vanish.
//
// Each source coupon becomes its own batch: the coupons carry different
// deadlines and face values, and a per-coupon request_id makes a re-run free.
func MigrateLegacyCouponsToVouchers(now time.Time, dryRun bool) (*VoucherMigrationReport, error) {
	report := &VoucherMigrationReport{}
	var coupons []TokenPlanResetCoupon
	if err := DB.Where("status = ?", "available").Order("id").Find(&coupons).Error; err != nil {
		return nil, err
	}
	for i := range coupons {
		coupon := &coupons[i]
		faceYuan, err := LegacyCouponFaceValueYuan(coupon.Multiplier)
		if err != nil {
			common.SysError(fmt.Sprintf("legacy coupon %d: %v", coupon.Id, err))
			report.Failed++
			continue
		}
		if coupon.ExpiresAt <= now.Unix() {
			// Nothing to hand over: the deadline is what made it usable.
			if dryRun {
				report.Lapsed++
				continue
			}
			if err := DB.Model(&TokenPlanResetCoupon{}).Where("id = ? AND status = ?", coupon.Id, "available").
				UpdateColumn("status", "expired").Error; err != nil {
				common.SysError(fmt.Sprintf("legacy coupon %d: cannot lapse: %v", coupon.Id, err))
				report.Failed++
				continue
			}
			report.Lapsed++
			continue
		}
		faceValue, err := VoucherFaceValueFromYuan(faceYuan)
		if err != nil {
			common.SysError(fmt.Sprintf("legacy coupon %d: %v", coupon.Id, err))
			report.Failed++
			continue
		}
		if dryRun {
			report.Converted++
			report.TotalQuota += faceValue
			continue
		}
		requestId := fmt.Sprintf("legacy-coupon-%d", coupon.Id)
		created, err := createLegacyVoucher(legacyVoucherParams{
			UserId:    coupon.UserId,
			RequestId: requestId,
			FaceValue: faceValue,
			FaceYuan:  faceYuan,
			ExpiresAt: coupon.ExpiresAt,
			Reason:    legacyCouponReason,
			Source:    VoucherSourceLegacyCoupon,
			Now:       now,
			// The coupon is the same value as the voucher. Leaving it
			// available would let the owner spend it twice: the reset path in
			// token_plan_reset_coupon.go still honours any available coupon.
			RetireSource: func(tx *gorm.DB) error {
				retired := tx.Model(&TokenPlanResetCoupon{}).
					Where("id = ? AND status = ?", coupon.Id, "available").
					UpdateColumn("status", "converted")
				if retired.Error != nil {
					return retired.Error
				}
				if retired.RowsAffected != 1 {
					return fmt.Errorf("coupon %d was spent during conversion", coupon.Id)
				}
				return nil
			},
		})
		if err != nil {
			common.SysError(fmt.Sprintf("legacy coupon %d: %v", coupon.Id, err))
			report.Failed++
			continue
		}
		if created {
			report.Converted++
			report.TotalQuota += faceValue
		} else {
			report.Skipped++
		}
	}
	return report, nil
}

// MigrateLegacyWeeklyQuota converts each account's unused allowance of its
// current cycle into one voucher. The allowance is computed the way the billing
// path computes it, so the converted amount matches what the account could
// actually have spent.
//
// The active ledger is resolved the same way currentTokenPlanWeek resolves it,
// because week_start is not always a Monday: a coupon reset writes a negative
// key (-couponId) and a personal cycle follows CycleAnchor + n*7d. Looking the
// row up by "this week's Monday" would miss every account that ever used a
// reset coupon, and could pick up a stale pre-reset row for the ones it did
// find.
//
// Accounts with no active ledger have nothing outstanding, and an account whose
// remaining allowance is already zero gets nothing: a ¥0 voucher would only be
// noise. An account whose cycle already rolled over also gets nothing, even
// though the new cycle would have granted a fresh allowance: that allowance
// lapsed with the old cycle, and the migration does not resurrect it.
func MigrateLegacyWeeklyQuota(now time.Time, dryRun bool) (*VoucherMigrationReport, error) {
	report := &VoucherMigrationReport{}
	var accounts []TokenPlanAccount
	if err := DB.Order("user_id").Find(&accounts).Error; err != nil {
		return nil, err
	}
	for i := range accounts {
		account := &accounts[i]
		week, err := activeTokenPlanWeek(account, now)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				// Nothing outstanding for this cycle.
				report.Skipped++
				continue
			}
			common.SysError(fmt.Sprintf("legacy quota user %d: %v", account.UserId, err))
			report.Failed++
			continue
		}
		var user User
		if err := DB.Select("id", "status", "level_quota").First(&user, account.UserId).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				report.Skipped++
				continue
			}
			return nil, err
		}
		if user.Status != common.UserStatusEnabled {
			report.Skipped++
			continue
		}
		level := CalculateUsageLevel(user.LevelQuota, operation_setting.GetUsageLevelThresholds()).Level
		// The ledger stored exactly this product, so converting it back with the
		// same helper keeps the amount equal to what could still be spent.
		total, err := tokenPlanCycleQuota(level, max(1, week.Multiplier))
		if err != nil {
			common.SysError(fmt.Sprintf("legacy quota user %d: %v", user.Id, err))
			report.Failed++
			continue
		}
		remaining := total - week.UsedQuota - week.ReservedQuota
		if remaining <= 0 {
			report.Skipped++
			continue
		}
		requestId := fmt.Sprintf("legacy-quota-%d-%d", user.Id, week.Id)
		var existing int64
		if err := DB.Model(&VoucherBatch{}).Where("admin_id = ? AND request_id = ?", legacyVoucherAdminId, requestId).Count(&existing).Error; err != nil {
			return nil, err
		}
		if existing > 0 {
			report.Skipped++
			continue
		}
		if dryRun {
			report.Converted++
			report.TotalQuota += remaining
			continue
		}
		expiresAt := now.AddDate(0, 0, legacyQuotaValidityDays).Unix()
		created, err := createLegacyVoucher(legacyVoucherParams{
			UserId:    user.Id,
			RequestId: requestId,
			FaceValue: remaining,
			FaceYuan:  voucherYuanFromQuota(remaining),
			ExpiresAt: expiresAt,
			Reason:    legacyQuotaReason,
			Source:    VoucherSourceLegacyQuota,
			Now:       now,
		})
		if err != nil {
			common.SysError(fmt.Sprintf("legacy quota user %d: %v", user.Id, err))
			report.Failed++
			continue
		}
		if created {
			report.Converted++
			report.TotalQuota += remaining
		} else {
			report.Skipped++
		}
	}
	return report, nil
}

// activeTokenPlanWeek returns the ledger row the account is spending from right
// now, without creating one. gorm.ErrRecordNotFound means this cycle has no
// ledger at all, so the account has nothing outstanding to convert.
func activeTokenPlanWeek(account *TokenPlanAccount, now time.Time) (*TokenPlanWeek, error) {
	if account.CycleAnchor > 0 {
		var week TokenPlanWeek
		err := DB.Where("id = ? AND user_id = ?", account.CurrentWeekId, account.UserId).First(&week).Error
		if err != nil {
			return nil, err
		}
		if now.Unix() < week.CycleEnd {
			return &week, nil
		}
		// The cycle rolled over. A new ledger only exists once something is
		// spent in it, and a cycle nobody touched has no ledger to convert:
		// the allowance it would have granted already lapsed with the old
		// cycle, so the account converts nothing. That is the intended outcome,
		// not a gap.
		start := account.CycleAnchor + (now.Unix()-account.CycleAnchor)/tokenPlanCycleSeconds*tokenPlanCycleSeconds
		err = DB.Where("user_id = ? AND week_start = ?", account.UserId, start).First(&week).Error
		if err != nil {
			return nil, err
		}
		return &week, nil
	}
	var week TokenPlanWeek
	err := DB.Where("user_id = ? AND week_start = ?", account.UserId, TokenPlanWeekStart(now).Unix()).First(&week).Error
	if err != nil {
		return nil, err
	}
	return &week, nil
}

// voucherYuanFromQuota states a quota amount as money, the inverse of
// VoucherFaceValueFromYuan. Legacy weekly allowance is already in wallet units,
// so its batch row needs this to state the same value in yuan.
func voucherYuanFromQuota(quota int64) float64 {
	if common.QuotaPerUnit <= 0 {
		return 0
	}
	usd := decimal.NewFromInt(quota).Div(decimal.NewFromFloat(common.QuotaPerUnit))
	yuan, _ := usd.Mul(decimal.NewFromFloat(operation_setting.USDExchangeRate)).Float64()
	return yuan
}

type legacyVoucherParams struct {
	UserId    int
	RequestId string
	FaceValue int64
	FaceYuan  float64
	ExpiresAt int64
	Reason    string
	Source    string
	Now       time.Time
	// RetireSource runs inside the same transaction as the insert, so the old
	// value can never survive alongside the voucher that replaced it.
	RetireSource func(tx *gorm.DB) error
}

// createLegacyVoucher writes one batch and its single voucher. It reports
// whether this call was the one that created them, so a re-run counts the row
// as skipped instead of inflating the converted total.
func createLegacyVoucher(params legacyVoucherParams) (bool, error) {
	if params.FaceValue <= 0 {
		return false, ErrLegacyQuotaUnavailable
	}
	if err := common.ValidateWalletQuota(int(params.FaceValue)); err != nil {
		return false, err
	}
	created := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		var existing VoucherBatch
		err := tx.Where("admin_id = ? AND request_id = ?", legacyVoucherAdminId, params.RequestId).
			First(&existing).Error
		if err == nil {
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		batch := VoucherBatch{
			AdminId:        legacyVoucherAdminId,
			RequestId:      params.RequestId,
			FaceValue:      params.FaceValue,
			FaceValueYuan:  params.FaceYuan,
			ValidityDays:   int(max(0, (params.ExpiresAt-params.Now.Unix())/(24*60*60))),
			ExpiresAt:      params.ExpiresAt,
			Reason:         params.Reason,
			Audience:       "users",
			RecipientCount: 1,
			CreatedAt:      params.Now.Unix(),
			Status:         "complete",
		}
		if err := tx.Create(&batch).Error; err != nil {
			return err
		}
		voucher := Voucher{
			UserId:    params.UserId,
			FaceValue: params.FaceValue,
			Status:    VoucherStatusUnopened,
			ExpiresAt: params.ExpiresAt,
			BatchId:   batch.Id,
			Source:    params.Source,
			CreatedAt: params.Now.Unix(),
		}
		if err := tx.Create(&voucher).Error; err != nil {
			return err
		}
		if params.RetireSource != nil {
			if err := params.RetireSource(tx); err != nil {
				return err
			}
		}
		created = true
		return nil
	})
	return created, err
}
