package service

import (
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

const (
	// userLevelRankingLimit bounds the published page so the public board stays
	// a leaderboard rather than a member list.
	userLevelRankingLimit = 50
	// userLevelRankingMaskNames hides the middle of account names. Set it to
	// false only if publishing whole account names on a public page is
	// intended.
	userLevelRankingMaskNames = true
)

// UserLevelLadderRow is one rung of the ladder: what the level costs and how
// many ranked accounts have reached it.
type UserLevelLadderRow struct {
	Level    int   `json:"level"`
	MinQuota int   `json:"min_quota"`
	Users    int64 `json:"users"`
}

// RankedUser is one published line of the level leaderboard.
type RankedUser struct {
	Rank         int    `json:"rank"`
	Name         string `json:"name"`
	Level        int    `json:"level"`
	UsedQuota    int    `json:"used_quota"`
	RequestCount int    `json:"request_count"`
	IsMe         bool   `json:"is_me,omitempty"`
}

// UserLevelRankingsResponse is the payload of the public level leaderboard.
type UserLevelRankingsResponse struct {
	Levels []UserLevelLadderRow `json:"levels"`
	Users  []RankedUser         `json:"users"`
	// TotalUsers counts every ranked account, not just the published page.
	TotalUsers int64 `json:"total_users"`
	// Me is the caller's own line, present only when they are signed in and
	// have settled consumption. It is filled even when they are outside the
	// published page.
	Me *RankedUser `json:"me,omitempty"`
}

// GetUserLevelRankingsSnapshot builds the public level leaderboard. callerId is
// the signed-in user, or 0 for an anonymous visitor.
func GetUserLevelRankingsSnapshot(callerId int) (*UserLevelRankingsResponse, error) {
	thresholds := operation_setting.GetUsageLevelThresholds()

	rows, err := model.GetTopUsersByUsage(userLevelRankingLimit)
	if err != nil {
		return nil, err
	}
	counts, err := model.GetUserLevelCounts(thresholds)
	if err != nil {
		return nil, err
	}

	usersByLevel := make(map[int]int64, len(counts))
	var totalUsers int64
	for _, count := range counts {
		usersByLevel[count.Level] = count.Users
		totalUsers += count.Users
	}

	levels := make([]UserLevelLadderRow, 0, 7)
	for level := 0; level <= 6; level++ {
		levels = append(levels, UserLevelLadderRow{
			Level:    level,
			MinQuota: thresholds[level],
			Users:    usersByLevel[level],
		})
	}

	users := make([]RankedUser, 0, len(rows))
	var me *RankedUser
	for index, row := range rows {
		ranked := rankedUserFrom(row, index+1, thresholds)
		ranked.IsMe = callerId > 0 && row.Id == callerId
		if ranked.IsMe {
			mine := ranked
			me = &mine
		}
		users = append(users, ranked)
	}

	// A signed-in caller below the published cut-off still gets their own line,
	// so the page can show where they stand.
	if callerId > 0 && me == nil {
		mine, err := model.GetUserUsageRow(callerId)
		if err != nil {
			return nil, err
		}
		if mine != nil && mine.UsedQuota > 0 {
			rank, err := model.GetUserUsageRank(mine.UsedQuota, mine.Id)
			if err != nil {
				return nil, err
			}
			ranked := rankedUserFrom(*mine, int(rank), thresholds)
			ranked.IsMe = true
			me = &ranked
		}
	}

	return &UserLevelRankingsResponse{
		Levels:     levels,
		Users:      users,
		TotalUsers: totalUsers,
		Me:         me,
	}, nil
}

func rankedUserFrom(row model.UserUsageRow, rank int, thresholds [7]int) RankedUser {
	return RankedUser{
		Rank:         rank,
		Name:         publicRankingName(row),
		Level:        CalculateUsageLevel(row.UsedQuota, thresholds).Level,
		UsedQuota:    row.UsedQuota,
		RequestCount: row.RequestCount,
	}
}

// publicRankingName prefers the chosen display name, then masks whatever it
// picked so the page shows a place without publishing a whole account name.
func publicRankingName(row model.UserUsageRow) string {
	name := strings.TrimSpace(row.DisplayName)
	if name == "" {
		name = strings.TrimSpace(row.Username)
	}
	if !userLevelRankingMaskNames {
		return name
	}
	return maskRankingName(name)
}

// maskRankingName keeps enough of a name to be recognisable and replaces the
// middle with asterisks. It works on runes so CJK names mask sensibly.
func maskRankingName(name string) string {
	runes := []rune(name)
	switch size := len(runes); {
	case size == 0:
		return "***"
	case size <= 2:
		return string(runes[:1]) + "***"
	case size <= 4:
		return string(runes[:1]) + "***" + string(runes[size-1:])
	default:
		return string(runes[:2]) + "***" + string(runes[size-2:])
	}
}
