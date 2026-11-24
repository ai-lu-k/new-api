package model

import (
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// GiftConsumptionDaily is how much gifted balance one user spent on one
// Asia/Shanghai calendar day.
//
// A charge is taken out of bonus_quota first (see splitLevelConsumption), and
// nothing else records that split per day: the consume log keeps only the total
// charge, and rotating a user's counters afterwards cannot rebuild the day. The
// figure is therefore written where the split happens, so its history starts
// the day this table was introduced and days before it read zero.
type GiftConsumptionDaily struct {
	Id     int64  `json:"id" gorm:"primaryKey"`
	DayKey string `json:"day" gorm:"column:day_key;size:10;not null;uniqueIndex:idx_gift_consumption_day_user"`
	UserId int    `json:"user_id" gorm:"not null;uniqueIndex:idx_gift_consumption_day_user"`
	// Quota is spent gift quota in internal units, always positive.
	Quota int64 `json:"quota" gorm:"not null;default:0"`
}

// TableName keeps the name singular like the other daily ledgers, instead of
// the "dailies" plural GORM would derive.
func (GiftConsumptionDaily) TableName() string {
	return "gift_consumption_daily"
}

// addGiftConsumption adds one user's gift spend to a day's row, creating the row
// on first use. The addition happens inside the caller's settlement
// transaction, so a rolled back charge leaves no trace, and the arithmetic stays
// in the database so two settlements on different instances cannot lose one.
//
// The row is created with a no-op conflict clause and then always updated,
// because "existing row + n" cannot be written portably in one statement: the
// PostgreSQL upsert reports an ambiguous column when the expression names the
// same column it assigns, while MySQL and SQLite accept it.
func addGiftConsumption(tx *gorm.DB, userId int, quota int64, at time.Time) error {
	if quota <= 0 {
		return nil
	}
	dayKey := at.In(financeDayLocation).Format("2006-01-02")
	row := GiftConsumptionDaily{DayKey: dayKey, UserId: userId}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; err != nil {
		return err
	}
	return tx.Model(&GiftConsumptionDaily{}).
		Where("day_key = ? AND user_id = ?", dayKey, userId).
		UpdateColumn("quota", gorm.Expr("quota + ?", quota)).Error
}

// GiftConsumedByDay sums gift spend per Asia/Shanghai day in [start, end), keyed
// by the "2006-01-02" day string. Days without gift spend are absent.
func GiftConsumedByDay(start, end int64) (map[string]int64, error) {
	first := financeDayStart(start).Format("2006-01-02")
	last := financeDayStart(end - 1).Format("2006-01-02")
	var rows []struct {
		DayKey string
		Quota  int64
	}
	err := DB.Model(&GiftConsumptionDaily{}).
		Select("day_key, COALESCE(SUM(quota), 0) AS quota").
		Where("day_key >= ? AND day_key <= ?", first, last).
		Group("day_key").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	spent := make(map[string]int64, len(rows))
	for _, row := range rows {
		spent[row.DayKey] = row.Quota
	}
	return spent, nil
}

// GiftConsumedBetween sums the gift spend of [start, end) in quota units.
func GiftConsumedBetween(start, end int64) (int64, error) {
	spent, err := GiftConsumedByDay(start, end)
	if err != nil {
		return 0, err
	}
	var total int64
	for _, quota := range spent {
		total += quota
	}
	return total, nil
}
