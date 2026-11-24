package model

import (
	"errors"

	"gorm.io/gorm"
)

// Upstream providers whose official cost APIs report what was actually
// billed, day by day. Amounts are always USD; the accounts view never adds
// different currencies together.
const (
	UpstreamProviderOpenAI    = "openai"
	UpstreamProviderAnthropic = "anthropic"
	// UpstreamProviderNewApi reads a new-api gateway through a scoped access
	// token: its own usage data and, when the token allows it, its wallet.
	UpstreamProviderNewApi      = "newapi"
	UpstreamProviderCommandCode = "commandcode"
	// UpstreamProviderWorkBuddy is a prepaid credit pool: accounts are bought
	// for a fixed price and their credits are spent upstream, so its report
	// counts credits, not money.
	UpstreamProviderWorkBuddy = "workbuddy"
	// UpstreamProviderOpenLux reads OpenLux, a new-api gateway
	// whose user APIs also require the account id, so its credential is
	// "<account id>:<access token>".
	UpstreamProviderOpenLux = "openlux"
	// UpstreamProviderCodex789 reads the island AI Coding panel. It has no Admin key: the credential is an account refresh
	// token, and the panel only sells credit through redemption codes, so every
	// spent code is a payment.
	UpstreamProviderCodex789 = "codex789"

	// UpstreamDefaultCurrency is the currency payments are assumed to be in
	// until the operator picks another; the gateway's display type is not
	// trusted for this.
	UpstreamDefaultCurrency = "CNY"

	UpstreamUsageStatusNever = "never"
	UpstreamUsageStatusOK    = "ok"
	UpstreamUsageStatusError = "error"
)

var ErrUpstreamAccountNotFound = errors.New("upstream account not found")

// UpstreamAccount is one independently funded upstream balance. Channels that
// share a funding pool belong to the same account, so the pool is counted
// once. The credential is an Admin key used only to read the provider's cost
// report; it never leaves the server.
type UpstreamAccount struct {
	Id               int      `json:"id"`
	Name             string   `json:"name" gorm:"type:varchar(60);not null"`
	Provider         string   `json:"provider" gorm:"type:varchar(20);not null"`
	BaseUrl          string   `json:"base_url" gorm:"type:varchar(255);not null;default:''"`
	Credential       string   `json:"-" gorm:"type:text;not null"`
	BalanceChannelId int      `json:"balance_channel_id" gorm:"not null;default:0"`
	ManualBalance    *float64 `json:"manual_balance,omitempty" gorm:"column:manual_balance"`
	// Currency is the currency the gateway records payments in. The gateway's
	// own display type is not trusted; ExchangeRate is how many CNY one unit
	// of that currency is worth.
	Currency     string  `json:"currency" gorm:"type:varchar(8);not null;default:'CNY'"`
	ExchangeRate float64 `json:"exchange_rate" gorm:"not null;default:1"`
	// ManualBalanceUpdatedAt records when the operator last entered a balance,
	// so an old number is shown as stale instead of being trusted.
	ManualBalanceUpdatedAt int64 `json:"manual_balance_updated_at" gorm:"bigint;not null;default:0"`

	Usage7d          float64 `json:"usage_7d" gorm:"column:usage_7d;not null;default:0"`
	UsageWindowStart int64   `json:"usage_window_start" gorm:"bigint;not null;default:0"`
	UsageWindowEnd   int64   `json:"usage_window_end" gorm:"bigint;not null;default:0"`
	UsageCheckedAt   int64   `json:"usage_checked_at" gorm:"bigint;not null;default:0"`
	UsageStatus      string  `json:"usage_status" gorm:"type:varchar(16);not null;default:'never'"`
	UsageError       string  `json:"usage_error" gorm:"type:text;not null"`

	// RemoteBalance is the reported wallet, in USD (CommandCode uses credits). A
	// separate timestamp lets an old reading show as stale instead of passing
	// for a fresh one, and BalanceError explains a failed read.
	RemoteBalance   *float64 `json:"remote_balance,omitempty" gorm:"column:remote_balance"`
	RemoteBalanceAt int64    `json:"remote_balance_at" gorm:"bigint;not null;default:0"`
	// Nullable so an existing table can gain the column on SQLite, MySQL and
	// PostgreSQL; an empty value means the last read had no failure.
	BalanceError string `json:"balance_error" gorm:"type:text"`

	CreatedAt int64 `json:"created_at" gorm:"bigint;autoCreateTime"`
	UpdatedAt int64 `json:"updated_at" gorm:"bigint;autoUpdateTime"`
}

func (UpstreamAccount) TableName() string {
	return "upstream_accounts"
}

func ListUpstreamAccounts() ([]UpstreamAccount, error) {
	var accounts []UpstreamAccount
	err := DB.Order("id ASC").Find(&accounts).Error
	return accounts, err
}

func GetUpstreamAccount(id int) (*UpstreamAccount, error) {
	var account UpstreamAccount
	err := DB.First(&account, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrUpstreamAccountNotFound
	}
	if err != nil {
		return nil, err
	}
	return &account, nil
}

func CreateUpstreamAccount(account *UpstreamAccount) error {
	return DB.Create(account).Error
}

// UpdateUpstreamAccount writes the operator-editable fields. Usage results are
// only written by SaveUpstreamUsage so a save can never erase a fresh report.
func UpdateUpstreamAccount(account *UpstreamAccount) error {
	result := DB.Model(&UpstreamAccount{}).Where("id = ?", account.Id).Updates(map[string]any{
		"name":                      account.Name,
		"provider":                  account.Provider,
		"base_url":                  account.BaseUrl,
		"credential":                account.Credential,
		"balance_channel_id":        account.BalanceChannelId,
		"manual_balance":            account.ManualBalance,
		"manual_balance_updated_at": account.ManualBalanceUpdatedAt,
		"currency":                  account.Currency,
		"exchange_rate":             account.ExchangeRate,
	})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		// MySQL reports changed rows, so an unchanged save still matches the
		// record; only a missing record is reported as not found.
		var count int64
		if err := DB.Model(&UpstreamAccount{}).Where("id = ?", account.Id).Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			return ErrUpstreamAccountNotFound
		}
	}
	return nil
}

// UpdateUpstreamCredential stores a credential the provider just rotated. A
// provider that invalidates the old token on every exchange must persist the
// new one immediately, or the account can never be refreshed again.
func UpdateUpstreamCredential(id int, credential string) error {
	result := DB.Model(&UpstreamAccount{}).Where("id = ?", id).Update("credential", credential)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrUpstreamAccountNotFound
	}
	return nil
}

func DeleteUpstreamAccount(id int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("account_id = ?", id).Delete(&UpstreamTopUp{}).Error; err != nil {
			return err
		}
		result := tx.Delete(&UpstreamAccount{}, id)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return ErrUpstreamAccountNotFound
		}
		return nil
	})
}

// SaveUpstreamBalance stores a wallet reading from the upstream itself. A
// failed read keeps the last amount and only records why the read failed, so a
// transient error never looks like a spent wallet.
func SaveUpstreamBalance(id int, balance *float64, checkedAt int64, failure string) error {
	updates := map[string]any{"balance_error": failure}
	if failure == "" && balance != nil {
		updates["remote_balance"] = *balance
		updates["remote_balance_at"] = checkedAt
	}
	return DB.Model(&UpstreamAccount{}).Where("id = ?", id).Updates(updates).Error
}

// SaveUpstreamUsage stores one cost report result for the account.
func SaveUpstreamUsage(id int, usage float64, start, end, checkedAt int64, status string, failure string) error {
	return DB.Model(&UpstreamAccount{}).Where("id = ?", id).Updates(map[string]any{
		"usage_7d":           usage,
		"usage_window_start": start,
		"usage_window_end":   end,
		"usage_checked_at":   checkedAt,
		"usage_status":       status,
		"usage_error":        failure,
	}).Error
}
