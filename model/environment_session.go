package model

import (
	"errors"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const EnvironmentBridgeLoginMethod = "environment_bridge"

// GetOrCreateEnvironmentSession uses an existing administrator account only.
// A revoked or stale shadow session is never recreated, even at the same SID.
func GetOrCreateEnvironmentSession(sid, username, refreshHash string, maximumRole int, expiresAt int64) (*UserSession, *UserBase, error) {
	if sid == "" || username == "" || refreshHash == "" || expiresAt <= time.Now().Unix() {
		return nil, nil, ErrUserSessionInvalid
	}
	var user User
	var session UserSession
	created := false
	deadline := userSessionCacheDeadline()
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Omit("password", "access_token").Where("username = ?", username).First(&user).Error; err != nil {
			return err
		}
		if user.Username != username || user.Status != common.UserStatusEnabled || !common.IsValidateRole(user.Role) || user.Role < common.RoleAdminUser || user.Role > maximumRole || user.AuthVersion <= 0 {
			return ErrUserSessionInvalid
		}
		err := lockForUpdate(tx).Where("sid = ?", sid).First(&session).Error
		if err == nil {
			if session.UserID != user.Id || session.LoginMethod != EnvironmentBridgeLoginMethod || session.Status != UserSessionStatusActive || session.RevokedAt != 0 || session.ExpiresAt <= time.Now().Unix() || session.UserAuthVersion != user.AuthVersion {
				return ErrUserSessionInactive
			}
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		now := time.Now().Unix()
		var active, issued int64
		if err := tx.Model(&UserSession{}).Where("user_id = ? AND status = ? AND expires_at > ?", user.Id, UserSessionStatusActive, now).Count(&active).Error; err != nil {
			return err
		}
		if active >= int64(common.UserSessionActiveLimit) {
			return ErrUserSessionLimit
		}
		if err := tx.Model(&UserSession{}).Where("user_id = ? AND created_at > ?", user.Id, now-common.UserSessionIssuanceWindowSeconds).Count(&issued).Error; err != nil {
			return err
		}
		if issued >= int64(common.UserSessionIssuanceLimit) {
			return ErrUserSessionIssuanceLimit
		}
		session = UserSession{SID: sid, UserID: user.Id, Version: 1, UserAuthVersion: user.AuthVersion, Status: UserSessionStatusActive, RefreshHash: refreshHash, LoginMethod: EnvironmentBridgeLoginMethod, CreatedAt: now, LastActiveAt: now, ExpiresAt: expiresAt}
		if err := createUserSessionWithTx(tx, &session); err != nil {
			return err
		}
		created = true
		return nil
	})
	if err != nil {
		return nil, nil, err
	}
	if created {
		if err := publishCreatedUserSession(&session, deadline); err != nil {
			return nil, nil, err
		}
	}
	return &session, user.ToBaseUser(), nil
}

func GetEnvironmentUser(username string) (*UserBase, error) {
	var user User
	if username == "" {
		return nil, ErrUserSessionInvalid
	}
	if err := DB.Omit("password", "access_token").Where("username = ?", username).First(&user).Error; err != nil {
		return nil, err
	}
	if user.Username != username {
		return nil, ErrUserSessionInvalid
	}
	return user.ToBaseUser(), nil
}
