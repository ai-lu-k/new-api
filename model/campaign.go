package model

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	CampaignStateDisabled  = "disabled"
	CampaignStateScheduled = "scheduled"
	CampaignStateActive    = "active"
	CampaignStateEnded     = "ended"

	CampaignAwardSolve   = "solve"
	CampaignAwardShare   = "share"
	CampaignAwardRanking = "ranking"

	campaignStateId = 1
)

// campaignSharePoints is the default share reward in points; a campaign may
// override it through its definition.
const campaignSharePoints = 20

var (
	ErrCampaignClosed           = errors.New("活动未开放")
	ErrCampaignNotStarted       = errors.New("活动还没开始")
	ErrCampaignEnded            = errors.New("活动已结束")
	ErrCampaignChallengeUnknown = errors.New("没有这道题")
	ErrCampaignWrongAnswer      = errors.New("答案不对，再试试")
	ErrCampaignGuestMissing     = errors.New("缺少游客身份，请刷新页面")
	ErrCampaignClaimClosed      = errors.New("游客补领已截止")
	ErrCampaignNotEligible      = errors.New("不在奖励名额内")
	ErrCampaignNotParticipating = errors.New("解出第一题后才能参与")
	ErrCampaignShareLocked      = errors.New("先解出入门两题")
	ErrCampaignRankingNotReady  = errors.New("活动还没结束，暂时不能结算排名奖励")
	ErrCampaignRankingSettled   = errors.New("排名奖励已经结算过了")
	ErrCampaignRankingEmpty     = errors.New("没有可结算的参赛者")
)

// CampaignConfig is the operator window of the campaign this build serves.
type CampaignConfig struct {
	Enabled         bool
	StartDate       string
	EndDate         string
	ClaimDeadline   string
	RewardSlots     int
	ExcludedUserIds []int
}

// CampaignChallenge is one puzzle of a campaign. Only the SHA-256 of each
// accepted answer is stored, so the answer never appears in API payloads or
// logs. Bonus challenges score on the board without paying a solve reward.
type CampaignChallenge struct {
	Id         string
	Tier       string
	Points     int
	Bonus      bool
	Image      string
	Title      string
	Prompt     string
	Files      []string
	Widget     string
	WidgetData string
	Hints      []string
	answers    []string
}

// Campaign tiers label a challenge's difficulty; a campaign picks from this set.
const (
	CampaignTierBeginner = "beginner"
	CampaignTierAdvanced = "advanced"
	CampaignTierHard     = "hard"
	CampaignTierFinal    = "final"
)

// CampaignDefinition is everything the shared machinery needs from one concrete
// campaign: its identity, its published puzzle set, and the operator window that
// turns it on. A campaign lives in its own campaign_<slug>.go file and registers
// itself from init(), so the shared code never names a campaign.
type CampaignDefinition struct {
	Slug          string
	Title         string
	SharePoints   int
	RankingPoints []int
	Challenges    []CampaignChallenge
	Configure     func() CampaignConfig
	ReadFile      func(name string) ([]byte, error)
}

var campaignRegistry []*CampaignDefinition

// RegisterCampaign adds a campaign this build can serve.
func RegisterCampaign(definition *CampaignDefinition) {
	campaignRegistry = append(campaignRegistry, definition)
}

// registeredCampaign is the campaign this build carries, whether or not the
// operator switched it on. The puzzle set and the paid configuration belong to
// it; only the routes care about the switch.
func registeredCampaign() *CampaignDefinition {
	if len(campaignRegistry) == 0 {
		return nil
	}
	return campaignRegistry[0]
}

// CurrentCampaign returns the campaign being served, or nil when none is
// registered or the operator has it switched off. Every campaign route is
// unreachable while it returns nil.
func CurrentCampaign() *CampaignDefinition {
	definition := registeredCampaign()
	if definition == nil || definition.Configure == nil || !definition.Configure().Enabled {
		return nil
	}
	return definition
}

func currentCampaignConfig() CampaignConfig {
	if definition := CurrentCampaign(); definition != nil {
		return definition.Configure()
	}
	return CampaignConfig{}
}

func campaignChallenges() []CampaignChallenge {
	if definition := registeredCampaign(); definition != nil {
		return definition.Challenges
	}
	return nil
}

func campaignFindChallenge(id string) *CampaignChallenge {
	challenges := campaignChallenges()
	for i := range challenges {
		if challenges[i].Id == id {
			return &challenges[i]
		}
	}
	return nil
}

func campaignTotalPoints() int {
	total := 0
	for _, challenge := range campaignChallenges() {
		total += challenge.Points
	}
	return total
}

// campaignShareChallengeIds identifies the first two published challenges.
// Sharing stays tied to progress through the board, independently of tier or
// stable ID.
func campaignShareChallengeIds() []string {
	challenges := campaignChallenges()
	ids := make([]string, 0, min(2, len(challenges)))
	for i := range min(2, len(challenges)) {
		ids = append(ids, challenges[i].Id)
	}
	return ids
}

// campaignSolveRewardPoints keeps bonus scores out of both immediate and guest
// payouts.
func campaignSolveRewardPoints(id string, points int) int {
	challenge := campaignFindChallenge(id)
	if challenge != nil && challenge.Bonus {
		return 0
	}
	return points
}

func campaignTotalRewardPoints() int {
	total := 0
	for _, challenge := range campaignChallenges() {
		total += campaignSolveRewardPoints(challenge.Id, challenge.Points)
	}
	return total
}

// campaignNormalizeAnswer drops the noise that copied answers collect, so a
// trailing newline or a case difference does not lose a solve.
func campaignNormalizeAnswer(answer string) string {
	return strings.ToLower(strings.TrimSpace(answer))
}

func campaignAnswerMatches(challenge *CampaignChallenge, answer string) bool {
	digest := sha256.Sum256([]byte(campaignNormalizeAnswer(answer)))
	submitted := hex.EncodeToString(digest[:])
	for _, expected := range challenge.answers {
		if subtle.ConstantTimeCompare([]byte(submitted), []byte(expected)) == 1 {
			return true
		}
	}
	return false
}

// CampaignParticipant is one entrant of a campaign. An account has UserId set;
// a visitor who solved before signing in has GuestToken instead. Merging the
// guest row into the account consumes the token, so it cannot bind twice.
type CampaignParticipant struct {
	Id             int     `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId         *int    `json:"user_id" gorm:"uniqueIndex"`
	GuestToken     *string `json:"-" gorm:"size:64;uniqueIndex"`
	RewardSlot     int     `json:"reward_slot" gorm:"not null;default:0"`
	Points         int     `json:"points" gorm:"not null;default:0"`
	SolvedCount    int     `json:"solved_count" gorm:"not null;default:0"`
	FirstSolveAt   int64   `json:"first_solve_at" gorm:"bigint;not null;default:0"`
	LastSolveAt    int64   `json:"last_solve_at" gorm:"bigint;not null;default:0"`
	ShareClaimedAt int64   `json:"share_claimed_at" gorm:"bigint;not null;default:0"`
	FinalRank      int     `json:"final_rank" gorm:"not null;default:0"`
	CreatedAt      int64   `json:"created_at" gorm:"bigint;not null;default:0"`
	BoundAt        int64   `json:"bound_at" gorm:"bigint;not null;default:0"`
}

// TableName keeps the archived 1024 run's physical name: the table holds the
// historical standings, and renaming it would need a cross-dialect data
// migration for no behavioural gain.
func (CampaignParticipant) TableName() string {
	return "ctf_participants"
}

// CampaignSolve records one correct answer. Points never change after the solve, so
// a later rule edit cannot rewrite history.
type CampaignSolve struct {
	Id            int    `json:"id" gorm:"primaryKey;autoIncrement"`
	ParticipantId int    `json:"participant_id" gorm:"not null;uniqueIndex:idx_ctf_solve_once"`
	ChallengeId   string `json:"challenge_id" gorm:"size:16;not null;uniqueIndex:idx_ctf_solve_once"`
	Points        int    `json:"points" gorm:"not null"`
	SolvedAt      int64  `json:"solved_at" gorm:"bigint;not null;index"`
}

// TableName keeps the archived 1024 run's physical name, like the participant
// table; the index name carries it too.
func (CampaignSolve) TableName() string {
	return "ctf_solves"
}

// CampaignAward is the money ledger of the event: one row per paid entitlement.
// The unique key makes every award idempotent, and finance reads gifts here.
type CampaignAward struct {
	Id            int    `json:"id" gorm:"primaryKey;autoIncrement"`
	ParticipantId int    `json:"participant_id" gorm:"not null;index"`
	UserId        int    `json:"user_id" gorm:"not null;uniqueIndex:idx_ctf_award_once;index"`
	Kind          string `json:"kind" gorm:"size:16;not null;uniqueIndex:idx_ctf_award_once"`
	ChallengeId   string `json:"challenge_id" gorm:"size:16;not null;default:'';uniqueIndex:idx_ctf_award_once"`
	Quota         int    `json:"quota" gorm:"not null"`
	CreatedAt     int64  `json:"created_at" gorm:"bigint;not null;index"`
}

// TableName keeps the archived 1024 run's physical name: finance reads the
// historical awards from it, so the ledger survives every later campaign.
func (CampaignAward) TableName() string {
	return "ctf_awards"
}

// CampaignState is the single row that serializes reward-slot allocation and
// remembers whether the ranking prizes were already paid out.
type CampaignState struct {
	Id               int   `json:"id" gorm:"primaryKey;autoIncrement:false"`
	NextSlot         int   `json:"next_slot" gorm:"not null;default:1"`
	RankingSettledAt int64 `json:"ranking_settled_at" gorm:"bigint;not null;default:0"`
}

// TableName keeps the archived 1024 run's physical name for the same reason.
func (CampaignState) TableName() string {
	return "ctf_states"
}

// CampaignEventWindow is the resolved event schedule. Dates are calendar days in
// Asia/Shanghai; the last configured day is included until 23:59:59.
type CampaignEventWindow struct {
	Enabled       bool
	State         string
	StartsAt      int64
	EndsAt        int64
	ClaimDeadline int64
	RewardSlots   int
}

// CurrentCampaignWindow resolves the operator settings. A campaign with a
// missing or malformed window stays closed instead of guessing dates.
func CurrentCampaignWindow(now time.Time) CampaignEventWindow {
	setting := currentCampaignConfig()
	window := CampaignEventWindow{Enabled: setting.Enabled, RewardSlots: max(1, setting.RewardSlots)}
	if !setting.Enabled {
		window.State = CampaignStateDisabled
		return window
	}
	shanghai := time.FixedZone("Asia/Shanghai", 8*60*60)
	start, startOK := campaignParseEventDay(setting.StartDate, shanghai)
	end, endOK := campaignParseEventDay(setting.EndDate, shanghai)
	if !startOK || !endOK || end.Before(start) {
		window.State = CampaignStateDisabled
		return window
	}
	window.StartsAt = start.Unix()
	window.EndsAt = end.Add(24*time.Hour - time.Second).Unix()
	window.ClaimDeadline = window.EndsAt
	if deadline, ok := campaignParseEventDay(setting.ClaimDeadline, shanghai); ok && !deadline.Before(start) {
		window.ClaimDeadline = deadline.Add(24*time.Hour - time.Second).Unix()
	}
	switch {
	case now.Unix() < window.StartsAt:
		window.State = CampaignStateScheduled
	case now.Unix() > window.EndsAt:
		window.State = CampaignStateEnded
	default:
		window.State = CampaignStateActive
	}
	return window
}

func campaignParseEventDay(value string, loc *time.Location) (time.Time, bool) {
	day, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(value), loc)
	if err != nil {
		return time.Time{}, false
	}
	return day, true
}

func campaignWindowStateError(state string) error {
	switch state {
	case CampaignStateDisabled:
		return ErrCampaignClosed
	case CampaignStateScheduled:
		return ErrCampaignNotStarted
	case CampaignStateEnded:
		return ErrCampaignEnded
	}
	return nil
}

// NewCampaignGuestToken returns an unguessable visitor identity for the event.
func NewCampaignGuestToken() (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

// campaignRewardQuota converts published points into wallet quota: 100 points are
// ¥1, and one unit of wallet quota is 1/USDExchangeRate of a yuan.
func campaignRewardQuota(points int) int {
	rate := operation_setting.USDExchangeRate
	if rate <= 0 || points <= 0 {
		return 0
	}
	return common.QuotaRound(float64(points) * common.QuotaPerUnit / (100 * rate))
}

// campaignQuotaYuan renders a quota amount back in yuan for the promised reward.
func campaignQuotaYuan(quota int) float64 {
	if common.QuotaPerUnit <= 0 {
		return 0
	}
	return math.Round(float64(quota)/common.QuotaPerUnit*operation_setting.USDExchangeRate*100) / 100
}

func campaignLockState(tx *gorm.DB) (*CampaignState, error) {
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).
		Create(&CampaignState{Id: campaignStateId, NextSlot: 1}).Error; err != nil {
		return nil, err
	}
	var state CampaignState
	if err := lockForUpdate(tx).First(&state, campaignStateId).Error; err != nil {
		return nil, err
	}
	return &state, nil
}

func campaignLoadParticipant(tx *gorm.DB, userId int, guestToken string) (*CampaignParticipant, error) {
	query := lockForUpdate(tx)
	if userId > 0 {
		query = query.Where("user_id = ?", userId)
	} else if guestToken != "" {
		query = query.Where("guest_token = ?", guestToken)
	} else {
		return nil, ErrCampaignGuestMissing
	}
	var participant CampaignParticipant
	err := query.First(&participant).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &participant, nil
}

func campaignCreateParticipant(tx *gorm.DB, userId int, guestToken string, now time.Time) (*CampaignParticipant, error) {
	participant := CampaignParticipant{CreatedAt: now.Unix()}
	if userId > 0 {
		participant.UserId = &userId
		participant.BoundAt = now.Unix()
	} else {
		if guestToken == "" {
			return nil, ErrCampaignGuestMissing
		}
		participant.GuestToken = &guestToken
	}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&participant).Error; err != nil {
		return nil, err
	}
	return campaignLoadParticipant(tx, userId, guestToken)
}

// campaignAssignRewardSlot hands out the next of the 100 reward slots. The state
// row lock makes concurrent first solves and guest claims deterministic.
func campaignAssignRewardSlot(tx *gorm.DB, participant *CampaignParticipant, slots int) error {
	if participant.RewardSlot > 0 {
		return nil
	}
	state, err := campaignLockState(tx)
	if err != nil {
		return err
	}
	if state.NextSlot < 1 || state.NextSlot > slots {
		return nil
	}
	if err := tx.Model(&CampaignParticipant{}).Where("id = ?", participant.Id).
		UpdateColumn("reward_slot", state.NextSlot).Error; err != nil {
		return err
	}
	if err := tx.Model(&CampaignState{}).Where("id = ?", state.Id).
		UpdateColumn("next_slot", state.NextSlot+1).Error; err != nil {
		return err
	}
	participant.RewardSlot = state.NextSlot
	return nil
}

// campaignCreditQuota pays an event prize. Prizes are given away, so the same
// conditional update also marks the money as gift: spending it later must not
// count toward the consumption level.
func campaignCreditQuota(tx *gorm.DB, userId int, quota int) error {
	if err := common.ValidateWalletQuota(quota); err != nil {
		return err
	}
	if err := CreditGiftQuota(tx, userId, quota); err != nil {
		if errors.Is(err, ErrWalletQuotaLimitExceeded) {
			return errors.New("活动奖励超出钱包上限，未入账")
		}
		return err
	}
	return nil
}

// campaignGrantAward pays once per (user, kind, challenge). A duplicate call is a
// no-op, which keeps retries and concurrent submissions from paying twice.
func campaignGrantAward(tx *gorm.DB, participant *CampaignParticipant, userId int, kind, challengeId string, points int, now time.Time) (int, error) {
	quota := campaignRewardQuota(points)
	if quota <= 0 {
		return 0, nil
	}
	award := CampaignAward{
		ParticipantId: participant.Id,
		UserId:        userId,
		Kind:          kind,
		ChallengeId:   challengeId,
		Quota:         quota,
		CreatedAt:     now.Unix(),
	}
	result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&award)
	if result.Error != nil {
		return 0, result.Error
	}
	if result.RowsAffected == 0 {
		return 0, nil
	}
	if err := campaignCreditQuota(tx, userId, quota); err != nil {
		return 0, err
	}
	return quota, nil
}

// campaignSyncAwardCache finishes a committed payout: it moves the cached balance
// and writes the bill entry, so the reward is visible in the user's own log and
// not only on the event page. reason names the entitlement in that entry.
func campaignSyncAwardCache(userId int, quota int, reason string) {
	if quota <= 0 {
		return
	}
	syncCreditUserQuotaCache(userId, quota, "campaign reward")
	RecordLog(userId, LogTypeSystem, fmt.Sprintf("活动奖励（%s）%s", reason, logger.LogQuota(quota)))
}

// CampaignSubmitResult is what a visitor sees right after a submission.
type CampaignSubmitResult struct {
	Correct       bool    `json:"correct"`
	AlreadySolved bool    `json:"already_solved"`
	ChallengeId   string  `json:"challenge_id"`
	Points        int     `json:"points"`
	AwardedQuota  int     `json:"awarded_quota"`
	AwardedYuan   float64 `json:"awarded_yuan"`
	TotalPoints   int     `json:"total_points"`
	SolvedCount   int     `json:"solved_count"`
	RewardSlot    int     `json:"reward_slot"`
	Eligible      bool    `json:"eligible"`
	Guest         bool    `json:"guest"`
}

// SubmitCampaignAnswer verifies an answer and records the solve. Accounts are paid
// as soon as they solve; visitors keep score until they sign in and claim.
func SubmitCampaignAnswer(userId int, guestToken, challengeId, answer string, now time.Time) (CampaignSubmitResult, error) {
	window := CurrentCampaignWindow(now)
	if err := campaignWindowStateError(window.State); err != nil {
		return CampaignSubmitResult{}, err
	}
	challenge := campaignFindChallenge(challengeId)
	if challenge == nil {
		return CampaignSubmitResult{}, ErrCampaignChallengeUnknown
	}
	if len(answer) > 256 {
		return CampaignSubmitResult{}, ErrCampaignWrongAnswer
	}
	if !campaignAnswerMatches(challenge, answer) {
		return CampaignSubmitResult{}, ErrCampaignWrongAnswer
	}
	guest := userId <= 0
	if guest && strings.TrimSpace(guestToken) == "" {
		return CampaignSubmitResult{}, ErrCampaignGuestMissing
	}
	if !guest {
		guestToken = ""
	}

	result := CampaignSubmitResult{Correct: true, ChallengeId: challenge.Id, Points: challenge.Points, Guest: guest}
	credited := 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		participant, err := campaignLoadParticipant(tx, userId, guestToken)
		if err != nil {
			return err
		}
		if participant == nil {
			participant, err = campaignCreateParticipant(tx, userId, guestToken, now)
			if err != nil {
				return err
			}
		}
		solve := CampaignSolve{
			ParticipantId: participant.Id,
			ChallengeId:   challenge.Id,
			Points:        challenge.Points,
			SolvedAt:      now.Unix(),
		}
		insert := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&solve)
		if insert.Error != nil {
			return insert.Error
		}
		if insert.RowsAffected == 0 {
			result.AlreadySolved = true
			result.TotalPoints = participant.Points
			result.SolvedCount = participant.SolvedCount
			result.RewardSlot = participant.RewardSlot
			result.Eligible = participant.RewardSlot > 0
			return nil
		}
		if err := campaignApplySolve(tx, participant, &solve, window, now, &credited, &result); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return CampaignSubmitResult{}, err
	}
	if credited > 0 {
		campaignSyncAwardCache(userId, credited, "解谜")
	}
	result.AwardedYuan = campaignQuotaYuan(result.AwardedQuota)
	return result, nil
}

// campaignApplySolve moves the scoreboard and, for an account, pays the solve when
// the entrant holds one of the reward slots.
func campaignApplySolve(tx *gorm.DB, participant *CampaignParticipant, solve *CampaignSolve, window CampaignEventWindow, now time.Time, credited *int, result *CampaignSubmitResult) error {
	participant.Points += solve.Points
	participant.SolvedCount++
	if participant.FirstSolveAt == 0 || solve.SolvedAt < participant.FirstSolveAt {
		participant.FirstSolveAt = solve.SolvedAt
	}
	if solve.SolvedAt > participant.LastSolveAt {
		participant.LastSolveAt = solve.SolvedAt
	}
	if err := tx.Model(&CampaignParticipant{}).Where("id = ?", participant.Id).Updates(map[string]any{
		"points":         participant.Points,
		"solved_count":   participant.SolvedCount,
		"first_solve_at": participant.FirstSolveAt,
		"last_solve_at":  participant.LastSolveAt,
	}).Error; err != nil {
		return err
	}
	rewardPoints := campaignSolveRewardPoints(solve.ChallengeId, solve.Points)
	if participant.UserId != nil && rewardPoints > 0 {
		if err := campaignAssignRewardSlot(tx, participant, window.RewardSlots); err != nil {
			return err
		}
		if participant.RewardSlot > 0 {
			quota, err := campaignGrantAward(tx, participant, *participant.UserId, CampaignAwardSolve, solve.ChallengeId, rewardPoints, now)
			if err != nil {
				return err
			}
			result.AwardedQuota = quota
			*credited += quota
		}
	}
	result.TotalPoints = participant.Points
	result.SolvedCount = participant.SolvedCount
	result.RewardSlot = participant.RewardSlot
	result.Eligible = participant.RewardSlot > 0
	return nil
}

// ClaimCampaignGuest binds the visitor's progress to the signed-in account, then
// pays the solves that were made before signing in. Binding works after the
// claim deadline as well; only the payout stops.
func ClaimCampaignGuest(userId int, guestToken string, now time.Time) (CampaignStatus, error) {
	window := CurrentCampaignWindow(now)
	if window.State == CampaignStateDisabled {
		return CampaignStatus{}, ErrCampaignClosed
	}
	guestToken = strings.TrimSpace(guestToken)
	if guestToken != "" {
		if err := campaignMergeGuestProgress(userId, guestToken, window, now); err != nil {
			return CampaignStatus{}, err
		}
	}
	return GetCampaignStatus(userId, "", now)
}

func campaignMergeGuestProgress(userId int, guestToken string, window CampaignEventWindow, now time.Time) error {
	credited := 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		var guest CampaignParticipant
		err := lockForUpdate(tx).Where("guest_token = ?", guestToken).First(&guest).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		if err != nil {
			return err
		}
		if guest.UserId != nil {
			return nil
		}
		account, err := campaignLoadParticipant(tx, userId, "")
		if err != nil {
			return err
		}
		if account == nil {
			account, err = campaignCreateParticipant(tx, userId, "", now)
			if err != nil {
				return err
			}
		}
		var solves []CampaignSolve
		if err := tx.Where("participant_id = ?", guest.Id).Order("solved_at ASC, id ASC").Find(&solves).Error; err != nil {
			return err
		}
		claimable := window.State != CampaignStateScheduled && now.Unix() <= window.ClaimDeadline
		merged := 0
		for i := range solves {
			move := CampaignSolve{
				ParticipantId: account.Id,
				ChallengeId:   solves[i].ChallengeId,
				Points:        solves[i].Points,
				SolvedAt:      solves[i].SolvedAt,
			}
			insert := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&move)
			if insert.Error != nil {
				return insert.Error
			}
			if insert.RowsAffected == 0 {
				continue
			}
			merged++
			account.Points += move.Points
			account.SolvedCount++
			if account.FirstSolveAt == 0 || move.SolvedAt < account.FirstSolveAt {
				account.FirstSolveAt = move.SolvedAt
			}
			if move.SolvedAt > account.LastSolveAt {
				account.LastSolveAt = move.SolvedAt
			}
			rewardPoints := campaignSolveRewardPoints(move.ChallengeId, move.Points)
			if !claimable || rewardPoints == 0 {
				continue
			}
			if err := campaignAssignRewardSlot(tx, account, window.RewardSlots); err != nil {
				return err
			}
			if account.RewardSlot == 0 {
				continue
			}
			quota, err := campaignGrantAward(tx, account, userId, CampaignAwardSolve, move.ChallengeId, rewardPoints, now)
			if err != nil {
				return err
			}
			credited += quota
		}
		if merged > 0 {
			if err := tx.Model(&CampaignParticipant{}).Where("id = ?", account.Id).Updates(map[string]any{
				"points":         account.Points,
				"solved_count":   account.SolvedCount,
				"first_solve_at": account.FirstSolveAt,
				"last_solve_at":  account.LastSolveAt,
				"bound_at":       now.Unix(),
			}).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("participant_id = ?", guest.Id).Delete(&CampaignSolve{}).Error; err != nil {
			return err
		}
		return tx.Delete(&CampaignParticipant{}, guest.Id).Error
	})
	if err != nil {
		return err
	}
	campaignSyncAwardCache(userId, credited, "解谜")
	return nil
}

// CampaignShareResult reports the one-off share reward.
type CampaignShareResult struct {
	Quota          int     `json:"quota"`
	Yuan           float64 `json:"yuan"`
	AlreadyClaimed bool    `json:"already_claimed"`
}

// ClaimCampaignShare pays the share reward once, only for entrants holding a reward
// slot who finished both warm-up puzzles.
func ClaimCampaignShare(userId int, now time.Time) (CampaignShareResult, error) {
	definition := registeredCampaign()
	if definition == nil {
		return CampaignShareResult{}, ErrCampaignClosed
	}
	sharePoints := definition.SharePoints
	if sharePoints <= 0 {
		sharePoints = campaignSharePoints
	}
	window := CurrentCampaignWindow(now)
	switch window.State {
	case CampaignStateDisabled:
		return CampaignShareResult{}, ErrCampaignClosed
	case CampaignStateScheduled:
		return CampaignShareResult{}, ErrCampaignNotStarted
	}
	if now.Unix() > window.ClaimDeadline {
		return CampaignShareResult{}, ErrCampaignClaimClosed
	}
	result := CampaignShareResult{Quota: campaignRewardQuota(sharePoints), Yuan: campaignQuotaYuan(campaignRewardQuota(sharePoints))}
	err := DB.Transaction(func(tx *gorm.DB) error {
		participant, err := campaignLoadParticipant(tx, userId, "")
		if err != nil {
			return err
		}
		if participant == nil || participant.SolvedCount == 0 {
			return ErrCampaignNotParticipating
		}
		if participant.RewardSlot == 0 {
			return ErrCampaignNotEligible
		}
		if !campaignSolvedAll(tx, participant.Id, campaignShareChallengeIds()) {
			return ErrCampaignShareLocked
		}
		if participant.ShareClaimedAt > 0 {
			result.AlreadyClaimed = true
			return nil
		}
		quota, err := campaignGrantAward(tx, participant, userId, CampaignAwardShare, "", sharePoints, now)
		if err != nil {
			return err
		}
		result.Quota = quota
		result.Yuan = campaignQuotaYuan(quota)
		if err := tx.Model(&CampaignParticipant{}).Where("id = ?", participant.Id).
			UpdateColumn("share_claimed_at", now.Unix()).Error; err != nil {
			return err
		}
		participant.ShareClaimedAt = now.Unix()
		return nil
	})
	if err != nil {
		return CampaignShareResult{}, err
	}
	if !result.AlreadyClaimed {
		campaignSyncAwardCache(userId, result.Quota, "分享")
	}
	return result, nil
}

func campaignSolvedAll(tx *gorm.DB, participantId int, challengeIds []string) bool {
	if len(challengeIds) == 0 {
		return false
	}
	var count int64
	if err := tx.Model(&CampaignSolve{}).
		Where("participant_id = ? AND challenge_id IN ?", participantId, challengeIds).
		Count(&count).Error; err != nil {
		return false
	}
	return count == int64(len(challengeIds))
}

// CampaignRankingWinner is one paid ranking place.
type CampaignRankingWinner struct {
	Rank   int     `json:"rank"`
	UserId int     `json:"user_id"`
	Name   string  `json:"name"`
	Points int     `json:"points"`
	Quota  int     `json:"quota"`
	Yuan   float64 `json:"yuan"`
}

type CampaignRankingSettlement struct {
	SettledAt int64                   `json:"settled_at"`
	Winners   []CampaignRankingWinner `json:"winners"`
}

// campaignRankedParticipants keeps public standings and ranking payouts on the
// same eligible account set without changing progress or historical awards.
func campaignRankedParticipants(tx *gorm.DB) *gorm.DB {
	query := tx.Model(&CampaignParticipant{}).Where("user_id IS NOT NULL")
	if excluded := currentCampaignConfig().ExcludedUserIds; len(excluded) > 0 {
		query = query.Where("user_id NOT IN ?", excluded)
	}
	return query
}

// SettleCampaignRanking pays the top three eligible entrants once, after the event
// has closed. It is an explicit administrator action, never a timer.
func SettleCampaignRanking(now time.Time) (CampaignRankingSettlement, error) {
	definition := registeredCampaign()
	if definition == nil || len(definition.RankingPoints) == 0 {
		return CampaignRankingSettlement{}, ErrCampaignClosed
	}
	rankingPoints := definition.RankingPoints
	window := CurrentCampaignWindow(now)
	if !window.Enabled {
		return CampaignRankingSettlement{}, ErrCampaignClosed
	}
	if now.Unix() <= window.EndsAt {
		return CampaignRankingSettlement{}, ErrCampaignRankingNotReady
	}
	settlement := CampaignRankingSettlement{SettledAt: now.Unix()}
	credited := make(map[int]int)
	err := DB.Transaction(func(tx *gorm.DB) error {
		state, err := campaignLockState(tx)
		if err != nil {
			return err
		}
		if state.RankingSettledAt > 0 {
			return ErrCampaignRankingSettled
		}
		var top []CampaignParticipant
		if err := campaignRankedParticipants(tx).Where("reward_slot > 0 AND points > 0").
			Order("points DESC, last_solve_at ASC, id ASC").
			Limit(len(rankingPoints)).
			Find(&top).Error; err != nil {
			return err
		}
		if len(top) == 0 {
			return ErrCampaignRankingEmpty
		}
		names, err := campaignNamesFor(tx, top)
		if err != nil {
			return err
		}
		for i := range top {
			quota, err := campaignGrantAward(tx, &top[i], *top[i].UserId, CampaignAwardRanking, "", rankingPoints[i], now)
			if err != nil {
				return err
			}
			if err := tx.Model(&CampaignParticipant{}).Where("id = ?", top[i].Id).
				UpdateColumn("final_rank", i+1).Error; err != nil {
				return err
			}
			credited[*top[i].UserId] += quota
			settlement.Winners = append(settlement.Winners, CampaignRankingWinner{
				Rank:   i + 1,
				UserId: *top[i].UserId,
				Name:   names[*top[i].UserId],
				Points: top[i].Points,
				Quota:  quota,
				Yuan:   campaignQuotaYuan(quota),
			})
		}
		return tx.Model(&CampaignState{}).Where("id = ?", state.Id).
			UpdateColumn("ranking_settled_at", now.Unix()).Error
	})
	if err != nil {
		return CampaignRankingSettlement{}, err
	}
	for userId, quota := range credited {
		campaignSyncAwardCache(userId, quota, "排名")
	}
	common.SysLog("campaign ranking settled: " + campaignWinnerSummary(settlement.Winners))
	return settlement, nil
}

func campaignWinnerSummary(winners []CampaignRankingWinner) string {
	parts := make([]string, 0, len(winners))
	for i := range winners {
		parts = append(parts, "#"+strconv.Itoa(winners[i].Rank)+" user:"+strconv.Itoa(winners[i].UserId)+" quota:"+strconv.Itoa(winners[i].Quota))
	}
	return strings.Join(parts, ", ")
}

// campaignFileURL builds the published URL of one payload.
func campaignFileURL(name string) string {
	return "/api/campaign/files/" + name
}

// ReadCampaignFile hands one payload of the campaign being served to the file
// route, and refuses everything while no campaign is live.
func ReadCampaignFile(name string) ([]byte, error) {
	definition := CurrentCampaign()
	if definition == nil || definition.ReadFile == nil {
		return nil, ErrCampaignClosed
	}
	return definition.ReadFile(name)
}
