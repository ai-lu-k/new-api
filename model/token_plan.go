package model

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

var ErrTokenPlanProtected = errors.New("Token Plan Key cannot be deleted or edited; use its dedicated reset action")
var ErrTokenPlanExhausted = errors.New("Token Plan available weekly quota cannot cover this request reservation; lower the output limit or enable balance continuation")

// One permanent key slot per user. Rotation replaces the credential, not the account.
type TokenPlanAccount struct {
	Id             int    `json:"id"`
	UserId         int    `json:"user_id" gorm:"uniqueIndex;not null"`
	TokenId        int    `json:"token_id" gorm:"uniqueIndex;not null"`
	KeyCiphertext  string `json:"-" gorm:"type:text;not null"`
	MaskedKey      string `json:"-" gorm:"not null"`
	WalletFallback bool   `json:"wallet_fallback"`
	// Opt-in permission to spend one owned coupon when a request finds the
	// cycle exhausted. Independent of WalletFallback and off for everyone.
	AutoResetCoupon bool  `json:"auto_reset_coupon"`
	CycleAnchor     int64 `json:"cycle_anchor"`
	CurrentWeekId   int   `json:"current_week_id"`
}

// Separate calendar buckets ensure a late settlement/refund belongs to the
// request's original week and can never replenish a new week's allowance.
type TokenPlanWeek struct {
	Id            int   `json:"id"`
	CycleStart    int64 `json:"cycle_start"`
	CycleEnd      int64 `json:"cycle_end"`
	Multiplier    int   `json:"multiplier"`
	UserId        int   `json:"user_id" gorm:"uniqueIndex:idx_token_plan_week;not null"`
	WeekStart     int64 `json:"week_start" gorm:"uniqueIndex:idx_token_plan_week;not null"`
	UsedQuota     int64 `json:"used_quota" gorm:"not null"`
	ReservedQuota int64 `json:"-" gorm:"not null;default:0"`
}

type TokenPlanStatus struct {
	Level           int    `json:"level"`
	BaseQuota       int64  `json:"base_quota"`
	Multiplier      int    `json:"multiplier"`
	PersonalCycle   bool   `json:"personal_cycle"`
	CouponCycle     bool   `json:"coupon_cycle"`
	CouponCount     int64  `json:"coupon_count"`
	CouponExpiresAt int64  `json:"coupon_expires_at"`
	TotalQuota      int64  `json:"total_quota"`
	UsedQuota       int64  `json:"used_quota"`
	RemainingQuota  int64  `json:"remaining_quota"`
	WeekStart       int64  `json:"week_start"`
	ResetsAt        int64  `json:"resets_at"`
	TokenId         int    `json:"token_id"`
	MaskedKey       string `json:"masked_key"`
	WalletFallback  bool   `json:"wallet_fallback"`
	AutoResetCoupon bool   `json:"auto_reset_coupon"`
	WalletQuota     int64  `json:"wallet_quota"`
	Retired         bool   `json:"retired"`
}

func TokenPlanWeekStart(now time.Time) time.Time {
	// The plan's calendar is fixed to Beijing time, independent of server TZ.
	local := now.In(time.FixedZone("Asia/Shanghai", 8*60*60))
	days := (int(local.Weekday()) + 6) % 7
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, local.Location()).AddDate(0, 0, -days)
}

func TokenPlanQuota(level int) (int64, error) {
	amounts := [7]string{"0", "0.5", "1", "2", "4", "8", "16"}
	if level < 0 || level >= len(amounts) {
		return 0, errors.New("invalid Token Plan level")
	}
	amount, _ := decimal.NewFromString(amounts[level])
	if common.QuotaPerUnit <= 0 || math.IsNaN(common.QuotaPerUnit) || math.IsInf(common.QuotaPerUnit, 0) {
		return 0, errors.New("invalid quota unit")
	}
	quota, err := common.WalletQuotaFromDecimalStrict(amount.Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
	return int64(quota), err
}

func EnsureTokenPlanAccount(userId int) (*TokenPlanAccount, error) {
	var account TokenPlanAccount
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockUserRow(tx, userId); err != nil {
			return err
		}
		if err := tx.Select("id", "status").First(&user, userId).Error; err != nil {
			return err
		}
		if user.Status != common.UserStatusEnabled {
			return errors.New("user is disabled")
		}
		err := tx.Where("user_id = ?", userId).First(&account).Error
		if err == nil {
			var token Token
			if tokenErr := tx.Where("id = ? AND user_id = ?", account.TokenId, userId).First(&token).Error; tokenErr == nil {
				return nil
			} else if !errors.Is(tokenErr, gorm.ErrRecordNotFound) {
				return tokenErr
			}
		}
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		key, err := common.GenerateKey()
		if err != nil {
			return err
		}
		key = "tp_" + key
		token := Token{UserId: userId, Key: TokenPlanKeyDigest(key), Name: "Token Plan", Status: common.TokenStatusEnabled, CreatedTime: common.GetTimestamp(), ExpiredTime: -1, UnlimitedQuota: true, TokenPlan: true}
		if common.TokenPlanRetired {
			token.Key, token.Name, token.TokenPlan = key, TokenPlanKeyMigrationDefaultName, false
		}
		if err := tx.Create(&token).Error; err != nil {
			return err
		}
		encrypted, err := protectTokenPlanKey(key, userId, token.Id, false)
		if err != nil {
			return err
		}
		if account.UserId != 0 {
			account.TokenId, account.KeyCiphertext, account.MaskedKey = token.Id, encrypted, MaskTokenKey(key)
			return tx.Model(&account).Updates(map[string]any{"token_id": token.Id, "key_ciphertext": encrypted, "masked_key": account.MaskedKey}).Error
		}
		account = TokenPlanAccount{UserId: userId, TokenId: token.Id, KeyCiphertext: encrypted, MaskedKey: MaskTokenKey(key)}
		return tx.Create(&account).Error
	})
	return &account, err
}

func GetTokenPlanStatus(userId int, now time.Time) (*TokenPlanStatus, error) {
	var status TokenPlanStatus
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id", "level_quota", "quota", "token_plan_reserved_quota").First(&user, userId).Error; err != nil {
			return err
		}
		status.Level = CalculateUsageLevel(user.LevelQuota, operation_setting.GetUsageLevelThresholds()).Level
		status.Retired = common.TokenPlanRetired
		if status.Retired {
			status.WalletQuota = int64(user.Quota) + user.TokenPlanWalletHold
			var account TokenPlanAccount
			if err := tx.Where("user_id = ?", userId).First(&account).Error; errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			} else if err != nil {
				return err
			}
			var token Token
			if err := tx.Where("id = ? AND user_id = ?", account.TokenId, userId).First(&token).Error; errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			} else if err != nil {
				return err
			}
			status.TokenId, status.MaskedKey = token.Id, "sk-"+account.MaskedKey
			return nil
		}
		base, err := TokenPlanQuota(status.Level)
		if err != nil {
			return err
		}
		start := TokenPlanWeekStart(now)
		status.BaseQuota, status.TotalQuota, status.Multiplier = base, base, 1
		status.WeekStart, status.ResetsAt = start.Unix(), start.AddDate(0, 0, 7).Unix()
		var account TokenPlanAccount
		err = tx.Where("user_id = ?", userId).First(&account).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			status.RemainingQuota = base
			return nil
		}
		if err != nil {
			return err
		}
		week, err := currentTokenPlanWeek(tx, &account, now)
		if err != nil {
			return err
		}
		status.Multiplier = max(1, week.Multiplier)
		status.TotalQuota, err = tokenPlanCycleQuota(status.Level, status.Multiplier)
		if err != nil {
			return err
		}
		status.WeekStart, status.ResetsAt = week.CycleStart, week.CycleEnd
		if status.WeekStart == 0 {
			status.WeekStart, status.ResetsAt = week.WeekStart, week.WeekStart+tokenPlanCycleSeconds
		}
		status.PersonalCycle = account.CycleAnchor > 0
		// Coupon ledgers use a negative, distinct week key; subsequent normal
		// personal cycles keep the anchor but must not retain coupon styling.
		status.CouponCycle = week.WeekStart < 0
		status.UsedQuota, status.RemainingQuota = week.UsedQuota, max(0, status.TotalQuota-week.UsedQuota)
		// Once the key migration ran, the account's key is an ordinary one
		// (token_plan = false). Looking it up by the flag would fail the whole
		// status and blank out the card that shows balance and vouchers, so the
		// row is identified by its owner alone.
		var token Token
		if err := tx.Where("id = ? AND user_id = ?", account.TokenId, userId).First(&token).Error; err != nil {
			return err
		}
		status.TokenId, status.MaskedKey, status.WalletFallback = token.Id, "sk-"+account.MaskedKey, account.WalletFallback
		status.AutoResetCoupon = account.AutoResetCoupon
		if account.WalletFallback {
			status.WalletQuota = max(0, int64(user.Quota)+user.TokenPlanWalletHold)
		}
		var stats struct {
			Count     int64
			ExpiresAt int64
		}
		if err := tx.Model(&TokenPlanResetCoupon{}).Where("user_id = ? AND status = ? AND expires_at > ?", userId, "available", now.Unix()).Select("COUNT(*) AS count, COALESCE(MIN(expires_at),0) AS expires_at").Scan(&stats).Error; err != nil {
			return err
		}
		status.CouponCount, status.CouponExpiresAt = stats.Count, stats.ExpiresAt
		return nil
	})
	return &status, err
}

// ReserveTokenPlanQuota atomically reserves capacity. Upgrade/downgrade only
// changes the ceiling; neither rotation nor changing levels resets used quota.
func ReserveTokenPlanQuota(userId, tokenId int, amount int64, now time.Time) (int, error) {
	if common.TokenPlanRetired {
		return 0, ErrTokenPlanRetired
	}
	if amount < 0 || amount > int64(common.MaxWalletQuota) {
		return 0, errors.New("invalid Token Plan reservation")
	}
	var week TokenPlanWeek
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id", "status", "level_quota").First(&user, userId).Error; err != nil {
			return err
		}
		if user.Status != common.UserStatusEnabled {
			return errors.New("user is disabled")
		}
		var account TokenPlanAccount
		if err := tx.Where("user_id = ? AND token_id = ?", userId, tokenId).First(&account).Error; err != nil {
			return err
		}
		current, err := currentTokenPlanWeek(tx, &account, now)
		if err != nil {
			return err
		}
		week = *current
		total, err := tokenPlanCycleQuota(CalculateUsageLevel(user.LevelQuota, operation_setting.GetUsageLevelThresholds()).Level, max(1, week.Multiplier))
		if err != nil {
			return err
		}
		if total <= 0 {
			return ErrTokenPlanExhausted
		}
		if amount > total || week.UsedQuota > total-amount {
			return ErrTokenPlanExhausted
		}
		result := tx.Model(&TokenPlanWeek{}).Where("id = ? AND used_quota <= ?", week.Id, total-amount).UpdateColumn("used_quota", gorm.Expr("used_quota + ?", amount))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrTokenPlanExhausted
		}
		return nil
	})
	return week.Id, err
}

// AdjustTokenPlanQuota settles a request against the original week. Actual
// upstream usage may exceed an estimate: retain that debt in this bucket and
// reject further requests, without ever debiting the wallet or the next week.
func AdjustTokenPlanQuota(userId, weekId int, delta int64, requireAvailable bool) error {
	if delta == 0 {
		return nil
	}
	if weekId <= 0 || delta > int64(common.MaxWalletQuota) || delta < -int64(common.MaxWalletQuota) {
		return errors.New("invalid Token Plan adjustment")
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id", "status", "level_quota").First(&user, userId).Error; err != nil {
			return err
		}
		if requireAvailable && user.Status != common.UserStatusEnabled {
			return errors.New("user is disabled")
		}
		var week TokenPlanWeek
		if err := lockForUpdate(tx).Where("id = ? AND user_id = ?", weekId, userId).First(&week).Error; err != nil {
			return err
		}
		if delta < 0 && week.UsedQuota < -delta {
			return errors.New("Token Plan refund exceeds reserved quota")
		}
		if delta > 0 && week.UsedQuota > int64(common.MaxWalletQuota)-delta {
			return errors.New("Token Plan quota overflow")
		}
		if requireAvailable && delta > 0 {
			level := CalculateUsageLevel(user.LevelQuota, operation_setting.GetUsageLevelThresholds()).Level
			total, err := tokenPlanCycleQuota(level, max(1, week.Multiplier))
			if err != nil {
				return err
			}
			if week.UsedQuota+delta > total {
				return ErrTokenPlanExhausted
			}
		}
		return tx.Model(&week).UpdateColumn("used_quota", gorm.Expr("used_quota + ?", delta)).Error
	})
}

func RotateTokenPlanKey(userId int) (*Token, error) {
	var token Token
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id", "status").First(&user, userId).Error; err != nil {
			return err
		}
		if user.Status != common.UserStatusEnabled {
			return errors.New("user is disabled")
		}
		var account TokenPlanAccount
		if err := tx.Where("user_id = ?", userId).First(&account).Error; err != nil {
			return err
		}
		if err := lockForUpdate(tx).Where("id = ? AND user_id = ?", account.TokenId, userId).First(&token).Error; err != nil {
			return err
		}
		newKey, err := common.GenerateKey()
		if err != nil {
			return err
		}
		// Fail closed if cached credentials cannot be revoked.
		if err := invalidateTokenCacheForMutation(token.Key); err != nil {
			return fmt.Errorf("revoke previous Token Plan key: %w", err)
		}
		newKey = "tp_" + newKey
		encrypted, err := protectTokenPlanKey(newKey, userId, token.Id, false)
		if err != nil {
			return err
		}
		if err := tx.Model(&account).Updates(map[string]any{"key_ciphertext": encrypted, "masked_key": MaskTokenKey(newKey)}).Error; err != nil {
			return err
		}
		storedKey := newKey
		if token.TokenPlan {
			storedKey = TokenPlanKeyDigest(newKey)
		}
		if err := tx.Model(&token).UpdateColumn("key", storedKey).Error; err != nil {
			return err
		}
		token.Key = newKey
		return nil
	})
	return &token, err
}

// Validation uses a non-bearer digest. The retrievable credential is encrypted
// with the host's CRYPTO_SECRET (or SESSION_SECRET), never a database-held key.
func TokenPlanKeyDigest(key string) string {
	digest := sha256.Sum256([]byte(key))
	return "tp_hash_" + hex.EncodeToString(digest[:])
}

func protectTokenPlanKey(value string, userId, tokenId int, decrypt bool) (string, error) {
	// A process-random fallback would make stored credentials unreadable after
	// restart. Require a persistent host secret, outside the database.
	secret := os.Getenv("CRYPTO_SECRET")
	if secret == "" {
		secret = os.Getenv("SESSION_SECRET")
	}
	if len(secret) < 32 {
		return "", errors.New("Token Plan requires a persistent CRYPTO_SECRET or SESSION_SECRET of at least 32 bytes")
	}
	key := sha256.Sum256([]byte("new-api:token-plan:" + secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return "", err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	associated := []byte(fmt.Sprintf("token-plan:%d:%d", userId, tokenId))
	if decrypt {
		data, err := base64.RawStdEncoding.DecodeString(value)
		if err != nil || len(data) < aead.NonceSize() {
			return "", errors.New("Token Plan key cannot be decrypted")
		}
		plain, err := aead.Open(nil, data[:aead.NonceSize()], data[aead.NonceSize():], associated)
		if err != nil {
			return "", errors.New("Token Plan key cannot be decrypted")
		}
		return string(plain), nil
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	encrypted := aead.Seal(nonce, nonce, []byte(value), associated)
	return base64.RawStdEncoding.EncodeToString(encrypted), nil
}

func ReadTokenPlanCredential(userId int) (string, error) {
	var account TokenPlanAccount
	if err := DB.Where("user_id = ?", userId).First(&account).Error; err != nil {
		return "", err
	}
	key, err := protectTokenPlanKey(account.KeyCiphertext, userId, account.TokenId, true)
	if err != nil {
		return "", err
	}
	var token Token
	if err := DB.Where("id = ? AND user_id = ?", account.TokenId, userId).First(&token).Error; err != nil {
		return "", err
	}
	// Before the key migration the row holds the digest; afterwards it holds the
	// plaintext the migration wrote back. Both are this credential, so either
	// match proves the stored ciphertext still belongs to this token.
	if !strings.HasPrefix(key, "tp_") ||
		(token.Key != key && TokenPlanKeyDigest(key) != token.Key) {
		return "", errors.New("Token Plan credential is inconsistent")
	}
	return key, nil
}
