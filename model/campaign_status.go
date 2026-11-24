package model

import (
	"errors"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
)

const campaignLeaderboardSize = 50

type CampaignFileView struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

type CampaignChallengeView struct {
	Id           string             `json:"id"`
	Tier         string             `json:"tier"`
	Points       int                `json:"points"`
	Bonus        bool               `json:"bonus"`
	ImageURL     string             `json:"image_url,omitempty"`
	Title        string             `json:"title"`
	Prompt       string             `json:"prompt"`
	RewardQuota  int                `json:"reward_quota"`
	RewardYuan   float64            `json:"reward_yuan"`
	SolvedCount  int64              `json:"solved_count"`
	Solved       bool               `json:"solved"`
	AwardedQuota int                `json:"awarded_quota"`
	AwardedYuan  float64            `json:"awarded_yuan"`
	Files        []CampaignFileView `json:"files"`
	Widget       string             `json:"widget"`
	WidgetData   string             `json:"widget_data"`
	Hints        []string           `json:"hints"`
}

type CampaignParticipantView struct {
	Guest        bool    `json:"guest"`
	Bound        bool    `json:"bound"`
	Points       int     `json:"points"`
	Rank         int     `json:"rank"`
	SolvedCount  int     `json:"solved_count"`
	Eligible     bool    `json:"eligible"`
	RewardSlot   int     `json:"reward_slot"`
	SolveQuota   int     `json:"solve_quota"`
	ShareQuota   int     `json:"share_quota"`
	RankQuota    int     `json:"rank_quota"`
	TotalQuota   int     `json:"total_quota"`
	SolveYuan    float64 `json:"solve_yuan"`
	ShareYuan    float64 `json:"share_yuan"`
	RankYuan     float64 `json:"rank_yuan"`
	TotalYuan    float64 `json:"total_yuan"`
	ShareClaimed bool    `json:"share_claimed"`
	ShareReady   bool    `json:"share_ready"`
	CanShare     bool    `json:"can_share"`
	FinalRank    int     `json:"final_rank"`
}

type CampaignLeaderboardRow struct {
	Rank        int    `json:"rank"`
	UserId      int    `json:"user_id"`
	Name        string `json:"name"`
	Points      int    `json:"points"`
	SolvedCount int    `json:"solved_count"`
	Eligible    bool   `json:"eligible"`
	FinalRank   int    `json:"final_rank"`
}

type CampaignStatus struct {
	Slug             string                   `json:"slug"`
	Title            string                   `json:"title"`
	Enabled          bool                     `json:"enabled"`
	State            string                   `json:"state"`
	ServerTime       int64                    `json:"server_time"`
	StartsAt         int64                    `json:"starts_at"`
	EndsAt           int64                    `json:"ends_at"`
	ClaimDeadline    int64                    `json:"claim_deadline"`
	RewardSlots      int                      `json:"reward_slots"`
	SlotsLeft        int                      `json:"slots_left"`
	TotalPoints      int                      `json:"total_points"`
	ShareYuan        float64                  `json:"share_yuan"`
	RankingYuan      []float64                `json:"ranking_yuan"`
	RewardPoolYuan   float64                  `json:"reward_pool_yuan"`
	Participants     int64                    `json:"participants"`
	SolveCount       int64                    `json:"solve_count"`
	RankingSettledAt int64                    `json:"ranking_settled_at"`
	Challenges       []CampaignChallengeView  `json:"challenges"`
	Me               CampaignParticipantView  `json:"me"`
	Leaderboard      []CampaignLeaderboardRow `json:"leaderboard"`
}

type campaignChallengeCount struct {
	ChallengeId string `gorm:"column:challenge_id"`
	Total       int64  `gorm:"column:total"`
}

// GetCampaignStatus assembles everything the event page needs in one read. The
// prompt stays hidden before the start so the puzzle text is not published
// ahead of the opening time.
func GetCampaignStatus(userId int, guestToken string, now time.Time) (CampaignStatus, error) {
	definition := registeredCampaign()
	if definition == nil || CurrentCampaign() == nil {
		return CampaignStatus{}, ErrCampaignClosed
	}
	challenges := definition.Challenges
	rankingPoints := definition.RankingPoints
	sharePoints := definition.SharePoints
	if sharePoints <= 0 {
		sharePoints = campaignSharePoints
	}
	window := CurrentCampaignWindow(now)
	status := CampaignStatus{
		Slug:          definition.Slug,
		Title:         definition.Title,
		Enabled:       window.Enabled,
		State:         window.State,
		ServerTime:    now.Unix(),
		StartsAt:      window.StartsAt,
		EndsAt:        window.EndsAt,
		ClaimDeadline: window.ClaimDeadline,
		RewardSlots:   window.RewardSlots,
		TotalPoints:   campaignTotalPoints(),
		ShareYuan:     campaignQuotaYuan(campaignRewardQuota(sharePoints)),
	}
	var rankingQuota int
	status.RankingYuan = make([]float64, len(rankingPoints))
	for i := range rankingPoints {
		quota := campaignRewardQuota(rankingPoints[i])
		rankingQuota += quota
		status.RankingYuan[i] = campaignQuotaYuan(quota)
	}
	slotQuota := campaignRewardQuota(campaignTotalRewardPoints() + sharePoints)
	status.RewardPoolYuan = campaignQuotaYuan(slotQuota*window.RewardSlots + rankingQuota)

	var state CampaignState
	if err := DB.First(&state, campaignStateId).Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return status, err
		}
		state.NextSlot = 1
	}
	status.SlotsLeft = min(window.RewardSlots, max(0, window.RewardSlots-(state.NextSlot-1)))
	status.RankingSettledAt = state.RankingSettledAt

	if err := DB.Model(&CampaignParticipant{}).
		Where("user_id IS NOT NULL AND solved_count > 0").Count(&status.Participants).Error; err != nil {
		return status, err
	}
	if err := DB.Model(&CampaignSolve{}).Count(&status.SolveCount).Error; err != nil {
		return status, err
	}
	var counts []campaignChallengeCount
	if err := DB.Model(&CampaignSolve{}).Select("challenge_id, COUNT(*) AS total").
		Group("challenge_id").Scan(&counts).Error; err != nil {
		return status, err
	}
	solvedCounts := make(map[string]int64, len(counts))
	for i := range counts {
		solvedCounts[counts[i].ChallengeId] = counts[i].Total
	}

	participant, err := campaignStatusParticipant(userId, guestToken)
	if err != nil {
		return status, err
	}
	solved := make(map[string]bool, len(challenges))
	awarded := make(map[string]int, len(challenges))
	status.Me.Guest = userId <= 0
	if participant != nil {
		var solves []CampaignSolve
		if err := DB.Where("participant_id = ?", participant.Id).Find(&solves).Error; err != nil {
			return status, err
		}
		for i := range solves {
			solved[solves[i].ChallengeId] = true
		}
		if participant.UserId != nil {
			var awards []CampaignAward
			if err := DB.Where("user_id = ?", *participant.UserId).Find(&awards).Error; err != nil {
				return status, err
			}
			for i := range awards {
				switch awards[i].Kind {
				case CampaignAwardSolve:
					awarded[awards[i].ChallengeId] += awards[i].Quota
				case CampaignAwardShare:
					status.Me.ShareQuota += awards[i].Quota
				case CampaignAwardRanking:
					status.Me.RankQuota += awards[i].Quota
				}
			}
		}
		campaignFillParticipantView(&status.Me, participant, solved, awarded, window, now)
		if userId > 0 && participant.SolvedCount > 0 {
			if err := campaignParticipantRank(participant, &status.Me); err != nil {
				return status, err
			}
		}
	}
	status.Me.TotalQuota = status.Me.SolveQuota + status.Me.ShareQuota + status.Me.RankQuota
	status.Me.SolveYuan = campaignQuotaYuan(status.Me.SolveQuota)
	status.Me.ShareYuan = campaignQuotaYuan(status.Me.ShareQuota)
	status.Me.RankYuan = campaignQuotaYuan(status.Me.RankQuota)
	status.Me.TotalYuan = campaignQuotaYuan(status.Me.TotalQuota)

	hidePrompt := window.State == CampaignStateScheduled || window.State == CampaignStateDisabled
	status.Challenges = make([]CampaignChallengeView, 0, len(challenges))
	for i := range challenges {
		view := CampaignChallengeView{
			Id:           challenges[i].Id,
			Tier:         challenges[i].Tier,
			Points:       challenges[i].Points,
			Title:        challenges[i].Title,
			RewardQuota:  campaignRewardQuota(campaignSolveRewardPoints(challenges[i].Id, challenges[i].Points)),
			Bonus:        challenges[i].Bonus,
			SolvedCount:  solvedCounts[challenges[i].Id],
			Solved:       solved[challenges[i].Id],
			AwardedQuota: awarded[challenges[i].Id],
		}
		view.RewardYuan = campaignQuotaYuan(view.RewardQuota)
		view.AwardedYuan = campaignQuotaYuan(view.AwardedQuota)
		view.Widget = challenges[i].Widget
		view.WidgetData = challenges[i].WidgetData
		view.Hints = challenges[i].Hints
		for _, name := range challenges[i].Files {
			view.Files = append(view.Files, CampaignFileView{Name: name, URL: campaignFileURL(name)})
		}
		if !hidePrompt {
			view.Prompt = challenges[i].Prompt
			if challenges[i].Image != "" {
				view.ImageURL = campaignFileURL(challenges[i].Image)
			}
		}
		status.Challenges = append(status.Challenges, view)
	}

	if err := campaignFillLeaderboard(&status); err != nil {
		return status, err
	}
	return status, nil
}

func campaignStatusParticipant(userId int, guestToken string) (*CampaignParticipant, error) {
	var participant CampaignParticipant
	if userId > 0 {
		err := DB.Where("user_id = ?", userId).First(&participant).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		if err != nil {
			return nil, err
		}
		return &participant, nil
	}
	if strings.TrimSpace(guestToken) == "" {
		return nil, nil
	}
	err := DB.Where("guest_token = ?", guestToken).First(&participant).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &participant, nil
}

func campaignFillParticipantView(view *CampaignParticipantView, participant *CampaignParticipant, solved map[string]bool, awarded map[string]int, window CampaignEventWindow, now time.Time) {
	view.Bound = participant.UserId != nil
	view.Points = participant.Points
	view.SolvedCount = participant.SolvedCount
	view.Eligible = participant.RewardSlot > 0
	view.RewardSlot = participant.RewardSlot
	view.ShareClaimed = participant.ShareClaimedAt > 0
	view.FinalRank = participant.FinalRank
	for _, quota := range awarded {
		view.SolveQuota += quota
	}
	view.ShareReady = campaignSolvedIds(solved, campaignShareChallengeIds())
	view.CanShare = view.Eligible && view.ShareReady && !view.ShareClaimed &&
		window.State != CampaignStateScheduled && now.Unix() <= window.ClaimDeadline
}

func campaignSolvedIds(solved map[string]bool, ids []string) bool {
	for _, id := range ids {
		if !solved[id] {
			return false
		}
	}
	return len(ids) > 0
}

func campaignParticipantRank(participant *CampaignParticipant, view *CampaignParticipantView) error {
	if participant.UserId == nil || slices.Contains(operation_setting.GetCampaignSetting().ExcludedUserIds, *participant.UserId) {
		return nil
	}
	var better int64
	err := campaignRankedParticipants(DB).
		Where("points > ? OR (points = ? AND (last_solve_at < ? OR (last_solve_at = ? AND id < ?)))",
			participant.Points, participant.Points, participant.LastSolveAt, participant.LastSolveAt, participant.Id).
		Count(&better).Error
	if err != nil {
		return err
	}
	view.Rank = int(better) + 1
	return nil
}

func campaignFillLeaderboard(status *CampaignStatus) error {
	var top []CampaignParticipant
	if err := campaignRankedParticipants(DB).Where("solved_count > 0").
		Order("points DESC, last_solve_at ASC, id ASC").
		Limit(campaignLeaderboardSize).
		Find(&top).Error; err != nil {
		return err
	}
	names, err := campaignNamesFor(DB, top)
	if err != nil {
		return err
	}
	status.Leaderboard = make([]CampaignLeaderboardRow, 0, len(top))
	for i := range top {
		row := CampaignLeaderboardRow{
			Rank:        i + 1,
			Points:      top[i].Points,
			SolvedCount: top[i].SolvedCount,
			Eligible:    top[i].RewardSlot > 0,
			FinalRank:   top[i].FinalRank,
		}
		if top[i].UserId != nil {
			row.UserId = *top[i].UserId
			row.Name = names[row.UserId]
		}
		status.Leaderboard = append(status.Leaderboard, row)
	}
	return nil
}

func campaignNamesFor(tx *gorm.DB, participants []CampaignParticipant) (map[int]string, error) {
	ids := make([]int, 0, len(participants))
	for i := range participants {
		if participants[i].UserId != nil {
			ids = append(ids, *participants[i].UserId)
		}
	}
	names := make(map[int]string, len(ids))
	if len(ids) == 0 {
		return names, nil
	}
	var users []User
	if err := tx.Select("id", "username", "display_name").Where("id IN ?", ids).Find(&users).Error; err != nil {
		return nil, err
	}
	for i := range users {
		names[users[i].Id] = campaignPublicName(users[i])
	}
	return names, nil
}

// campaignPublicName masks both display names and fallback usernames before they
// leave the server. Neither source is safe to publish as-is on the public board.
func campaignPublicName(user User) string {
	name := strings.TrimSpace(user.DisplayName)
	if name == "" {
		name = strings.TrimSpace(user.Username)
	}
	runes := []rune(name)
	if len(runes) <= 1 {
		return "***"
	}
	visible := min(2, len(runes)-1)
	return string(runes[:visible]) + "***"
}
