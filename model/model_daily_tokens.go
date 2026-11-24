package model

import (
	"context"
	"crypto/sha256"
	"database/sql/driver"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/naming_setting"
	"github.com/QuantumNous/new-api/setting/reasoning"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const ModelDailyTokenLimitsOption = "ModelDailyTokenLimits"
const DefaultModelDailyTokenLimits = `{"deepseek-v4.1-flash-x0.1":200000000}`
const MaxModelDailyTokens int64 = 9007199254740991

// ModelTokenLimits is persisted as TEXT on every supported primary database.
// Missing entries inherit; -1 exempts an account; zero blocks new requests.
type ModelTokenLimits map[string]int64

func (limits ModelTokenLimits) Value() (driver.Value, error) {
	b, err := common.Marshal(limits)
	return string(b), err
}

func (limits *ModelTokenLimits) Scan(value any) error {
	if value == nil {
		*limits = nil
		return nil
	}
	switch data := value.(type) {
	case []byte:
		return common.Unmarshal(data, limits)
	case string:
		return common.UnmarshalJsonStr(data, limits)
	default:
		return fmt.Errorf("invalid model daily token limit storage: %T", value)
	}
}

func ValidateModelTokenLimits(limits ModelTokenLimits, overrides bool) error {
	if limits == nil || len(limits) > 100 {
		return errors.New("model daily token limits must be an object with at most 100 models")
	}
	minimum := int64(1)
	if overrides {
		minimum = -1
	}
	for name, limit := range limits {
		if name == "" || strings.TrimSpace(name) != name || len(name) > 255 || limit < minimum || limit > MaxModelDailyTokens {
			return errors.New("invalid model name or daily token limit")
		}
	}
	return nil
}

// Usage is independent of consumption-log retention, Redis and price multipliers.
// Short model hashes keep composite keys compatible with MySQL's index limits.
type ModelDailyTokenUsage struct {
	UserID     int    `gorm:"primaryKey;autoIncrement:false"`
	ModelKey   string `gorm:"type:varchar(64);primaryKey"`
	DayStart   int64  `gorm:"primaryKey;autoIncrement:false;index"`
	UsedTokens int64
}

type ModelDailyTokenReceipt struct {
	Key      string `gorm:"type:varchar(64);primaryKey"`
	Tokens   int64
	DayStart int64 `gorm:"index"`
}

type ModelDailyTokenBudget struct {
	Model     string `json:"model"`
	Limit     int64  `json:"limit"`
	Used      int64  `json:"used"`
	Remaining int64  `json:"remaining"`
	Unlimited bool   `json:"unlimited"`
	ResetsAt  int64  `json:"resets_at"`
}

type ModelDailyTokenSnapshot struct {
	Models    []ModelDailyTokenBudget `json:"models"`
	UpdatedAt int64                   `json:"updated_at"`
	ResetsAt  int64                   `json:"resets_at"`
	Timezone  string                  `json:"timezone"`
}

func GetModelDailyTokenSnapshot(ctx context.Context, userID int) (*ModelDailyTokenSnapshot, error) {
	read, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	now, err := databaseClockMilliseconds(DB.WithContext(read))
	if err != nil {
		return nil, err
	}
	at := time.UnixMilli(now)
	budgets, err := ModelDailyTokenBudgets(read, userID, at)
	if err != nil {
		return nil, err
	}
	return &ModelDailyTokenSnapshot{Models: budgets, UpdatedAt: at.Unix(), ResetsAt: ModelDailyTokenDay(at) + 86400, Timezone: "Asia/Shanghai"}, nil
}

type ModelDailyTokenLimitError struct{ ModelDailyTokenBudget }

func (err *ModelDailyTokenLimitError) Error() string {
	return fmt.Sprintf("Model %s daily token limit reached (used: %d, limit: %d). Please use another model or retry after %s (Asia/Shanghai); contact an administrator to adjust your limit.", err.Model, err.Used, err.Limit, time.Unix(err.ResetsAt, 0).In(time.FixedZone("Asia/Shanghai", 8*3600)).Format("2006-01-02 15:04"))
}

type modelDailyAdmissionKey struct{}

type ModelDailyTokenAdmission struct {
	Key      string
	UserID   int
	DayStart int64
	Models   []string
}

func ModelDailyTokenAdmissionFromContext(ctx context.Context) *ModelDailyTokenAdmission {
	admission, _ := ctx.Value(modelDailyAdmissionKey{}).(*ModelDailyTokenAdmission)
	return admission
}

func modelDailyTokenKey(name string) string { return fmt.Sprintf("%x", sha256.Sum256([]byte(name))) }

func AddModelDailyTokens(counts ...int64) int64 {
	var total int64
	for _, count := range counts {
		total += min(max(count, 0), MaxModelDailyTokens-total)
	}
	return total
}

func ModelDailyTokenDay(now time.Time) int64 { return (now.Unix()+8*3600)/86400*86400 - 8*3600 }

func modelDailyTokenIdentity(name string) string {
	return reasoning.BaseModelName(naming_setting.ResolveAlias(name))
}

func ReadModelDailyTokenLimits(ctx context.Context) (ModelTokenLimits, error) {
	if DB == nil {
		return nil, errors.New("primary database unavailable")
	}
	var options []Option
	if err := DB.WithContext(ctx).Where(map[string]any{"key": ModelDailyTokenLimitsOption}).Find(&options).Error; err != nil {
		return nil, err
	}
	raw := DefaultModelDailyTokenLimits
	if len(options) > 0 {
		raw = options[0].Value
	}
	var limits ModelTokenLimits
	if err := common.UnmarshalJsonStr(raw, &limits); err != nil {
		return nil, err
	}
	return limits, ValidateModelTokenLimits(limits, false)
}

func modelDailyLimitsForUser(ctx context.Context, userID int, limits ModelTokenLimits) (ModelTokenLimits, error) {
	var err error
	var user User
	if err = DB.WithContext(ctx).Select("id", "model_daily_token_limits").First(&user, userID).Error; err != nil {
		return nil, err
	}
	if user.ModelDailyTokenLimits != nil {
		if err = ValidateModelTokenLimits(*user.ModelDailyTokenLimits, true); err != nil {
			return nil, err
		}
		for name, limit := range *user.ModelDailyTokenLimits {
			if _, configured := limits[name]; configured {
				limits[name] = limit
			}
		}
	}
	return limits, nil
}

func ModelDailyTokenBudgets(ctx context.Context, userID int, now time.Time) ([]ModelDailyTokenBudget, error) {
	limits, err := ReadModelDailyTokenLimits(ctx)
	if err != nil {
		return nil, err
	}
	limits, err = modelDailyLimitsForUser(ctx, userID, limits)
	if err != nil {
		return nil, err
	}
	return modelDailyTokenBudgets(ctx, userID, now, limits)
}

func modelDailyTokenBudgets(ctx context.Context, userID int, now time.Time, limits ModelTokenLimits) ([]ModelDailyTokenBudget, error) {
	names := make([]string, 0, len(limits))
	keys := make([]string, 0, len(limits))
	for name := range limits {
		names = append(names, name)
		keys = append(keys, modelDailyTokenKey(name))
	}
	slices.Sort(names)
	day := ModelDailyTokenDay(now)
	var usages []ModelDailyTokenUsage
	if len(keys) > 0 {
		if err := DB.WithContext(ctx).Where("user_id = ? AND day_start = ? AND model_key IN ?", userID, day, keys).Find(&usages).Error; err != nil {
			return nil, err
		}
	}
	used := make(map[string]int64, len(usages))
	for _, usage := range usages {
		used[usage.ModelKey] = usage.UsedTokens
	}
	budgets := make([]ModelDailyTokenBudget, 0, len(names))
	for _, name := range names {
		limit := limits[name]
		quantity := used[modelDailyTokenKey(name)]
		budgets = append(budgets, ModelDailyTokenBudget{Model: name, Limit: limit, Used: quantity, Remaining: max(0, limit-quantity), Unlimited: limit == -1, ResetsAt: day + 86400})
	}
	return budgets, nil
}

// AdmitModelDailyTokens implements a settled-usage threshold, not a reservation.
// Requests already admitted may finish past the cap. Their usage stays in the
// admission day's ledger even when a stream finishes after Shanghai midnight.
func AdmitModelDailyTokens(ctx context.Context, userID int, requestedModel string) (context.Context, error) {
	check, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	limits, err := ReadModelDailyTokenLimits(check)
	if err != nil {
		return ctx, err
	}
	for name := range limits {
		if modelDailyTokenIdentity(name) != modelDailyTokenIdentity(requestedModel) {
			delete(limits, name)
		}
	}
	if len(limits) == 0 {
		return context.WithValue(ctx, modelDailyAdmissionKey{}, &ModelDailyTokenAdmission{UserID: userID}), nil
	}
	limits, err = modelDailyLimitsForUser(check, userID, limits)
	if err != nil {
		return ctx, err
	}
	now, err := databaseClockMilliseconds(DB.WithContext(check))
	if err != nil {
		return ctx, err
	}
	budgets, err := modelDailyTokenBudgets(check, userID, time.UnixMilli(now), limits)
	if err != nil {
		return ctx, err
	}
	admission := &ModelDailyTokenAdmission{Key: common.GetRandomString(32), UserID: userID, DayStart: ModelDailyTokenDay(time.UnixMilli(now))}
	for _, budget := range budgets {
		if modelDailyTokenIdentity(budget.Model) != modelDailyTokenIdentity(requestedModel) {
			continue
		}
		if !budget.Unlimited && budget.Used >= budget.Limit {
			return ctx, &ModelDailyTokenLimitError{budget}
		}
		admission.Models = append(admission.Models, budget.Model)
	}
	return context.WithValue(ctx, modelDailyAdmissionKey{}, admission), nil
}

// RecordModelDailyTokens accepts cumulative usage for one admitted generation.
// A receipt makes repeated settlement idempotent; user locking serializes all
// model counters for this account, including independent gateway instances.
func RecordModelDailyTokens(ctx context.Context, tokens int64) error {
	admission := ModelDailyTokenAdmissionFromContext(ctx)
	if admission == nil || len(admission.Models) == 0 || tokens <= 0 {
		return nil
	}
	tokens = min(tokens, MaxModelDailyTokens)
	write, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	return DB.WithContext(write).Transaction(func(tx *gorm.DB) error {
		if err := lockUserRow(tx, admission.UserID); err != nil {
			return err
		}
		for _, name := range admission.Models {
			key := modelDailyTokenKey(admission.Key + ":" + name)
			receipt := ModelDailyTokenReceipt{Key: key, DayStart: admission.DayStart}
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&receipt).Error; err != nil {
				return err
			}
			if err := tx.Where(map[string]any{"key": key}).First(&receipt).Error; err != nil {
				return err
			}
			delta := tokens - receipt.Tokens
			if delta <= 0 {
				continue
			}
			usage := ModelDailyTokenUsage{UserID: admission.UserID, ModelKey: modelDailyTokenKey(name), DayStart: admission.DayStart}
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&usage).Error; err != nil {
				return err
			}
			if err := tx.Where("user_id = ? AND model_key = ? AND day_start = ?", usage.UserID, usage.ModelKey, usage.DayStart).First(&usage).Error; err != nil {
				return err
			}
			if err := tx.Model(&usage).Update("used_tokens", usage.UsedTokens+min(delta, MaxModelDailyTokens-usage.UsedTokens)).Error; err != nil {
				return err
			}
			if err := tx.Model(&receipt).Update("tokens", tokens).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// PruneModelDailyTokenRecords keeps seven days of receipts and counters. Current
// ledgers are never cleared by a reset; a new day uses a different primary key.
func PruneModelDailyTokenRecords(now time.Time) error {
	cutoff := ModelDailyTokenDay(now) - 7*86400
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	return DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("day_start < ?", cutoff).Delete(&ModelDailyTokenReceipt{}).Error; err != nil {
			return err
		}
		return tx.Where("day_start < ?", cutoff).Delete(&ModelDailyTokenUsage{}).Error
	})
}

func RunModelDailyTokenCleanup(ctx context.Context) {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	for {
		if err := PruneModelDailyTokenRecords(time.Now()); err != nil {
			common.SysError("failed to prune daily model token records: " + err.Error())
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
