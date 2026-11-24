package model

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Referral rewards are fixed by product decision and paid in vouchers. The
// inviter climbs a ladder: the first three successfully rewarded invitations pay
// 1, 3 and 5 yuan, every later one pays 1 yuan. The invitee always receives 3
// yuan. Every voucher is valid for 30 days from the moment it is issued and has
// to be opened in the wallet before it becomes balance.
const (
	// ReferralLadderStartIDOption excludes existing referrals from a new
	// promotion round without deleting attribution, rewards or vouchers.
	ReferralLadderStartIDOption = "referral_setting.ladder_start_id"
	ReferralInviteeRewardYuan   = 3
	referralVoucherValidityDays = 30
	referralRewardReason        = "邀请奖励"
	referralLadderSteps         = 3

	ReferralRewardPending = "pending"
	ReferralRewardIssued  = "issued"

	// ReferralBannerCampaign identifies the current promotion. Dismissing it
	// hides the banner on every logged-in page until a new campaign id ships.
	ReferralBannerCampaign = "referral-ladder-2"

	referralPendingEmailUnverified    = "email_unverified"
	referralPendingTokenPlanRetired   = "token_plan_retired"
	referralNoteInviterDisabled       = "inviter_disabled"
	referralVoucherStatusLegacyCoupon = "legacy"
)

var ErrReferralRewardNotFound = errors.New("referral reward not found")

// ReferralInviterRewardYuan maps the inviter's ordinal successful invitation to
// the ladder step in yuan. Ordinals beyond the ladder keep paying 1 yuan.
func ReferralInviterRewardYuan(ordinal int) int {
	switch ordinal {
	case 1:
		return 1
	case 2:
		return 3
	case 3:
		return 5
	default:
		return 1
	}
}

// ReferralReward is the single source of truth for one direct invitation. The
// unique invitee index makes creation idempotent, so a replayed registration or
// verification callback cannot schedule a second reward.
type ReferralReward struct {
	Id             int64  `json:"id" gorm:"primaryKey"`
	InviteeId      int    `json:"invitee_id" gorm:"uniqueIndex:idx_referral_reward_invitee;not null"`
	InviterId      int    `json:"inviter_id" gorm:"index;not null"`
	Status         string `json:"status" gorm:"size:16;not null"`
	PendingReason  string `json:"pending_reason" gorm:"size:32"`
	Note           string `json:"note" gorm:"size:64"`
	InviterOrdinal int    `json:"inviter_ordinal"`
	// InviterMultiplier and InviteeMultiplier keep their historical column
	// names and now store the reward in yuan: the ladder paid 1/3/5 before and
	// still does, so old and new rows read the same way.
	InviterMultiplier int   `json:"inviter_reward_yuan"`
	InviteeMultiplier int   `json:"invitee_reward_yuan"`
	BatchId           int   `json:"batch_id"`
	InviteeBatchId    int   `json:"invitee_batch_id"`
	InviterVoucherId  int64 `json:"inviter_voucher_id"`
	InviteeVoucherId  int64 `json:"invitee_voucher_id"`
	// InviterCouponId and InviteeCouponId only describe rewards issued before
	// vouchers replaced Token Plan reset coupons.
	InviterCouponId int   `json:"inviter_coupon_id"`
	InviteeCouponId int   `json:"invitee_coupon_id"`
	CreatedAt       int64 `json:"created_at" gorm:"not null"`
	IssuedAt        int64 `json:"issued_at"`
}

// CreateReferralReward records the attribution inside the registration
// transaction. Issuing the coupons happens afterwards so a slow reward write
// cannot fail account creation; a missing grant stays retryable.
func CreateReferralReward(tx *gorm.DB, inviterId, inviteeId int, now time.Time) error {
	if inviterId <= 0 || inviteeId <= 0 || inviterId == inviteeId {
		return nil
	}
	reward := ReferralReward{InviteeId: inviteeId, InviterId: inviterId, Status: ReferralRewardPending, CreatedAt: now.Unix()}
	return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&reward).Error
}

// referralEmailVerified is the reward gate. Accounts with an email on record
// satisfy it: password registration only stores a code-verified address, and a
// provider-supplied address counts as verified by product decision. Sites that
// do not verify email at all have no gate to enforce.
func referralEmailVerified(user *User) bool {
	if !common.EmailVerificationEnabled {
		return true
	}
	return strings.TrimSpace(user.Email) != ""
}

// ensureReferralVoucherBatch records one grant per side of an invitation. The
// request ID makes a replayed issuance return the batch that already exists
// instead of handing out a second voucher.
func ensureReferralVoucherBatch(tx *gorm.DB, requestId string, userId, rewardYuan int, now time.Time) (*VoucherBatch, error) {
	faceValue, err := VoucherFaceValueFromYuan(float64(rewardYuan))
	if err != nil {
		return nil, err
	}
	batch := VoucherBatch{
		AdminId:        0,
		RequestId:      requestId,
		FaceValue:      faceValue,
		FaceValueYuan:  float64(rewardYuan),
		ValidityDays:   referralVoucherValidityDays,
		ExpiresAt:      now.AddDate(0, 0, referralVoucherValidityDays).Unix(),
		Reason:         referralRewardReason,
		Audience:       "referral",
		RecipientCount: 1,
		CreatedAt:      now.Unix(),
		Status:         "complete",
	}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&batch).Error; err != nil {
		return nil, err
	}
	if batch.Id == 0 {
		if err := tx.Where("admin_id = ? AND request_id = ?", 0, requestId).First(&batch).Error; err != nil {
			return nil, err
		}
	}
	return &batch, nil
}

// ensureReferralVoucher keeps an already-issued voucher untouched: a replay
// returns the stored row, so neither its status nor its expiry is refreshed.
func ensureReferralVoucher(tx *gorm.DB, batch *VoucherBatch, userId int, now time.Time) (*Voucher, error) {
	var voucher Voucher
	err := tx.Where("batch_id = ? AND user_id = ?", batch.Id, userId).First(&voucher).Error
	if err == nil {
		return &voucher, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	voucher = Voucher{
		UserId:    userId,
		FaceValue: batch.FaceValue,
		Status:    VoucherStatusUnopened,
		ExpiresAt: batch.ExpiresAt,
		BatchId:   batch.Id,
		Source:    VoucherSourceReferral,
		CreatedAt: now.Unix(),
	}
	if err := tx.Create(&voucher).Error; err != nil {
		return nil, err
	}
	return &voucher, nil
}

// referralLadderStartID reads the round boundary from the primary database so
// every instance applies an operator reset immediately. Missing means the
// original round; malformed state must not silently replay the ladder.
func referralLadderStartID(tx *gorm.DB) (int64, error) {
	var option Option
	if err := tx.Where(&Option{Key: ReferralLadderStartIDOption}).Find(&option).Error; err != nil {
		return 0, err
	}
	if option.Value == "" {
		return 0, nil
	}
	startID, err := strconv.ParseInt(option.Value, 10, 64)
	if err != nil || startID < 0 {
		return 0, errors.New("invalid referral ladder round boundary")
	}
	return startID, nil
}

// referralInviterOrdinal returns the ladder position of the invitation being
// issued. Locking the inviter row serializes concurrent rewards, and the
// locking read of already-issued rewards keeps both transactions on the same
// sequence even under REPEATABLE READ.
func referralInviterOrdinal(tx *gorm.DB, inviterId int, rewardID int64) (int, error) {
	startID, err := referralLadderStartID(tx)
	if err != nil {
		return 0, err
	}
	// Old pending referrals can still receive their ordinary reward, but do
	// not consume one of the new round's three boosted invitations.
	if rewardID <= startID {
		return 0, nil
	}
	var issued []int64
	if err := lockForUpdate(tx).Model(&ReferralReward{}).
		Where("inviter_id = ? AND status = ? AND id > ?", inviterId, ReferralRewardIssued, startID).
		Pluck("id", &issued).Error; err != nil {
		return 0, err
	}
	return len(issued) + 1, nil
}

// IssueReferralReward grants both vouchers once the invitee is eligible. It is
// safe to call repeatedly: the invitee row is locked, already-issued rewards
// return unchanged, and voucher rows keep their original expiry.
func IssueReferralReward(inviteeId int, now time.Time) (*ReferralReward, error) {
	var reward ReferralReward
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where("invitee_id = ?", inviteeId).First(&reward).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrReferralRewardNotFound
			}
			return err
		}
		if reward.Status == ReferralRewardIssued {
			return nil
		}
		blocked, err := registrationRewardBlocked(tx, inviteeId)
		if err != nil {
			return err
		}
		if blocked {
			reward.PendingReason = RewardVerificationRequired
			return tx.Model(&reward).Update("pending_reason", RewardVerificationRequired).Error
		}
		var invitee User
		if err := tx.Select("id", "username", "email").First(&invitee, inviteeId).Error; err != nil {
			return err
		}
		if !referralEmailVerified(&invitee) {
			return tx.Model(&reward).Updates(map[string]any{"status": ReferralRewardPending, "pending_reason": referralPendingEmailUnverified}).Error
		}
		// A disabled or missing inviter keeps the invitee's own reward but does
		// not receive a new one, and does not consume a ladder step.
		var inviter User
		inviterAvailable := true
		if err := lockForUpdate(tx).Select("id", "status").First(&inviter, reward.InviterId).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			inviterAvailable = false
		} else if inviter.Status != common.UserStatusEnabled {
			inviterAvailable = false
		}

		inviteeBatch, err := ensureReferralVoucherBatch(tx, fmt.Sprintf("referral-i%d", inviteeId), inviteeId, ReferralInviteeRewardYuan, now)
		if err != nil {
			return err
		}
		inviteeVoucher, err := ensureReferralVoucher(tx, inviteeBatch, inviteeId, now)
		if err != nil {
			return err
		}

		ordinal, inviterYuan, inviterBatchId, inviterVoucherId, note := 0, 0, 0, int64(0), ""
		if inviterAvailable {
			ordinal, err = referralInviterOrdinal(tx, inviter.Id, reward.Id)
			if err != nil {
				return err
			}
			inviterYuan = ReferralInviterRewardYuan(ordinal)
			inviterBatch, err := ensureReferralVoucherBatch(tx, fmt.Sprintf("referral-v%d", inviteeId), inviter.Id, inviterYuan, now)
			if err != nil {
				return err
			}
			inviterVoucher, err := ensureReferralVoucher(tx, inviterBatch, inviter.Id, now)
			if err != nil {
				return err
			}
			inviterBatchId, inviterVoucherId = int(inviterBatch.Id), inviterVoucher.Id
		} else {
			note = referralNoteInviterDisabled
		}

		if err := tx.Model(&reward).Updates(map[string]any{
			"status":             ReferralRewardIssued,
			"pending_reason":     "",
			"note":               note,
			"inviter_ordinal":    ordinal,
			"inviter_multiplier": inviterYuan,
			"invitee_multiplier": ReferralInviteeRewardYuan,
			"batch_id":           inviterBatchId,
			"invitee_batch_id":   inviteeBatch.Id,
			"inviter_voucher_id": inviterVoucherId,
			"invitee_voucher_id": inviteeVoucher.Id,
			"issued_at":          now.Unix(),
		}).Error; err != nil {
			return err
		}
		reward.Status, reward.PendingReason, reward.Note = ReferralRewardIssued, "", note
		reward.InviterOrdinal, reward.InviterMultiplier = ordinal, inviterYuan
		reward.InviteeMultiplier = ReferralInviteeRewardYuan
		reward.BatchId, reward.InviteeBatchId = inviterBatchId, int(inviteeBatch.Id)
		reward.InviterVoucherId, reward.InviteeVoucherId = inviterVoucherId, inviteeVoucher.Id
		reward.IssuedAt = now.Unix()
		if !inviterAvailable {
			return nil
		}
		return countReferralInvite(tx, inviter.Id)
	})
	if err != nil {
		return nil, err
	}
	return &reward, nil
}

// countReferralInvite keeps the displayed invite count tied to a recorded,
// rewarded referral instead of the optional quota reward.
func countReferralInvite(tx *gorm.DB, inviterId int) error {
	result := tx.Model(&User{}).Where("id = ?", inviterId).UpdateColumn("aff_count", gorm.Expr("aff_count + ?", 1))
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// ReissueReferralReward is the administrator retry path. It only retries what
// the reward is still missing; an issued side is never re-created or extended.
func ReissueReferralReward(rewardId int64, now time.Time) (*ReferralReward, error) {
	var reward ReferralReward
	if err := DB.First(&reward, rewardId).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrReferralRewardNotFound
		}
		return nil, err
	}
	return IssueReferralReward(reward.InviteeId, now)
}

// ReferralBannerState returns the active campaign while it is still undismissed
// for this user, and an empty string afterwards.
func ReferralBannerState(setting dto.UserSetting) string {
	if setting.ReferralBannerDismissed == ReferralBannerCampaign {
		return ""
	}
	return ReferralBannerCampaign
}

// DismissReferralBanner remembers the campaign, so the banner stays closed on
// every device until a new campaign id ships.
func DismissReferralBanner(userId int) error {
	setting, err := GetUserSetting(userId, true)
	if err != nil {
		return err
	}
	if setting.ReferralBannerDismissed == ReferralBannerCampaign {
		return nil
	}
	setting.ReferralBannerDismissed = ReferralBannerCampaign
	return UpdateUserSetting(userId, setting)
}

type ReferralLadderStep struct {
	Ordinal    int  `json:"ordinal"`
	RewardYuan int  `json:"reward_yuan"`
	Reached    bool `json:"reached"`
	Current    bool `json:"current"`
}

type UserReferralRewardView struct {
	Id                int64  `json:"id"`
	Invitee           string `json:"invitee"`
	Status            string `json:"status"`
	PendingReason     string `json:"pending_reason"`
	CreatedAt         int64  `json:"created_at"`
	IssuedAt          int64  `json:"issued_at"`
	InviterOrdinal    int    `json:"inviter_ordinal"`
	InviterRewardYuan int    `json:"inviter_reward_yuan"`
	VoucherStatus     string `json:"voucher_status"`
	VoucherExpiresAt  int64  `json:"voucher_expires_at"`
}

type UserReferralOverview struct {
	AffCode           string                   `json:"aff_code"`
	Invites           int                      `json:"invites"`
	Rewarded          int                      `json:"rewarded"`
	Pending           int                      `json:"pending"`
	InviteeRewardYuan int                      `json:"invitee_reward_yuan"`
	NextRewardYuan    int                      `json:"next_reward_yuan"`
	AvailableVouchers int64                    `json:"available_vouchers"`
	Ladder            []ReferralLadderStep     `json:"ladder"`
	Rewards           []UserReferralRewardView `json:"rewards"`
}

type AdminReferralRewardView struct {
	Id                      int64  `json:"id"`
	InviterId               int    `json:"inviter_id"`
	InviteeId               int    `json:"invitee_id"`
	Inviter                 string `json:"inviter"`
	Invitee                 string `json:"invitee"`
	Status                  string `json:"status"`
	PendingReason           string `json:"pending_reason"`
	Note                    string `json:"note"`
	InviterOrdinal          int    `json:"inviter_ordinal"`
	InviterRewardYuan       int    `json:"inviter_reward_yuan"`
	InviteeRewardYuan       int    `json:"invitee_reward_yuan"`
	CreatedAt               int64  `json:"created_at"`
	IssuedAt                int64  `json:"issued_at"`
	InviteeVoucherStatus    string `json:"invitee_voucher_status"`
	InviterVoucherStatus    string `json:"inviter_voucher_status"`
	InviteeVoucherExpiresAt int64  `json:"invitee_voucher_expires_at"`
	InviterVoucherExpiresAt int64  `json:"inviter_voucher_expires_at"`
}

type referralVoucherState struct {
	Status    string
	ExpiresAt int64
}

// MaskReferralName hides the middle of a username: the inviter only needs to
// recognize their own referrals, not enumerate accounts.
func MaskReferralName(name string) string {
	runes := []rune(strings.TrimSpace(name))
	switch len(runes) {
	case 0:
		return ""
	case 1:
		return string(runes[0]) + "***"
	case 2:
		return string(runes[0]) + "***" + string(runes[1])
	default:
		return string(runes[0]) + "***" + string(runes[len(runes)-1])
	}
}

func referralUsernames(ids []int) (map[int]string, error) {
	names := map[int]string{}
	unique := make([]int, 0, len(ids))
	for _, id := range ids {
		if id > 0 {
			unique = append(unique, id)
		}
	}
	if len(unique) == 0 {
		return names, nil
	}
	var users []User
	if err := DB.Select("id", "username").Where("id IN ?", unique).Find(&users).Error; err != nil {
		return nil, err
	}
	for _, user := range users {
		names[user.Id] = user.Username
	}
	return names, nil
}

func referralVoucherStates(voucherIds []int64) (map[int64]referralVoucherState, error) {
	states := map[int64]referralVoucherState{}
	ids := make([]int64, 0, len(voucherIds))
	for _, id := range voucherIds {
		if id > 0 {
			ids = append(ids, id)
		}
	}
	if len(ids) == 0 {
		return states, nil
	}
	var vouchers []Voucher
	if err := DB.Where("id IN ?", ids).Find(&vouchers).Error; err != nil {
		return nil, err
	}
	for _, voucher := range vouchers {
		states[voucher.Id] = referralVoucherState{Status: voucher.Status, ExpiresAt: voucher.ExpiresAt}
	}
	return states, nil
}

// referralVoucherStatusAt reports the voucher side of one reward. A reward
// issued before vouchers replaced reset coupons keeps its own marker, because
// that coupon was converted by the voucher migration instead. A side that never
// received anything — an invitation whose inviter was disabled — stays empty so
// the console does not mistake it for a historical coupon.
func referralVoucherStatusAt(state referralVoucherState, issued, legacy bool, now time.Time) (string, int64) {
	if !issued {
		return "", 0
	}
	if legacy {
		return referralVoucherStatusLegacyCoupon, 0
	}
	if state.Status == "" {
		return "", 0
	}
	if state.Status == VoucherStatusUnopened && state.ExpiresAt > 0 && state.ExpiresAt <= now.Unix() {
		return VoucherStatusExpired, state.ExpiresAt
	}
	return state.Status, state.ExpiresAt
}

func ReferralLadder(ordinal int) []ReferralLadderStep {
	steps := make([]ReferralLadderStep, 0, referralLadderSteps+1)
	for i := 1; i <= referralLadderSteps; i++ {
		steps = append(steps, ReferralLadderStep{Ordinal: i, RewardYuan: ReferralInviterRewardYuan(i), Reached: ordinal >= i, Current: ordinal == i-1})
	}
	steps = append(steps, ReferralLadderStep{Ordinal: referralLadderSteps + 1, RewardYuan: ReferralInviterRewardYuan(referralLadderSteps + 1), Reached: ordinal >= referralLadderSteps+1, Current: ordinal >= referralLadderSteps+1})
	return steps
}

// GetUserReferralOverview powers the referral page: ladder progress, the
// caller's own voucher state and the masked reward history.
func GetUserReferralOverview(inviterId, limit int, now time.Time) (*UserReferralOverview, error) {
	var inviter User
	if err := DB.Select("id", "aff_code", "aff_count").First(&inviter, inviterId).Error; err != nil {
		return nil, err
	}
	overview := &UserReferralOverview{AffCode: inviter.AffCode, Invites: inviter.AffCount, InviteeRewardYuan: ReferralInviteeRewardYuan}
	startID, err := referralLadderStartID(DB)
	if err != nil {
		return nil, err
	}
	var rewarded, pending int64
	if err := DB.Model(&ReferralReward{}).Where("inviter_id = ? AND status = ? AND id > ?", inviterId, ReferralRewardIssued, startID).Count(&rewarded).Error; err != nil {
		return nil, err
	}
	if err := DB.Model(&ReferralReward{}).Where("inviter_id = ? AND status = ?", inviterId, ReferralRewardPending).Count(&pending).Error; err != nil {
		return nil, err
	}
	overview.Rewarded, overview.Pending = int(rewarded), int(pending)
	if startID > 0 {
		// The promotion page shows this round's progress; the lifetime
		// attribution count remains stored on the account for history.
		overview.Invites = int(rewarded)
	}
	overview.NextRewardYuan = ReferralInviterRewardYuan(int(rewarded) + 1)
	overview.Ladder = ReferralLadder(int(rewarded))

	var rows []ReferralReward
	if err := DB.Where("inviter_id = ?", inviterId).Order("id DESC").Limit(max(1, min(200, limit))).Find(&rows).Error; err != nil {
		return nil, err
	}
	names, err := referralUsernames(func() []int {
		ids := make([]int, 0, len(rows))
		for _, row := range rows {
			ids = append(ids, row.InviteeId)
		}
		return ids
	}())
	if err != nil {
		return nil, err
	}
	voucherIds := make([]int64, 0, len(rows))
	for _, row := range rows {
		voucherIds = append(voucherIds, row.InviterVoucherId)
	}
	states, err := referralVoucherStates(voucherIds)
	if err != nil {
		return nil, err
	}
	overview.Rewards = make([]UserReferralRewardView, 0, len(rows))
	for _, row := range rows {
		status, expiresAt := referralVoucherStatusAt(states[row.InviterVoucherId], row.Status == ReferralRewardIssued, row.InviterCouponId > 0, now)
		if status == VoucherStatusUnopened {
			overview.AvailableVouchers++
		}
		overview.Rewards = append(overview.Rewards, UserReferralRewardView{
			Id: row.Id, Invitee: MaskReferralName(names[row.InviteeId]), Status: row.Status,
			PendingReason: row.PendingReason, CreatedAt: row.CreatedAt, IssuedAt: row.IssuedAt,
			InviterOrdinal: row.InviterOrdinal, InviterRewardYuan: row.InviterMultiplier,
			VoucherStatus: status, VoucherExpiresAt: expiresAt,
		})
	}
	return overview, nil
}

// ListAdminReferralRewards exposes the full relation for review, including a
// status filter for pending or disabled-inviter anomalies.
func ListAdminReferralRewards(status string, offset, limit int, now time.Time) ([]AdminReferralRewardView, int64, error) {
	query := DB.Model(&ReferralReward{})
	switch status {
	case ReferralRewardPending, ReferralRewardIssued:
		query = query.Where("status = ?", status)
	case "abnormal":
		query = query.Where("status = ? OR note <> ''", ReferralRewardPending)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []ReferralReward
	if err := query.Order("id DESC").Offset(max(0, offset)).Limit(min(100, max(1, limit))).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	userIds := make([]int, 0, len(rows)*2)
	voucherIds := make([]int64, 0, len(rows)*2)
	for _, row := range rows {
		userIds = append(userIds, row.InviterId, row.InviteeId)
		voucherIds = append(voucherIds, row.InviterVoucherId, row.InviteeVoucherId)
	}
	names, err := referralUsernames(userIds)
	if err != nil {
		return nil, 0, err
	}
	states, err := referralVoucherStates(voucherIds)
	if err != nil {
		return nil, 0, err
	}
	views := make([]AdminReferralRewardView, 0, len(rows))
	for _, row := range rows {
		issued := row.Status == ReferralRewardIssued
		inviterStatus, inviterExpiresAt := referralVoucherStatusAt(states[row.InviterVoucherId], issued, row.InviterCouponId > 0, now)
		inviteeStatus, inviteeExpiresAt := referralVoucherStatusAt(states[row.InviteeVoucherId], issued, row.InviteeCouponId > 0, now)
		views = append(views, AdminReferralRewardView{
			Id: row.Id, InviterId: row.InviterId, InviteeId: row.InviteeId,
			Inviter: names[row.InviterId], Invitee: names[row.InviteeId],
			Status: row.Status, PendingReason: row.PendingReason, Note: row.Note,
			InviterOrdinal: row.InviterOrdinal, InviterRewardYuan: row.InviterMultiplier,
			InviteeRewardYuan: row.InviteeMultiplier,
			CreatedAt:         row.CreatedAt, IssuedAt: row.IssuedAt,
			InviterVoucherStatus: inviterStatus, InviteeVoucherStatus: inviteeStatus,
			InviterVoucherExpiresAt: inviterExpiresAt, InviteeVoucherExpiresAt: inviteeExpiresAt,
		})
	}
	return views, total, nil
}

// RetryPendingReferralRewards pays the rewards that are only waiting because
// reset coupons were frozen during the voucher cutover. It runs once at startup
// and is idempotent: an issued reward is skipped, and a voucher that already
// exists is returned instead of being recreated.
func RetryPendingReferralRewards(now time.Time) (int, error) {
	var inviteeIds []int
	err := DB.Model(&ReferralReward{}).
		Where("status = ? AND pending_reason IN ?", ReferralRewardPending, []string{referralPendingTokenPlanRetired, ""}).
		Order("id").Limit(500).Pluck("invitee_id", &inviteeIds).Error
	if err != nil {
		return 0, err
	}
	issued := 0
	for _, inviteeId := range inviteeIds {
		reward, err := IssueReferralReward(inviteeId, now)
		if err != nil {
			logger.LogError(nil, fmt.Sprintf("failed to issue the referral reward for invitee %d: %v", inviteeId, err))
			continue
		}
		if reward != nil && reward.Status == ReferralRewardIssued {
			issued++
		}
	}
	return issued, err
}
