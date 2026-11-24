package model

import (
	"strconv"
	"strings"

	"gorm.io/gorm"
)

const (
	// botUsageModelLimit caps the per-model breakdown: a bot answer names a few
	// models, and a wider list only costs tokens without informing anyone.
	botUsageModelLimit = 8
	// botUsageErrorSampleLimit bounds how many error rows are classified. The
	// answer is a count per category, not a row dump, so a longer sample adds
	// nothing.
	botUsageErrorSampleLimit = 100
)

// BotAccount is the projection the support bot may see of one station account:
// enough to answer "how much balance do I have" and "is my account disabled".
// Password material, credentials, email and role never enter this shape.
type BotAccount struct {
	Id           int    `json:"id"`
	Username     string `json:"username"`
	Status       int    `json:"status"`
	Group        string `json:"group"`
	Quota        int    `json:"quota"`
	UsedQuota    int    `json:"used_quota"`
	RequestCount int    `json:"request_count"`
	CreatedAt    int64  `json:"created_at"`
}

// FindBotAccount resolves an exact username or a numeric user id. Like the log
// target lookup there is no prefix, fuzzy or email matching, so this cannot be
// used to enumerate accounts.
func FindBotAccount(identifier string) (*BotAccount, error) {
	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return nil, gorm.ErrRecordNotFound
	}
	query := DB.Model(&User{}).
		Select("id", "username", "status", commonGroupCol, "quota", "used_quota", "request_count", "created_at")
	if id, err := strconv.Atoi(identifier); err == nil {
		if id <= 0 {
			return nil, gorm.ErrRecordNotFound
		}
		query = query.Where("id = ?", id)
	} else {
		query = query.Where("username = ?", identifier)
	}
	account := BotAccount{}
	if err := query.Take(&account).Error; err != nil {
		return nil, err
	}
	if account.Id == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return &account, nil
}

// BotUsageTotals is the window-level summary a bot repeats instead of paging
// usage rows: request count, charged quota (internal units) and token totals.
type BotUsageTotals struct {
	Requests         int64 `json:"requests"`
	Quota            int64 `json:"quota"`
	PromptTokens     int64 `json:"prompt_tokens"`
	CompletionTokens int64 `json:"completion_tokens"`
}

// BotUsageModel is one model's share of the window.
type BotUsageModel struct {
	ModelName string `json:"model_name"`
	Requests  int64  `json:"requests"`
	Quota     int64  `json:"quota"`
}

// BotUsageType is how many rows of one log type the window holds.
type BotUsageType struct {
	Type     int   `json:"type"`
	Requests int64 `json:"requests"`
}

// BotUsageSnapshot is everything one "how much did I use" answer needs. Error
// rows stay unclassified here: the caller reduces them to the fixed error-class
// enum, so upstream text never becomes data.
type BotUsageSnapshot struct {
	Totals      BotUsageTotals
	Models      []BotUsageModel
	Types       []BotUsageType
	ErrorSample []*Log
}

// GetBotUsageSnapshot aggregates one account's usage over a bounded window. It
// reads the consume log only through sums and counts; no row content, model
// detail beyond its name, or billing internals are read out.
func GetBotUsageSnapshot(userId int, since, until int64) (*BotUsageSnapshot, error) {
	snapshot := BotUsageSnapshot{
		// An account with no usage answers with empty lists, never null: a bot
		// iterating the field should not have to special-case JSON null.
		Models: []BotUsageModel{},
		Types:  []BotUsageType{},
	}

	consume := func() *gorm.DB {
		return LOG_DB.Model(&Log{}).Where("user_id = ? AND type = ? AND created_at >= ? AND created_at <= ?", userId, LogTypeConsume, since, until)
	}
	var totals struct {
		Requests         int64
		Quota            int64
		PromptTokens     int64
		CompletionTokens int64
	}
	// The projection is a constant aggregate expression, never caller text.
	if err := consume().
		Select("COUNT(*) AS requests, COALESCE(SUM(quota), 0) AS quota, " +
			"COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens, COALESCE(SUM(completion_tokens), 0) AS completion_tokens").
		Scan(&totals).Error; err != nil {
		return nil, err
	}
	snapshot.Totals = BotUsageTotals{
		Requests:         totals.Requests,
		Quota:            totals.Quota,
		PromptTokens:     totals.PromptTokens,
		CompletionTokens: totals.CompletionTokens,
	}

	if err := consume().
		Select("model_name, COUNT(*) AS requests, COALESCE(SUM(quota), 0) AS quota").
		Group("model_name").
		Order("quota desc, model_name asc").
		Limit(botUsageModelLimit).
		Scan(&snapshot.Models).Error; err != nil {
		return nil, err
	}

	types := snapshot.Types
	if err := LOG_DB.Model(&Log{}).
		Where("user_id = ? AND created_at >= ? AND created_at <= ?", userId, since, until).
		Select("type, COUNT(*) AS requests").
		Group("type").
		Order("type asc").
		Scan(&types).Error; err != nil {
		return nil, err
	}
	snapshot.Types = types

	errors := make([]*Log, 0, botUsageErrorSampleLimit)
	if err := LOG_DB.
		Where("user_id = ? AND type = ? AND created_at >= ? AND created_at <= ?", userId, LogTypeError, since, until).
		Order("id desc").
		Limit(botUsageErrorSampleLimit).
		Find(&errors).Error; err != nil {
		return nil, err
	}
	snapshot.ErrorSample = errors
	return &snapshot, nil
}
