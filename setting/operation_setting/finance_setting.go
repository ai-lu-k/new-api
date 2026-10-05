package operation_setting

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

const financeMaxExcludedUsers = 200

// FinanceSetting configures the income summary of the root user.
// DB key: finance.excluded_user_ids
type FinanceSetting struct {
	// ExcludedUserIds lists accounts whose top-ups and gifts are left out of
	// the summary, such as the operator's own test accounts.
	ExcludedUserIds []int `json:"excluded_user_ids"`
}

var financeSetting = FinanceSetting{ExcludedUserIds: []int{}}

func init() {
	config.GlobalConfig.Register("finance", &financeSetting)
}

// GetFinanceExcludedUserIds returns a copy of the accounts left out of the
// income summary.
func GetFinanceExcludedUserIds() []int {
	stored := financeSetting.ExcludedUserIds
	ids := make([]int, len(stored))
	copy(ids, stored)
	return ids
}

// CheckFinanceExcludedUserIds validates the value saved as
// finance.excluded_user_ids.
func CheckFinanceExcludedUserIds(jsonStr string) error {
	var ids []int
	if err := common.Unmarshal([]byte(jsonStr), &ids); err != nil {
		return fmt.Errorf("excluded accounts must be a JSON list of user ids: %w", err)
	}
	if len(ids) > financeMaxExcludedUsers {
		return fmt.Errorf("at most %d accounts can be excluded", financeMaxExcludedUsers)
	}
	for _, id := range ids {
		if id <= 0 {
			return fmt.Errorf("excluded account %d is not a user id", id)
		}
	}
	return nil
}
