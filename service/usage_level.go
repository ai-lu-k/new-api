package service

import (
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// The dashboard and Token Plan share the same level calculation.
type UsageLevel = model.UsageLevel

// RecordUserConsumption counts a request and its level-eligible consumption.
// Token Plan wallet spending is accounted atomically by its settlement ledger;
// its free allowance must never contribute to users.used_quota. The level
// ledger inside that call spends gifted balance first, so only real money
// reaches users.level_quota.
func RecordUserConsumption(info *relaycommon.RelayInfo, quota int) {
	if info.TokenPlan || info.BillingSource == BillingSourceTokenPlan {
		quota = 0
	}
	model.UpdateUserUsedQuotaAndRequestCount(info.UserId, quota)
}

func CalculateUsageLevel(levelQuota int, thresholds [7]int) UsageLevel {
	return model.CalculateUsageLevel(levelQuota, thresholds)
}

// GetUserUsageLevel returns the usage level of one user, or 0 when the user
// cannot be loaded.
func GetUserUsageLevel(userId int) int {
	if userId <= 0 {
		return 0
	}
	user, err := model.GetUserById(userId, false)
	if err != nil || user == nil {
		return 0
	}
	return CalculateUsageLevel(user.LevelQuota, operation_setting.GetUsageLevelThresholds()).Level
}

// UserMeetsMinLevel reports whether a user's cumulative consumption has
// reached minLevel. A minLevel <= 0 means unrestricted, so an ungated model
// never pays for a user lookup.
//
// Fails closed on an unknown user: a request whose owner cannot be resolved
// must not slip past a gate.
func UserMeetsMinLevel(userId int, minLevel int) bool {
	if minLevel <= 0 {
		return true
	}
	if userId <= 0 {
		return false
	}
	user, err := model.GetUserById(userId, false)
	if err != nil || user == nil {
		return false
	}
	level := CalculateUsageLevel(user.LevelQuota, operation_setting.GetUsageLevelThresholds()).Level
	return level >= minLevel
}
