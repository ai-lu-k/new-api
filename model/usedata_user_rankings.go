package model

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// UserUsageRow is one account's settled consumption. The name fields stay
// inside the server: the public leaderboard only publishes a masked form.
type UserUsageRow struct {
	Id           int
	Username     string
	DisplayName  string
	UsedQuota    int
	RequestCount int
}

// UserLevelCount is how many ranked accounts sit at one usage level.
type UserLevelCount struct {
	Level int
	Users int64
}

// rankedUsers narrows the population the public level leaderboard draws on:
// enabled customer accounts that have settled at least one unit of quota.
// Operators are left out so the board describes customers, not the site
// itself. Building on the User model keeps soft-deleted accounts out.
func rankedUsers() *gorm.DB {
	return DB.Model(&User{}).
		Where("role = ?", common.RoleCommonUser).
		Where("status = ?", common.UserStatusEnabled).
		Where("used_quota > 0")
}

// GetTopUsersByUsage lists the heaviest consumers, highest first. The id breaks
// ties so consecutive calls keep a stable order.
func GetTopUsersByUsage(limit int) ([]UserUsageRow, error) {
	if limit <= 0 {
		return nil, nil
	}
	var rows []UserUsageRow
	err := rankedUsers().
		Select("id, username, display_name, used_quota, request_count").
		Order("used_quota DESC, id ASC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

// GetUserUsageRow reads one account's consumption, without the leaderboard's
// role filter, so an operator still sees their own line on the page.
func GetUserUsageRow(userId int) (*UserUsageRow, error) {
	if userId <= 0 {
		return nil, nil
	}
	var rows []UserUsageRow
	err := DB.Model(&User{}).
		Select("id, username, display_name, used_quota, request_count").
		Where("id = ?", userId).
		Limit(1).
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return &rows[0], nil
}

// GetUserUsageRank counts how many ranked accounts consumed strictly more, so
// the returned count + 1 is the position GetTopUsersByUsage publishes for that
// amount.
func GetUserUsageRank(usedQuota int) (int64, error) {
	var ahead int64
	err := rankedUsers().Where("used_quota > ?", usedQuota).Count(&ahead).Error
	return ahead + 1, err
}

// GetUserLevelCounts buckets the ranked population by usage level, in one scan.
//
// The level is derived with a CASE expression and that same expression is then
// repeated as the group key: GORM quotes a Group() argument as a single
// identifier, so neither a positional reference (GROUP BY 1) nor an output
// alias survives that trip. The soft-delete scope is written out because a raw
// statement does not inherit it from the model.
func GetUserLevelCounts(thresholds [7]int) ([]UserLevelCount, error) {
	conditions := make([]string, 0, 6)
	levelArgs := make([]any, 0, 6)
	for level := 6; level >= 1; level-- {
		conditions = append(conditions, fmt.Sprintf("WHEN used_quota >= ? THEN %d", level))
		levelArgs = append(levelArgs, thresholds[level])
	}
	levelExpr := "CASE " + strings.Join(conditions, " ") + " ELSE 0 END"

	statement := "SELECT " + levelExpr + " AS level, COUNT(*) AS users FROM users" +
		" WHERE deleted_at IS NULL AND role = ? AND status = ? AND used_quota > 0" +
		" GROUP BY " + levelExpr +
		" ORDER BY level ASC"

	// Placeholders bind in the order they appear: the CASE in the select list,
	// then the WHERE filters, then the CASE repeated as the group key.
	args := make([]any, 0, len(levelArgs)*2+2)
	args = append(args, levelArgs...)
	args = append(args, common.RoleCommonUser, common.UserStatusEnabled)
	args = append(args, levelArgs...)

	var rows []UserLevelCount
	err := DB.Raw(statement, args...).Scan(&rows).Error
	return rows, err
}
