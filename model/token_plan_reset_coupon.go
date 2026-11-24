package model

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const tokenPlanCycleSeconds int64 = 7 * 24 * 60 * 60

// ErrTokenPlanNoCoupon means the opt-in automatic reset found nothing to spend;
// the caller keeps its normal continuation/refusal path.
var ErrTokenPlanNoCoupon = errors.New("no usable Token Plan reset coupon")

// WeekStart stays unique for legacy calendar buckets. Coupon buckets use a
// negative coupon ID, so two resets in the same second cannot reuse a ledger.
type TokenPlanResetCoupon struct {
	Id         int    `json:"id"`
	BatchId    int    `json:"batch_id" gorm:"uniqueIndex:idx_plan_coupon_grant;not null"`
	UserId     int    `json:"user_id" gorm:"uniqueIndex:idx_plan_coupon_grant;index;not null"`
	Ordinal    int    `json:"ordinal" gorm:"uniqueIndex:idx_plan_coupon_grant;not null"`
	Multiplier int    `json:"multiplier"`
	ExpiresAt  int64  `json:"expires_at"`
	Status     string `json:"status" gorm:"size:16;not null"`
	UsedAt     int64  `json:"used_at"`
	// AcknowledgedAt records that the owner saw the arrival notice. It stays
	// independent of Status: signing for a coupon never consumes or voids it.
	AcknowledgedAt int64 `json:"acknowledged_at"`
	WeekId         int   `json:"week_id"`
}

type TokenPlanCouponBatch struct {
	Id             int    `json:"id"`
	AdminId        int    `json:"admin_id" gorm:"uniqueIndex:idx_plan_coupon_batch;not null"`
	RequestId      string `json:"request_id" gorm:"size:64;uniqueIndex:idx_plan_coupon_batch;not null"`
	Multiplier     int    `json:"multiplier"`
	PerUser        int    `json:"per_user"`
	ExpiresAt      int64  `json:"expires_at"`
	Reason         string `json:"reason" gorm:"size:512"`
	Audience       string `json:"audience" gorm:"size:16"`
	Recipients     string `json:"-" gorm:"type:text"`
	RecipientCount int    `json:"recipient_count"`
	IssuedCount    int    `json:"issued_count"`
	CreatedAt      int64  `json:"created_at"`
	Status         string `json:"status" gorm:"size:16"`
}

type TokenPlanResetOperation struct {
	Id             string `json:"id" gorm:"size:32;primaryKey"`
	UserId         int    `json:"-" gorm:"index"`
	CouponId       int    `json:"coupon_id"`
	ExpectedWeekId int    `json:"-"`
	OldRemaining   int64  `json:"old_remaining"`
	OldMultiplier  int    `json:"old_multiplier"`
	NewTotal       int64  `json:"new_total"`
	NewMultiplier  int    `json:"new_multiplier"`
	ExpiresAt      int64  `json:"expires_at"`
	ResetsAt       int64  `json:"resets_at"`
	WeekId         int    `json:"week_id"`
	Status         string `json:"status" gorm:"size:16"`
	// Auto marks a reset the exhausted-quota trigger performed instead of the
	// owner's confirmed manual redemption.
	Auto bool `json:"auto"`
}

type TokenPlanCouponGrant struct {
	RequestId      string `json:"request_id"`
	Audience       string `json:"audience"`
	UserIds        []int  `json:"user_ids"`
	Multiplier     int    `json:"multiplier"`
	PerUser        int    `json:"per_user"`
	ExpiresAt      int64  `json:"expires_at"`
	Reason         string `json:"reason"`
	AudienceDigest string `json:"audience_digest"`
}

func tokenPlanCycleQuota(level, multiplier int) (int64, error) {
	if !slices.Contains([]int{1, 3, 5, 10}, multiplier) {
		return 0, errors.New("invalid Token Plan multiplier")
	}
	base, err := TokenPlanQuota(level)
	if err != nil {
		return 0, err
	}
	value, err := common.WalletQuotaFromDecimalStrict(decimal.NewFromInt(base).Mul(decimal.NewFromInt(int64(multiplier))))
	return int64(value), err
}

// All callers hold the user row lock, including resets, reservations and reads.
func currentTokenPlanWeek(tx *gorm.DB, account *TokenPlanAccount, now time.Time) (*TokenPlanWeek, error) {
	var week TokenPlanWeek
	start := TokenPlanWeekStart(now).Unix()
	if account.CycleAnchor > 0 {
		if err := lockForUpdate(tx).Where("id = ? AND user_id = ?", account.CurrentWeekId, account.UserId).First(&week).Error; err != nil {
			return nil, err
		}
		if now.Unix() < week.CycleEnd {
			return &week, nil
		}
		start = account.CycleAnchor + (now.Unix()-account.CycleAnchor)/tokenPlanCycleSeconds*tokenPlanCycleSeconds
	}
	week = TokenPlanWeek{UserId: account.UserId, WeekStart: start, CycleStart: start, CycleEnd: start + tokenPlanCycleSeconds, Multiplier: 1}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&week).Error; err != nil {
		return nil, err
	}
	if err := lockForUpdate(tx).Where("user_id = ? AND week_start = ?", account.UserId, start).First(&week).Error; err != nil {
		return nil, err
	}
	if account.CurrentWeekId != week.Id {
		if err := tx.Model(account).UpdateColumn("current_week_id", week.Id).Error; err != nil {
			return nil, err
		}
		account.CurrentWeekId = week.Id
	}
	return &week, nil
}

func TokenPlanCouponRecipients(tx *gorm.DB, grant TokenPlanCouponGrant) ([]int, error) {
	if grant.PerUser < 1 || grant.PerUser > 10 {
		return nil, errors.New("invalid coupons per user")
	}
	query := tx.Model(&User{}).Where("status = ?", common.UserStatusEnabled)
	if grant.Audience == "all" {
		query = query.Where("role = ?", common.RoleCommonUser)
	} else if grant.Audience == "users" && len(grant.UserIds) > 0 && len(grant.UserIds) <= 10000 {
		query = query.Where("id IN ?", grant.UserIds)
	} else {
		return nil, errors.New("invalid coupon audience")
	}
	var ids []int
	if err := query.Order("id").Limit(100001).Pluck("id", &ids).Error; err != nil {
		return nil, err
	}
	if len(ids) == 0 || len(ids) > 100000/grant.PerUser {
		return nil, errors.New("coupon batch must contain 1 to 100000 coupons")
	}
	if grant.Audience == "users" {
		requested := slices.Clone(grant.UserIds)
		slices.Sort(requested)
		requested = slices.Compact(requested)
		if !slices.Equal(ids, requested) {
			return nil, errors.New("some coupon recipients are unavailable")
		}
	}
	return ids, nil
}

func (grant TokenPlanCouponGrant) Validate(now time.Time) error {
	if !slices.Contains([]int{1, 3, 5, 10}, grant.Multiplier) || grant.PerUser < 1 || grant.PerUser > 10 || grant.ExpiresAt <= now.Unix() || grant.ExpiresAt > now.AddDate(1, 0, 0).Unix() || len(strings.TrimSpace(grant.Reason)) == 0 || len(grant.Reason) > 512 {
		return errors.New("invalid coupon multiplier, quantity, expiry or reason")
	}
	if len(grant.RequestId) < 16 || len(grant.RequestId) > 64 {
		return errors.New("invalid issuance request ID")
	}
	return nil
}

// Snapshot recipients once. Issuance is resumable in bounded transactions; a
// batch's cursor plus unique (batch,user,ordinal) prevents double grants.
func CreateTokenPlanCouponBatch(adminId int, grant TokenPlanCouponGrant, now time.Time) (*TokenPlanCouponBatch, error) {
	if common.TokenPlanRetired {
		return nil, ErrTokenPlanRetired
	}
	var batch TokenPlanCouponBatch
	err := DB.Transaction(func(tx *gorm.DB) error {
		var admin User
		if err := lockForUpdate(tx).Select("id", "role", "status").First(&admin, adminId).Error; err != nil {
			return err
		}
		if admin.Status != common.UserStatusEnabled || admin.Role < common.RoleAdminUser {
			return errors.New("administrator required")
		}
		err := tx.Where("admin_id = ? AND request_id = ?", adminId, grant.RequestId).First(&batch).Error
		if err == nil {
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if err := grant.Validate(now); err != nil {
			return err
		}
		recipients, err := TokenPlanCouponRecipients(tx, grant)
		if err != nil {
			return err
		}
		if grant.Audience == "all" && grant.AudienceDigest != TokenPlanCouponAudienceDigest(recipients) {
			return errors.New("recipients changed; preview issuance again")
		}
		data, err := common.Marshal(recipients)
		if err != nil {
			return err
		}
		batch = TokenPlanCouponBatch{AdminId: adminId, RequestId: grant.RequestId, Multiplier: grant.Multiplier, PerUser: grant.PerUser, ExpiresAt: grant.ExpiresAt, Reason: strings.TrimSpace(grant.Reason), Audience: grant.Audience, Recipients: string(data), RecipientCount: len(recipients), CreatedAt: now.Unix(), Status: "issuing"}
		return tx.Create(&batch).Error
	})
	return &batch, err
}

func ContinueTokenPlanCouponBatch(batchId int) (*TokenPlanCouponBatch, error) {
	if common.TokenPlanRetired {
		return nil, ErrTokenPlanRetired
	}
	var batch TokenPlanCouponBatch
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).First(&batch, batchId).Error; err != nil {
			return err
		}
		if batch.Status != "issuing" {
			return nil
		}
		var ids []int
		if err := common.UnmarshalJsonStr(batch.Recipients, &ids); err != nil {
			return err
		}
		total := batch.RecipientCount * batch.PerUser
		if batch.PerUser < 1 || batch.PerUser > 10 || total > 100000 || len(ids) != batch.RecipientCount || batch.IssuedCount < 0 || batch.IssuedCount > total {
			return errors.New("invalid issuance snapshot")
		}
		end := min(total, batch.IssuedCount+1000)
		coupons := make([]TokenPlanResetCoupon, 0, end-batch.IssuedCount)
		for n := batch.IssuedCount; n < end; n++ {
			coupons = append(coupons, TokenPlanResetCoupon{BatchId: batch.Id, UserId: ids[n/batch.PerUser], Ordinal: n % batch.PerUser, Multiplier: batch.Multiplier, ExpiresAt: batch.ExpiresAt, Status: "available"})
		}
		if len(coupons) > 0 {
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).CreateInBatches(&coupons, 200).Error; err != nil {
				return err
			}
		}
		batch.IssuedCount = end
		if end == total {
			batch.Status = "complete"
		}
		return tx.Model(&batch).Updates(map[string]any{"issued_count": end, "status": batch.Status}).Error
	})
	return &batch, err
}

// Issued coupons keep their expiry; voiding never reverses an active cycle.
func VoidTokenPlanCouponBatch(batchId int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var batch TokenPlanCouponBatch
		if err := lockForUpdate(tx).First(&batch, batchId).Error; err != nil {
			return err
		}
		if err := tx.Model(&batch).UpdateColumn("status", "voided").Error; err != nil {
			return err
		}
		return tx.Model(&TokenPlanResetCoupon{}).Where("batch_id = ? AND status = ?", batchId, "available").UpdateColumn("status", "voided").Error
	})
}

func couponResetContext(tx *gorm.DB, userId, couponId int, now time.Time) (*User, *TokenPlanAccount, *TokenPlanResetCoupon, *TokenPlanWeek, int64, error) {
	var user User
	var account TokenPlanAccount
	var coupon TokenPlanResetCoupon
	if err := lockForUpdate(tx).First(&user, userId).Error; err != nil {
		return nil, nil, nil, nil, 0, err
	}
	if user.Status != common.UserStatusEnabled {
		return nil, nil, nil, nil, 0, errors.New("user is disabled")
	}
	if err := tx.Where("user_id = ?", userId).First(&account).Error; err != nil {
		return nil, nil, nil, nil, 0, err
	}
	if err := lockForUpdate(tx).Where("id = ? AND user_id = ?", couponId, userId).First(&coupon).Error; err != nil {
		return nil, nil, nil, nil, 0, err
	}
	if coupon.Status != "available" || coupon.ExpiresAt <= now.Unix() {
		return nil, nil, nil, nil, 0, errors.New("coupon is unavailable or expired")
	}
	var token Token
	if err := tx.Where("id = ? AND user_id = ? AND token_plan = ? AND status = ?", account.TokenId, userId, true, common.TokenStatusEnabled).First(&token).Error; err != nil {
		return nil, nil, nil, nil, 0, err
	}
	total, err := tokenPlanCycleQuota(CalculateUsageLevel(user.LevelQuota, operation_setting.GetUsageLevelThresholds()).Level, coupon.Multiplier)
	if err != nil {
		return nil, nil, nil, nil, 0, err
	}
	if total <= 0 {
		return nil, nil, nil, nil, 0, errors.New("unlock LV1 before using a reset coupon")
	}
	week, err := currentTokenPlanWeek(tx, &account, now)
	return &user, &account, &coupon, week, total, err
}

func PreviewTokenPlanReset(userId, couponId int, now time.Time) (*TokenPlanResetOperation, error) {
	if common.TokenPlanRetired {
		return nil, ErrTokenPlanRetired
	}
	var operation TokenPlanResetOperation
	err := DB.Transaction(func(tx *gorm.DB) error {
		user, _, coupon, week, total, err := couponResetContext(tx, userId, couponId, now)
		if err != nil {
			return err
		}
		oldTotal, err := tokenPlanCycleQuota(CalculateUsageLevel(user.LevelQuota, operation_setting.GetUsageLevelThresholds()).Level, max(1, week.Multiplier))
		if err != nil {
			return err
		}
		operation = TokenPlanResetOperation{Id: common.GetUUID(), UserId: userId, CouponId: coupon.Id, ExpectedWeekId: week.Id, OldRemaining: max(0, oldTotal-week.UsedQuota), OldMultiplier: max(1, week.Multiplier), NewMultiplier: coupon.Multiplier, NewTotal: total, ExpiresAt: now.Unix() + 300, ResetsAt: now.Unix() + tokenPlanCycleSeconds, Status: "ready"}
		return tx.Create(&operation).Error
	})
	return &operation, err
}

func UseTokenPlanReset(userId int, operationId string, confirmed bool, now time.Time) (*TokenPlanResetOperation, error) {
	if common.TokenPlanRetired {
		return nil, ErrTokenPlanRetired
	}
	if !confirmed {
		return nil, errors.New("confirm the loss of the old cycle and multiplier")
	}
	var result TokenPlanResetOperation
	err := DB.Transaction(func(tx *gorm.DB) error {
		// Match the common user -> coupon -> operation -> ledger lock order.
		var user User
		if err := lockForUpdate(tx).Select("id", "status").First(&user, userId).Error; err != nil {
			return err
		}
		if user.Status != common.UserStatusEnabled {
			return errors.New("user is disabled")
		}
		if err := tx.Where("id = ? AND user_id = ?", operationId, userId).First(&result).Error; err != nil {
			return err
		}
		if result.Status == "succeeded" {
			return nil
		}
		currentUser, account, coupon, oldWeek, total, err := couponResetContext(tx, userId, result.CouponId, now)
		if err != nil {
			return err
		}
		if err := lockForUpdate(tx).Where("id = ? AND user_id = ?", operationId, userId).First(&result).Error; err != nil {
			return err
		}
		if result.Status == "succeeded" {
			return nil
		}
		oldTotal, err := tokenPlanCycleQuota(CalculateUsageLevel(currentUser.LevelQuota, operation_setting.GetUsageLevelThresholds()).Level, max(1, oldWeek.Multiplier))
		if err != nil {
			return err
		}
		if result.OldRemaining != max(0, oldTotal-oldWeek.UsedQuota) {
			return errors.New("remaining quota changed; review the reset again")
		}
		if result.Status != "ready" || result.ExpiresAt <= now.Unix() || result.ExpectedWeekId != oldWeek.Id || result.NewTotal != total {
			return errors.New("reset preview changed or expired; review it again")
		}
		week := TokenPlanWeek{UserId: userId, WeekStart: -int64(coupon.Id), CycleStart: now.Unix(), CycleEnd: now.Unix() + tokenPlanCycleSeconds, Multiplier: coupon.Multiplier}
		if err := tx.Create(&week).Error; err != nil {
			return err
		}
		changed := tx.Model(coupon).Where("status = ?", "available").Updates(map[string]any{"status": "used", "used_at": now.Unix(), "week_id": week.Id})
		if changed.Error != nil {
			return changed.Error
		}
		if changed.RowsAffected != 1 {
			return errors.New("coupon already used")
		}
		if err := tx.Model(account).Updates(map[string]any{"cycle_anchor": now.Unix(), "current_week_id": week.Id}).Error; err != nil {
			return err
		}
		result.Status, result.WeekId, result.ResetsAt = "succeeded", week.Id, week.CycleEnd
		return tx.Model(&result).Updates(map[string]any{"status": result.Status, "week_id": week.Id, "resets_at": week.CycleEnd}).Error
	})
	return &result, err
}

// autoResetTokenPlanCoupon performs what a confirmed manual reset does, chosen
// by the server for an opt-in account whose cycle is empty: the earliest
// expiry wins, then the lowest multiplier, then the lowest ID. The caller holds
// the user row lock inside its own transaction, so a concurrent request cannot
// spend the same coupon, and a failed admission leaves every coupon untouched.
func autoResetTokenPlanCoupon(tx *gorm.DB, user *User, account *TokenPlanAccount, current *TokenPlanWeek, now time.Time) (*TokenPlanWeek, int64, *TokenPlanResetOperation, error) {
	var coupon TokenPlanResetCoupon
	err := lockForUpdate(tx).Where("user_id = ? AND status = ? AND expires_at > ?", user.Id, "available", now.Unix()).Order("expires_at, multiplier, id").First(&coupon).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, 0, nil, ErrTokenPlanNoCoupon
	}
	if err != nil {
		return nil, 0, nil, err
	}
	var token Token
	if err := tx.Where("id = ? AND user_id = ? AND token_plan = ? AND status = ?", account.TokenId, user.Id, true, common.TokenStatusEnabled).First(&token).Error; err != nil {
		return nil, 0, nil, err
	}
	level := CalculateUsageLevel(user.LevelQuota, operation_setting.GetUsageLevelThresholds()).Level
	total, err := tokenPlanCycleQuota(level, coupon.Multiplier)
	if err != nil {
		return nil, 0, nil, err
	}
	// LV0 has no allowance to reset, so the coupon must stay unspent.
	if total <= 0 {
		return nil, 0, nil, ErrTokenPlanNoCoupon
	}
	oldTotal, err := tokenPlanCycleQuota(level, max(1, current.Multiplier))
	if err != nil {
		return nil, 0, nil, err
	}
	week := TokenPlanWeek{UserId: user.Id, WeekStart: -int64(coupon.Id), CycleStart: now.Unix(), CycleEnd: now.Unix() + tokenPlanCycleSeconds, Multiplier: coupon.Multiplier}
	if err := tx.Create(&week).Error; err != nil {
		return nil, 0, nil, err
	}
	changed := tx.Model(&coupon).Where("status = ?", "available").Updates(map[string]any{"status": "used", "used_at": now.Unix(), "week_id": week.Id})
	if changed.Error != nil {
		return nil, 0, nil, changed.Error
	}
	if changed.RowsAffected != 1 {
		return nil, 0, nil, errors.New("coupon already used")
	}
	operation := TokenPlanResetOperation{Id: common.GetUUID(), UserId: user.Id, CouponId: coupon.Id, ExpectedWeekId: current.Id, OldRemaining: max(0, oldTotal-current.UsedQuota), OldMultiplier: max(1, current.Multiplier), NewTotal: total, NewMultiplier: coupon.Multiplier, ResetsAt: week.CycleEnd, WeekId: week.Id, Status: "succeeded", Auto: true}
	if err := tx.Create(&operation).Error; err != nil {
		return nil, 0, nil, err
	}
	if err := tx.Model(account).Updates(map[string]any{"cycle_anchor": now.Unix(), "current_week_id": week.Id}).Error; err != nil {
		return nil, 0, nil, err
	}
	return &week, total, &operation, nil
}

func TokenPlanResetOperationStatus(userId int, id string) (*TokenPlanResetOperation, error) {
	var operation TokenPlanResetOperation
	err := DB.Where("id = ? AND user_id = ?", id, userId).First(&operation).Error
	return &operation, err
}

func ListTokenPlanCoupons(userId, batchId, offset, limit int, now time.Time) ([]TokenPlanResetCoupon, int64, error) {
	query := DB.Model(&TokenPlanResetCoupon{})
	if userId > 0 {
		query = query.Where("user_id = ?", userId)
	}
	if batchId > 0 {
		query = query.Where("batch_id = ?", batchId)
	}
	var count int64
	if err := query.Count(&count).Error; err != nil {
		return nil, 0, err
	}
	var rows []TokenPlanResetCoupon
	err := query.Order(fmt.Sprintf("CASE WHEN status = 'available' AND expires_at > %d THEN 0 ELSE 1 END", now.Unix())).Order("expires_at, id").Offset(max(0, offset)).Limit(min(100, max(1, limit))).Find(&rows).Error
	for i := range rows {
		if rows[i].Status == "available" && rows[i].ExpiresAt <= now.Unix() {
			rows[i].Status = "expired"
		}
	}
	return rows, count, err
}

// Pending arrivals are owned, still usable and never acknowledged. Listing
// them is a cheap read; the caller presents one coupon at a time.
// MigrateTokenPlanCouponAcknowledgements repairs coupons issued before the
// arrival notice existed. SQLite cannot turn a populated table's column into
// NOT NULL, and an upgrade that only adds the column leaves it NULL there and
// on MySQL/PostgreSQL, so every old coupon would silently stay unannounced.
func MigrateTokenPlanCouponAcknowledgements(db *gorm.DB) error {
	return db.Model(&TokenPlanResetCoupon{}).
		Where("acknowledged_at IS NULL").
		UpdateColumn("acknowledged_at", 0).Error
}

func ListPendingTokenPlanCoupons(userId int, now time.Time) ([]TokenPlanResetCoupon, error) {
	var rows []TokenPlanResetCoupon
	err := DB.Where("user_id = ? AND status = ? AND acknowledged_at = 0 AND expires_at > ?", userId, "available", now.Unix()).
		Order("expires_at, id").
		Limit(20).
		Find(&rows).Error
	return rows, err
}

// Acknowledging only marks the arrival notice as seen. It never consumes the
// coupon, touches the ledger or extends the expiry, and repeating it is a no-op.
func AcknowledgeTokenPlanCoupons(userId int, couponIds []int, now time.Time) (int64, error) {
	if len(couponIds) == 0 {
		return 0, nil
	}
	// Ids the account does not own, and coupons signed for already, are simply
	// left alone, so a repeated tap stays harmless.
	result := DB.Model(&TokenPlanResetCoupon{}).
		Where("user_id = ? AND id IN ? AND acknowledged_at = 0", userId, couponIds).
		UpdateColumn("acknowledged_at", now.Unix())
	return result.RowsAffected, result.Error
}

// Bind all-user confirmation to its displayed recipient snapshot.
func TokenPlanCouponAudienceDigest(ids []int) string {
	data, _ := common.Marshal(ids)
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}
