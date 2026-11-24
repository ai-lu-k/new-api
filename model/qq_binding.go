package model

import (
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrQQBindingAccountTaken reports that the station account already belongs to
// another QQ identity. The bot API answers it with one fixed code; the driver
// error behind it never leaves this package.
var ErrQQBindingAccountTaken = errors.New("qq binding: account already bound to another qq")

// QQBinding is the "this group member is that station account" statement the
// support bot acts on. One QQ identity holds one account, and one account is
// claimed by one QQ identity only: a binding is an identity claim, not a hint.
type QQBinding struct {
	Id          uint    `json:"-" gorm:"primaryKey"`
	GroupOpenid string  `json:"group_openid" gorm:"type:varchar(64);not null;uniqueIndex:uniq_qq,priority:1"`
	QQOpenid    string  `json:"qq_openid" gorm:"type:varchar(64);not null;uniqueIndex:uniq_qq,priority:2"`
	QQName      *string `json:"qq_name" gorm:"type:varchar(128)"`
	UserId      int     `json:"user_id" gorm:"not null"`
	Username    string  `json:"username" gorm:"type:varchar(64);not null;index:idx_username"`
	// Written as Unix seconds by the caller, matching the timestamp style of the
	// usage rows the bot compares it against.
	CreatedAt int64 `json:"created_at" gorm:"not null;autoCreateTime:false"`
}

// QQBindingInput is one already-authorized binding statement. Callers resolve the
// station account themselves, so an unknown username never reaches this write.
type QQBindingInput struct {
	GroupOpenid string
	QQOpenid    string
	QQName      string
	UserId      int
	Username    string
	Now         int64
}

// FindQQBinding reads the account one QQ identity claimed, if any.
func FindQQBinding(groupOpenid, qqOpenid string) (*QQBinding, error) {
	return findQQBinding(DB, groupOpenid, qqOpenid)
}

// findQQBinding is the same read inside a caller's transaction, where the
// connection-scoped DB handle cannot see a row this transaction just wrote.
func findQQBinding(tx *gorm.DB, groupOpenid, qqOpenid string) (*QQBinding, error) {
	binding := QQBinding{}
	query := tx.Where("group_openid = ? AND qq_openid = ?", groupOpenid, qqOpenid)
	if err := query.Take(&binding).Error; err != nil {
		return nil, err
	}
	return &binding, nil
}

// BindQQAccount stores the binding of one QQ identity, replacing an earlier
// account for that same identity. Another QQ claiming the same account is
// refused rather than silently transferred, so a typo cannot steal a binding.
func BindQQAccount(input QQBindingInput) (*QQBinding, error) {
	var binding *QQBinding
	err := DB.Transaction(func(tx *gorm.DB) error {
		taken := QQBinding{}
		lookup := lockForUpdate(tx).Where("username = ?", input.Username).Take(&taken).Error
		switch {
		case lookup == nil && (taken.GroupOpenid != input.GroupOpenid || taken.QQOpenid != input.QQOpenid):
			return ErrQQBindingAccountTaken
		case lookup != nil && !errors.Is(lookup, gorm.ErrRecordNotFound):
			return lookup
		}

		row := QQBinding{
			GroupOpenid: input.GroupOpenid,
			QQOpenid:    input.QQOpenid,
			UserId:      input.UserId,
			Username:    input.Username,
			CreatedAt:   input.Now,
		}
		if input.QQName != "" {
			name := input.QQName
			row.QQName = &name
		}
		// The unique (group_openid, qq_openid) index makes this one statement on
		// every supported database; a rebind updates the account in place.
		if err := tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "group_openid"}, {Name: "qq_openid"}},
			DoUpdates: clause.AssignmentColumns([]string{"qq_name", "user_id", "username", "created_at"}),
		}).Create(&row).Error; err != nil {
			return err
		}

		stored, err := findQQBinding(tx, input.GroupOpenid, input.QQOpenid)
		if err != nil {
			return err
		}
		binding = stored
		return nil
	})
	if err != nil {
		return nil, err
	}
	return binding, nil
}

// UnbindQQAccount drops one QQ identity's claim. It reports whether a row was
// actually removed, so an "already unbound" answer is not invented.
func UnbindQQAccount(groupOpenid, qqOpenid string) (bool, error) {
	result := DB.Where("group_openid = ? AND qq_openid = ?", groupOpenid, qqOpenid).Delete(&QQBinding{})
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected > 0, nil
}
