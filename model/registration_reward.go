package model

import (
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const RewardVerificationRequired = "reward_verification_required"

var ErrRewardVerification = errors.New("Registration verification failed or expired. Request a new code and try again.")

// RegistrationReward stores an immutable reward entitlement and its release
// state. Signals expire independently; deleting signals never clears the gate.
type RegistrationReward struct {
	UserId       int    `json:"user_id" gorm:"primaryKey;autoIncrement:false"`
	InviterId    int    `json:"inviter_id"`
	IPHash       string `json:"-" gorm:"size:64;index"`
	DeviceHash   string `json:"-" gorm:"size:64;index"`
	CreatedAt    int64  `json:"created_at" gorm:"index"`
	Reason       string `json:"reason" gorm:"size:128"`
	VerifiedAt   int64  `json:"verified_at"`
	IssuedAt     int64  `json:"issued_at"`
	SignupQuota  int    `json:"-"`
	InviteeQuota int    `json:"-"`
	InviterQuota int    `json:"-"`
}

// RegistrationRewardLock serializes signal counting across gateway instances.
// The first write also serializes SQLite transactions before their first read.
type RegistrationRewardLock struct {
	Id int `gorm:"primaryKey;autoIncrement:false"`
}

type RegistrationRisk struct{ IPHash, DeviceHash, ProofToken string }

func RecordRegistrationReward(tx *gorm.DB, user *User, inviterId int, risk *RegistrationRisk, now time.Time) error {
	if err := lockRegistrationRewards(tx); err != nil {
		return err
	}
	reward := RegistrationReward{UserId: user.Id, InviterId: inviterId, IPHash: risk.IPHash, DeviceHash: risk.DeviceHash, CreatedAt: now.Unix(), SignupQuota: max(0, common.QuotaForNewUser)}
	if inviterId > 0 && operation_setting.IsPaymentComplianceConfirmed() {
		reward.InviteeQuota, reward.InviterQuota = max(0, common.QuotaForInvitee), max(0, common.QuotaForInviter)
	}
	reason, err := registrationRiskReason(tx, risk, now)
	if err != nil {
		return err
	}
	reward.Reason = reason
	proof, proofErr := RegistrationProofWithTx(tx, risk, now)
	if reason != "" && (proofErr != nil || proof.Email != user.Email) {
		return ErrRegistrationVerificationRequired
	}
	if proofErr == nil {
		if err := ClaimExternalAuthAssertionWithTx(tx, "registration_reward_proof", risk.ProofToken, time.Unix(proof.ExpiresAt, 0)); err != nil {
			return ErrRegistrationVerificationRequired
		}
		reward.VerifiedAt = now.Unix()
	}
	return tx.Create(&reward).Error
}

func registrationRewardBlocked(tx *gorm.DB, userId int) (bool, error) {
	var reward RegistrationReward
	err := tx.First(&reward, userId).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return reward.Reason != "" && reward.VerifiedAt == 0, nil
}

// ReleaseRegistrationReward releases the stored amounts once. A verification
// callback, email bind, or admin retry cannot bypass the durable gate.
func ReleaseRegistrationReward(userId int, now time.Time) error {
	credited := 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		var reward RegistrationReward
		if err := lockForUpdate(tx).First(&reward, userId).Error; err != nil {
			return err
		}
		if reward.IssuedAt != 0 || (reward.Reason != "" && reward.VerifiedAt == 0) {
			return nil
		}
		var user User
		if err := lockForUpdate(tx).First(&user, userId).Error; err != nil {
			return err
		}
		if user.Status != common.UserStatusEnabled {
			return nil
		}
		credited = reward.SignupQuota + reward.InviteeQuota
		if credited < 0 || int64(user.Quota)+int64(credited) > common.MaxWalletQuota {
			return errors.New("registration reward exceeds wallet limit")
		}
		if credited > 0 {
			// Signup and inviter rewards are gifts: record them in the gift
			// ledger in the same statement that grows the wallet.
			if err := tx.Model(&User{}).Where("id = ?", userId).Updates(map[string]any{
				"quota":       gorm.Expr("quota + ?", credited),
				"bonus_quota": gorm.Expr("bonus_quota + ?", credited),
			}).Error; err != nil {
				return err
			}
		}
		if reward.InviterId > 0 && reward.InviterQuota > 0 {
			if err := tx.Model(&User{}).Where("id = ?", reward.InviterId).Updates(map[string]any{
				"aff_quota": gorm.Expr("aff_quota + ?", reward.InviterQuota), "aff_history": gorm.Expr("aff_history + ?", reward.InviterQuota),
			}).Error; err != nil {
				return err
			}
		}
		return tx.Model(&reward).Update("issued_at", now.Unix()).Error
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if credited > 0 {
		syncCreditUserQuotaCache(userId, credited, "registration reward")
		RecordLog(userId, LogTypeSystem, fmt.Sprintf("注册奖励赠送 %s", logger.LogQuota(credited)))
	}
	return nil
}

func ClearExpiredRegistrationSignals(now time.Time) error {
	return DB.Model(&RegistrationReward{}).Where("created_at <= ? AND (ip_hash <> '' OR device_hash <> '')", now.Add(-30*24*time.Hour).Unix()).Updates(map[string]any{"ip_hash": "", "device_hash": ""}).Error
}

func registrationRiskReason(tx *gorm.DB, risk *RegistrationRisk, now time.Time) (string, error) {
	var reason string
	ipThreshold := max(1, common.GetEnvOrDefault("REGISTRATION_REWARD_IP_THRESHOLD", 3))
	deviceThreshold := max(1, common.GetEnvOrDefault("REGISTRATION_REWARD_DEVICE_THRESHOLD", 2))
	var count int64
	if risk.IPHash == "" {
		reason = "missing_ip"
	} else {
		// A locking read avoids a stale MySQL REPEATABLE READ snapshot established
		// earlier in the registration transaction.
		var ids []int
		if err := lockForUpdate(tx).Model(&RegistrationReward{}).Where("ip_hash = ? AND created_at > ?", risk.IPHash, now.Add(-24*time.Hour).Unix()).Limit(ipThreshold).Pluck("user_id", &ids).Error; err != nil {
			return "", err
		}
		count = int64(len(ids))
		if count >= int64(ipThreshold-1) {
			reason = "ip_velocity"
		}
	}
	if risk.DeviceHash == "" {
		if reason != "" {
			reason += ";"
		}
		reason += "missing_device"
	} else {
		var ids []int
		if err := lockForUpdate(tx).Model(&RegistrationReward{}).Where("device_hash = ? AND created_at > ?", risk.DeviceHash, now.Add(-30*24*time.Hour).Unix()).Limit(deviceThreshold).Pluck("user_id", &ids).Error; err != nil {
			return "", err
		}
		if len(ids) >= deviceThreshold-1 {
			if reason != "" {
				reason += ";"
			}
			reason += "device_reuse"
		}
	}
	return reason, nil
}

func RegistrationRiskReason(risk *RegistrationRisk, now time.Time) (string, error) {
	return registrationRiskReason(DB, risk, now)
}

func lockRegistrationRewards(tx *gorm.DB) error {
	lock := RegistrationRewardLock{Id: 1}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&lock).Error; err != nil {
		return err
	}
	// UPDATE is a locking write on all three databases, including SQLite.
	if err := tx.Model(&RegistrationRewardLock{}).Where("id = ?", 1).Update("id", 1).Error; err != nil {
		return err
	}
	return nil
}
