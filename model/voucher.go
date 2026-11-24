package model

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// A voucher is money an administrator handed out that its owner still has to
// open. Until it is opened nothing has moved: the face value is in no wallet,
// so an unopened voucher that lapses costs the site nothing.
const (
	VoucherStatusUnopened = "unopened"
	VoucherStatusOpened   = "opened"
	VoucherStatusExpired  = "expired"

	VoucherSourceAdmin        = "admin"
	VoucherSourceLegacyCoupon = "legacy_coupon"
	VoucherSourceLegacyQuota  = "legacy_quota"
	VoucherSourceReferral     = "referral"
)

// Vouchers are opened one batch at a time: a single card, or everything the
// owner still holds in one go.
const (
	MaxVouchersPerOpen = 50

	minVoucherFaceValueYuan = 1
	maxVoucherFaceValueYuan = 1000
	minVoucherValidityDays  = 1
	maxVoucherValidityDays  = 365
	maxVoucherRecipients    = 10000
)

var (
	ErrVoucherNotFound    = errors.New("voucher not found")
	ErrVoucherOpenLimit   = errors.New("open 1 to 50 vouchers at a time")
	ErrVoucherUnavailable = errors.New("voucher is not available")
)

// Voucher keeps its face value in internal quota units. The exchange rate can
// change after issuance, so the value is frozen from yuan at grant time and a
// later rate change never reprices an outstanding voucher.
type Voucher struct {
	Id             int64  `json:"id" gorm:"primaryKey"`
	UserId         int    `json:"user_id" gorm:"index;not null"`
	FaceValue      int64  `json:"face_value" gorm:"not null"`
	Status         string `json:"status" gorm:"size:16;not null;index"`
	ExpiresAt      int64  `json:"expires_at" gorm:"not null;index"`
	OpenedAt       int64  `json:"opened_at"`
	AcknowledgedAt int64  `json:"acknowledged_at"`
	BatchId        int64  `json:"batch_id" gorm:"index"`
	// Source: admin / legacy_coupon / legacy_quota / referral
	Source    string `json:"source" gorm:"size:16;not null"`
	CreatedAt int64  `json:"created_at" gorm:"not null"`
	// Reason is why the money arrived, copied from the grant that issued the
	// voucher so the arrival notice can say it. It lives on the batch, not on
	// the voucher, and is never written back to this table.
	Reason string `json:"reason,omitempty" gorm:"-"`
}

// VoucherBatch records one administrator grant. RequestId makes the grant
// idempotent: a resubmitted form returns the batch already issued instead of
// handing out a second voucher.
type VoucherBatch struct {
	Id             int64   `json:"id" gorm:"primaryKey"`
	AdminId        int     `json:"admin_id" gorm:"uniqueIndex:idx_voucher_batch_request;not null"`
	RequestId      string  `json:"request_id" gorm:"size:64;uniqueIndex:idx_voucher_batch_request;not null"`
	FaceValue      int64   `json:"face_value" gorm:"not null"`
	FaceValueYuan  float64 `json:"face_value_yuan"`
	ValidityDays   int     `json:"validity_days"`
	ExpiresAt      int64   `json:"expires_at"`
	Reason         string  `json:"reason" gorm:"size:512"`
	Audience       string  `json:"audience" gorm:"size:16"`
	RecipientCount int     `json:"recipient_count"`
	CreatedAt      int64   `json:"created_at"`
	Status         string  `json:"status" gorm:"size:16"`
}

// VoucherGrant is one administrator submission: the same face value and expiry
// for every recipient.
type VoucherGrant struct {
	RequestId string `json:"request_id"`
	// Audience is "users" for the named accounts and "all" for every enabled
	// ordinary account. Naming accounts without an audience means "users";
	// reaching everyone must always be asked for explicitly.
	Audience       string  `json:"audience"`
	UserIds        []int   `json:"user_ids"`
	FaceValueYuan  float64 `json:"face_value_yuan"`
	ValidityDays   int     `json:"validity_days"`
	Reason         string  `json:"reason"`
	AudienceDigest string  `json:"audience_digest"`
}

// VoucherOpenResult reports what one opening did. A repeated request reports
// the same vouchers as skipped and credits nothing.
type VoucherOpenResult struct {
	Opened      []int64 `json:"opened"`
	Skipped     []int64 `json:"skipped"`
	OpenedQuota int64   `json:"opened_quota"`
	Balance     int64   `json:"balance"`
}

// VoucherFaceValueFromYuan freezes a yuan amount into quota with the exchange
// rate in force right now, matching how the console renders wallet amounts.
func VoucherFaceValueFromYuan(yuan float64) (int64, error) {
	if math.IsNaN(yuan) || math.IsInf(yuan, 0) || yuan <= 0 {
		return 0, errors.New("invalid voucher face value")
	}
	rate := operation_setting.USDExchangeRate
	if math.IsNaN(rate) || math.IsInf(rate, 0) || rate <= 0 {
		return 0, errors.New("invalid exchange rate")
	}
	usd := decimal.NewFromFloat(yuan).Div(decimal.NewFromFloat(rate))
	value, err := common.WalletQuotaFromDecimalStrict(usd.Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
	if err != nil {
		return 0, err
	}
	if value <= 0 {
		return 0, errors.New("voucher face value rounds down to nothing")
	}
	return int64(value), nil
}

// AudienceOrDefault normalizes a submission: naming accounts means "users", and
// only an explicit "all" reaches every account.
func (grant VoucherGrant) AudienceOrDefault() string {
	if grant.Audience == "" && len(grant.UserIds) > 0 {
		return "users"
	}
	return grant.Audience
}

func (grant VoucherGrant) Validate(now time.Time) error {
	if math.IsNaN(grant.FaceValueYuan) || grant.FaceValueYuan < minVoucherFaceValueYuan || grant.FaceValueYuan > maxVoucherFaceValueYuan {
		return fmt.Errorf("face value must be %d to %d yuan", minVoucherFaceValueYuan, maxVoucherFaceValueYuan)
	}
	// A whole-yuan face keeps a voucher readable as money; the console already
	// only offers whole amounts, and the API must not be the weaker guard.
	if grant.FaceValueYuan != math.Trunc(grant.FaceValueYuan) {
		return errors.New("face value must be a whole number of yuan")
	}
	if grant.ValidityDays < minVoucherValidityDays || grant.ValidityDays > maxVoucherValidityDays {
		return fmt.Errorf("validity must be %d to %d days", minVoucherValidityDays, maxVoucherValidityDays)
	}
	if len(strings.TrimSpace(grant.Reason)) == 0 || len(grant.Reason) > 512 {
		return errors.New("invalid voucher reason")
	}
	if len(grant.RequestId) < 16 || len(grant.RequestId) > 64 {
		return errors.New("invalid issuance request ID")
	}
	switch grant.AudienceOrDefault() {
	case "all":
	case "users":
		if len(grant.UserIds) == 0 || len(grant.UserIds) > maxVoucherRecipients {
			return fmt.Errorf("grant 1 to %d accounts at a time", maxVoucherRecipients)
		}
	default:
		return errors.New("invalid voucher audience")
	}
	return nil
}

// VoucherRecipients resolves the audience. It does not check the snapshot: a
// preview has to resolve the audience in order to produce one.
func VoucherRecipients(tx *gorm.DB, grant VoucherGrant) ([]int, error) {
	if grant.AudienceOrDefault() == "users" {
		requested := slices.Clone(grant.UserIds)
		slices.Sort(requested)
		requested = slices.Compact(requested)
		if len(requested) == 0 || len(requested) > maxVoucherRecipients || requested[0] <= 0 {
			return nil, fmt.Errorf("grant 1 to %d accounts at a time", maxVoucherRecipients)
		}
		var available []int
		err := tx.Model(&User{}).
			Where("id IN ? AND status = ?", requested, common.UserStatusEnabled).
			Order("id").
			Pluck("id", &available).Error
		if err != nil {
			return nil, err
		}
		if !slices.Equal(available, requested) {
			return nil, errors.New("some voucher recipients are unavailable")
		}
		return available, nil
	}
	if grant.AudienceOrDefault() != "all" {
		return nil, errors.New("invalid voucher audience")
	}
	var ids []int
	err := tx.Model(&User{}).
		Where("status = ? AND role = ?", common.UserStatusEnabled, common.RoleCommonUser).
		Order("id").
		Limit(maxVoucherRecipients+1).
		Pluck("id", &ids).Error
	if err != nil {
		return nil, err
	}
	if len(ids) == 0 || len(ids) > maxVoucherRecipients {
		return nil, fmt.Errorf("a voucher batch must reach 1 to %d accounts", maxVoucherRecipients)
	}
	return ids, nil
}

// verifyAudience holds the resolved recipients to the snapshot the
// administrator confirmed. Granting everyone always needs one, so a grant can
// never reach accounts that were not on the reviewed list; a named audience
// only checks one when it was sent.
func (grant VoucherGrant) verifyAudience(recipients []int) error {
	if grant.AudienceDigest == "" && grant.AudienceOrDefault() != "all" {
		return nil
	}
	if grant.AudienceDigest != VoucherAudienceDigest(recipients) {
		return errors.New("recipients changed; preview issuance again")
	}
	return nil
}

// VoucherAudienceDigest binds a confirmed "everyone" grant to the recipient list
// the administrator was shown.
func VoucherAudienceDigest(ids []int) string {
	data, _ := common.Marshal(ids)
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

// PreviewVoucherGrant reports what a grant would hand out, writing nothing.
func PreviewVoucherGrant(grant VoucherGrant, now time.Time) (map[string]any, error) {
	if err := grant.Validate(now); err != nil {
		return nil, err
	}
	faceValue, err := VoucherFaceValueFromYuan(grant.FaceValueYuan)
	if err != nil {
		return nil, err
	}
	recipients, err := VoucherRecipients(DB, grant)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"recipients":       len(recipients),
		"vouchers":         len(recipients),
		"face_value":       faceValue,
		"total_face_value": faceValue * int64(len(recipients)),
		"face_value_yuan":  grant.FaceValueYuan,
		"total_yuan":       grant.FaceValueYuan * float64(len(recipients)),
		"expires_at":       now.AddDate(0, 0, grant.ValidityDays).Unix(),
		"audience_digest":  VoucherAudienceDigest(recipients),
	}, nil
}

// CreateVoucherBatch issues one voucher per recipient. The batch row and every
// voucher commit together, and the request ID makes a resubmitted grant return
// the batch that already exists.
func CreateVoucherBatch(adminId int, grant VoucherGrant, now time.Time) (*VoucherBatch, error) {
	if err := grant.Validate(now); err != nil {
		return nil, err
	}
	faceValue, err := VoucherFaceValueFromYuan(grant.FaceValueYuan)
	if err != nil {
		return nil, err
	}
	var batch VoucherBatch
	err = DB.Transaction(func(tx *gorm.DB) error {
		var admin User
		if err := lockUserRow(tx, adminId); err != nil {
			return err
		}
		if err := tx.Select("id", "role", "status").First(&admin, adminId).Error; err != nil {
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
		recipients, err := VoucherRecipients(tx, grant)
		if err != nil {
			return err
		}
		if err := grant.verifyAudience(recipients); err != nil {
			return err
		}
		batch = VoucherBatch{
			AdminId:        adminId,
			RequestId:      grant.RequestId,
			FaceValue:      faceValue,
			FaceValueYuan:  grant.FaceValueYuan,
			ValidityDays:   grant.ValidityDays,
			ExpiresAt:      now.AddDate(0, 0, grant.ValidityDays).Unix(),
			Reason:         strings.TrimSpace(grant.Reason),
			Audience:       grant.AudienceOrDefault(),
			RecipientCount: len(recipients),
			CreatedAt:      now.Unix(),
			Status:         "complete",
		}
		if err := tx.Create(&batch).Error; err != nil {
			return err
		}
		vouchers := make([]Voucher, 0, len(recipients))
		for _, userId := range recipients {
			vouchers = append(vouchers, Voucher{
				UserId:    userId,
				FaceValue: faceValue,
				Status:    VoucherStatusUnopened,
				ExpiresAt: batch.ExpiresAt,
				BatchId:   batch.Id,
				Source:    VoucherSourceAdmin,
				CreatedAt: now.Unix(),
			})
		}
		return tx.CreateInBatches(&vouchers, 200).Error
	})
	if err != nil {
		return nil, err
	}
	return &batch, nil
}

// OpenVouchers turns one batch of the owner's vouchers into wallet balance.
//
// The user row is locked for the whole transaction, so two openings cannot
// credit the same voucher twice, and every voucher is re-checked inside that
// lock: an already opened one is skipped, and one whose deadline passed before
// the hourly sweep reached it is lapsed instead of paid out.
//
// The credit goes through CreditGiftQuota, which raises quota and bonus_quota
// together. That is what keeps a voucher from buying usage levels: the money is
// recorded as a gift, so spending it never reaches level_quota.
func OpenVouchers(userId int, voucherIds []int64, now time.Time) (*VoucherOpenResult, error) {
	ids := slices.Clone(voucherIds)
	slices.Sort(ids)
	ids = slices.Compact(ids)
	if len(ids) == 0 || len(ids) > MaxVouchersPerOpen || ids[0] <= 0 {
		return nil, ErrVoucherOpenLimit
	}
	result := &VoucherOpenResult{Opened: []int64{}, Skipped: []int64{}}
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockUserRow(tx, userId); err != nil {
			return err
		}
		var user User
		if err := tx.Select("id", "quota", "status").First(&user, userId).Error; err != nil {
			return err
		}
		if user.Status != common.UserStatusEnabled {
			return errors.New("user is disabled")
		}
		var vouchers []Voucher
		if err := lockForUpdate(tx).Where("user_id = ? AND id IN ?", userId, ids).Order("id").Find(&vouchers).Error; err != nil {
			return err
		}
		if len(vouchers) != len(ids) {
			return ErrVoucherNotFound
		}
		var total int64
		for i := range vouchers {
			voucher := &vouchers[i]
			switch {
			case voucher.Status == VoucherStatusUnopened && voucher.ExpiresAt > now.Unix():
				total += voucher.FaceValue
				result.Opened = append(result.Opened, voucher.Id)
			case voucher.Status == VoucherStatusUnopened:
				// The sweep runs hourly, so a voucher can lapse between two
				// runs. Lapsing it here keeps it out of the wallet right away.
				if err := tx.Model(voucher).UpdateColumn("status", VoucherStatusExpired).Error; err != nil {
					return err
				}
				result.Skipped = append(result.Skipped, voucher.Id)
			default:
				result.Skipped = append(result.Skipped, voucher.Id)
			}
		}
		result.Balance = int64(user.Quota)
		if total == 0 {
			return nil
		}
		changed := tx.Model(&Voucher{}).
			Where("user_id = ? AND id IN ? AND status = ?", userId, result.Opened, VoucherStatusUnopened).
			Updates(map[string]any{"status": VoucherStatusOpened, "opened_at": now.Unix()})
		if changed.Error != nil {
			return changed.Error
		}
		if changed.RowsAffected != int64(len(result.Opened)) {
			return ErrVoucherUnavailable
		}
		if err := CreditGiftQuota(tx, userId, int(total)); err != nil {
			return err
		}
		result.OpenedQuota = total
		result.Balance = int64(user.Quota) + total
		return nil
	})
	if err != nil {
		return nil, err
	}
	if result.OpenedQuota > 0 {
		syncCreditUserQuotaCache(userId, int(result.OpenedQuota), "voucher opening")
		recordVoucherOpenAdd(userId, result)
	}
	return result, nil
}

// recordVoucherOpenAdd writes the quota-addition entry the finance report reads.
// reason=voucher is not a paid reason, so the opened money lands on the gift
// side of the income summary instead of reading as a top-up.
func recordVoucherOpenAdd(userId int, result *VoucherOpenResult) {
	RecordLogWithAdminInfo(userId, LogTypeTopup,
		fmt.Sprintf("Opened vouchers: %d", result.OpenedQuota), nil,
		&AuditOperation{Action: AuditActionUserQuotaAdd, Params: AuditFields{
			"quota":       result.OpenedQuota,
			"reason":      QuotaAddReasonVoucher,
			"voucher_ids": result.Opened,
		}})
}

// ExpireVouchers lapses every voucher whose deadline passed. Only unopened ones
// change, so running it again is harmless.
func ExpireVouchers(now time.Time) (int64, error) {
	result := DB.Model(&Voucher{}).
		Where("status = ? AND expires_at <= ?", VoucherStatusUnopened, now.Unix()).
		UpdateColumn("status", VoucherStatusExpired)
	return result.RowsAffected, result.Error
}

// ListPendingVouchers returns the unopened, unexpired vouchers the arrival
// notice has not shown yet. Opening one is not the same as having seen it: the
// console acknowledges them when the notice closes.
func ListPendingVouchers(userId int, now time.Time) ([]Voucher, error) {
	var rows []Voucher
	err := DB.Where("user_id = ? AND status = ? AND acknowledged_at = 0 AND expires_at > ?",
		userId, VoucherStatusUnopened, now.Unix()).
		Order("expires_at, id").
		Limit(MaxVouchersPerOpen).
		Find(&rows).Error
	if err != nil {
		return rows, err
	}
	return rows, fillVoucherReasons(rows)
}

// fillVoucherReasons copies each grant's reason onto the vouchers it issued.
// One grant is one batch and one reason, so a notice that spans several grants
// explains each arrival instead of repeating a bare "voucher" label.
func fillVoucherReasons(vouchers []Voucher) error {
	batchIds := make([]int64, 0, len(vouchers))
	for _, voucher := range vouchers {
		if voucher.BatchId > 0 {
			batchIds = append(batchIds, voucher.BatchId)
		}
	}
	if len(batchIds) == 0 {
		return nil
	}
	var batches []VoucherBatch
	if err := DB.Select("id", "reason").Where("id IN ?", batchIds).Find(&batches).Error; err != nil {
		return err
	}
	reasons := make(map[int64]string, len(batches))
	for _, batch := range batches {
		reasons[batch.Id] = strings.TrimSpace(batch.Reason)
	}
	for i := range vouchers {
		vouchers[i].Reason = reasons[vouchers[i].BatchId]
	}
	return nil
}

// ListVouchers returns one page of the owner's vouchers, still usable first.
func ListVouchers(userId, offset, limit int, now time.Time) ([]Voucher, int64, error) {
	query := DB.Model(&Voucher{}).Where("user_id = ?", userId)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []Voucher
	err := query.
		Order(fmt.Sprintf("CASE WHEN status = '%s' AND expires_at > %d THEN 0 ELSE 1 END", VoucherStatusUnopened, now.Unix())).
		Order("expires_at, id").
		Offset(max(0, offset)).
		Limit(min(100, max(1, limit))).
		Find(&rows).Error
	// The sweep runs hourly, so a voucher whose deadline just passed is already
	// worthless and must not read as unopened while waiting for it.
	for i := range rows {
		if rows[i].Status == VoucherStatusUnopened && rows[i].ExpiresAt <= now.Unix() {
			rows[i].Status = VoucherStatusExpired
		}
	}
	return rows, total, err
}

// AcknowledgeVouchers marks the arrival notice as seen. It never opens, spends
// or extends a voucher, and repeating it changes nothing.
func AcknowledgeVouchers(userId int, voucherIds []int64, now time.Time) (int64, error) {
	if len(voucherIds) == 0 {
		return 0, nil
	}
	// Only an opened voucher may be marked as seen. Acknowledging a sealed one
	// would drop it out of /pending, and the notice is the only place that can
	// open it, so that money would be stranded until it lapsed.
	result := DB.Model(&Voucher{}).
		Where("user_id = ? AND id IN ? AND acknowledged_at = 0 AND status = ?",
			userId, voucherIds, VoucherStatusOpened).
		UpdateColumn("acknowledged_at", now.Unix())
	return result.RowsAffected, result.Error
}

// ListVoucherBatches returns one page of administrator grants, newest first.
func ListVoucherBatches(offset, limit int) ([]VoucherBatch, int64, error) {
	var total int64
	if err := DB.Model(&VoucherBatch{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []VoucherBatch
	err := DB.Order("id DESC").
		Offset(max(0, offset)).
		Limit(min(100, max(1, limit))).
		Find(&rows).Error
	return rows, total, err
}
