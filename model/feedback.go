package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	FeedbackStatusOpen     = 1
	FeedbackStatusResolved = 2
)

// Feedback is a message a signed-in user leaves for the administrators. An
// anonymous message keeps no trace of who wrote it: UserId is 0 and Username
// empty, so not even an administrator can tell.
type Feedback struct {
	Id        int    `json:"id"`
	UserId    int    `json:"user_id" gorm:"index"`
	Username  string `json:"username" gorm:"type:varchar(64);default:''"`
	Content   string `json:"content" gorm:"type:text"`
	Contact   string `json:"contact" gorm:"type:varchar(128);default:''"`
	Status    int    `json:"status" gorm:"default:1;index"`
	Reply     string `json:"reply" gorm:"type:text"`
	RepliedAt int64  `json:"replied_at" gorm:"bigint;default:0"`
	CreatedAt int64  `json:"created_at" gorm:"bigint;index"`
}

func (Feedback) TableName() string {
	return "feedbacks"
}

func CreateFeedback(feedback *Feedback) error {
	feedback.Id = 0
	feedback.Status = FeedbackStatusOpen
	feedback.CreatedAt = common.GetTimestamp()
	return DB.Create(feedback).Error
}

// ListFeedbackOfUser returns the messages a user signed, newest first.
// Anonymous ones are not linked to anyone, so they are not among them.
func ListFeedbackOfUser(userId int, limit int) ([]*Feedback, error) {
	var items []*Feedback
	if userId <= 0 {
		return items, nil
	}
	err := DB.Where("user_id = ?", userId).Order("id desc").Limit(limit).Find(&items).Error
	return items, err
}

// ListFeedback returns every message, newest first; status 0 means any.
func ListFeedback(status, startIdx, num int) ([]*Feedback, int64, error) {
	query := DB.Model(&Feedback{})
	if status != 0 {
		query = query.Where("status = ?", status)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []*Feedback
	err := query.Order("id desc").Limit(num).Offset(startIdx).Find(&items).Error
	return items, total, err
}

func CountOpenFeedback() (int64, error) {
	var total int64
	err := DB.Model(&Feedback{}).Where("status = ?", FeedbackStatusOpen).Count(&total).Error
	return total, err
}

// UpdateFeedback sets the status and reply of a message.
func UpdateFeedback(id, status int, reply string) (*Feedback, error) {
	var feedback Feedback
	if err := DB.First(&feedback, id).Error; err != nil {
		return nil, err
	}
	if status != FeedbackStatusOpen && status != FeedbackStatusResolved {
		return nil, errors.New("invalid feedback status")
	}
	updates := map[string]any{"status": status}
	if reply != feedback.Reply {
		updates["reply"] = reply
		updates["replied_at"] = common.GetTimestamp()
	}
	if err := DB.Model(&Feedback{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return nil, err
	}
	err := DB.First(&feedback, id).Error
	return &feedback, err
}

func IsFeedbackNotFound(err error) bool {
	return errors.Is(err, gorm.ErrRecordNotFound)
}
