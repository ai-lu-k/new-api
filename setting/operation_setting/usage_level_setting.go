package operation_setting

import (
	"fmt"
	"math"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/shopspring/decimal"
)

// Thresholds are the balance-unit thresholds for LV2 through LV6. LV0 means
// no consumption; LV1 starts at the first settled quota unit. Display exchange
// rates do not change the stored thresholds or a user's level.
type UsageLevelSetting struct {
	Thresholds []int64 `json:"thresholds"`
}

var usageLevelSetting = UsageLevelSetting{Thresholds: []int64{10, 50, 200, 1000, 5000}}

func init() {
	config.GlobalConfig.Register("usage_level", &usageLevelSetting)
}

func ParseUsageLevelThresholds(raw string) ([5]int64, error) {
	var amounts []int64
	if err := common.UnmarshalJsonStr(raw, &amounts); err != nil {
		return [5]int64{}, fmt.Errorf("level thresholds must be five increasing positive integers")
	}
	if len(amounts) != 5 {
		return [5]int64{}, fmt.Errorf("exactly five thresholds are required for LV2 through LV6")
	}
	var previous int64
	for _, amount := range amounts {
		if amount <= previous || amount > 1_000_000_000 {
			return [5]int64{}, fmt.Errorf("level thresholds must increase strictly and be between 1 and 1000000000")
		}
		previous = amount
	}
	return [5]int64(amounts), nil
}

// GetUsageLevelThresholds snapshots the published option under its existing
// lock, rather than reading a slice being mutated by the config registry.
func GetUsageLevelThresholds() [7]int {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap["usage_level.thresholds"]
	unit := common.QuotaPerUnit
	common.OptionMapRWMutex.RUnlock()
	amounts := [5]int64{10, 50, 200, 1000, 5000}
	if raw != "" {
		if parsed, err := ParseUsageLevelThresholds(raw); err == nil {
			amounts = parsed
		}
	}
	if math.IsNaN(unit) || math.IsInf(unit, 0) || unit < 1 {
		unit = 500_000
	}
	thresholds := [7]int{0, 1}
	for i, amount := range amounts {
		quota, err := common.WalletQuotaFromDecimalStrict(decimal.NewFromInt(amount).Mul(decimal.NewFromFloat(unit)))
		if err != nil {
			// Invalid quota-unit configurations must not overflow public metadata.
			common.SysError("invalid usage level threshold: " + err.Error())
			return [7]int{0, 1, 5_000_000, 25_000_000, 100_000_000, 500_000_000, 2_500_000_000}
		}
		thresholds[i+2] = quota
	}
	return thresholds
}
