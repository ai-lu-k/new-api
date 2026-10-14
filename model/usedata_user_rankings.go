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

// GetUserUsageRank uses the same consumption and id ordering as the published
// page, including when an equally consuming account is below its cut-off.
func GetUserUsageRank(usedQuota int, userId int) (int64, error) {
	var ahead int64
	err := rankedUsers().Where("used_quota > ? OR (used_quota = ? AND id < ?)", usedQuota, usedQuota, userId).Count(&ahead).Error
	return ahead + 1, err
}

// GetUserLevelCounts buckets the ranked population by usage level, in one scan.
//
// Derive the level once in a subquery, then group its named column. Repeating
// a parameterized CASE as the group key fails PostgreSQL and strict MySQL's
// grouping checks. The inner User query retains the soft-delete scope.
func GetUserLevelCounts(thresholds [7]int) ([]UserLevelCount, error) {
	conditions := make([]string, 0, 6)
	levelArgs := make([]any, 0, 6)
	for level := 6; level >= 1; level-- {
		conditions = append(conditions, fmt.Sprintf("WHEN used_quota >= ? THEN %d", level))
		levelArgs = append(levelArgs, thresholds[level])
	}
	levelExpr := "CASE " + strings.Join(conditions, " ") + " ELSE 0 END"

	var rows []UserLevelCount
	err := DB.Table("(?) AS ranked_usage", rankedUsers().Select(levelExpr+" AS level", levelArgs...)).
		Select("level, COUNT(*) AS users").Group("level").Order("level ASC").Scan(&rows).Error
	return rows, err
}
