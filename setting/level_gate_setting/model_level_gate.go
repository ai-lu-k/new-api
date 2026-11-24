// Package level_gate_setting lets a site sell one model to a subset of users
// without token groups: a model can require a minimum usage level, and the
// level itself is derived from the user's settled, cumulative consumption
// (see model.CalculateUsageLevel).
//
// The point of gating on the derived level rather than on a group is that a
// user unlocks the model by consuming, with nothing for an operator to keep in
// sync by hand. A model with no entry here stays open to everyone.
package level_gate_setting

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/types"
)

// MaxUsageLevel is the highest level model.CalculateUsageLevel can return
// (LV6, the last of the five thresholds).
const MaxUsageLevel = 6

// ModelLevelGateSetting is managed by config.GlobalConfig.Register.
// DB key: model_level_gate.min_levels
type ModelLevelGateSetting struct {
	// MinLevels maps the model name callers send to the minimum usage level
	// required to use it. A missing entry, or a level <= 0, means the model is
	// unrestricted; that is how an entry is disabled without deleting it.
	MinLevels *types.RWMap[string, int] `json:"min_levels"`
}

var modelLevelGateSetting = ModelLevelGateSetting{
	MinLevels: types.NewRWMap[string, int](),
}

func init() {
	config.GlobalConfig.Register("model_level_gate", &modelLevelGateSetting)
}

func GetModelLevelGateSetting() *ModelLevelGateSetting {
	return &modelLevelGateSetting
}

// GetMinLevel returns the minimum usage level required for modelName, or 0
// when the model is unrestricted.
//
// The name is matched exactly, on the name the caller sent: a gated model is
// usually spelled with a price suffix ("gpt-6-astra-x0.001"), and the alias and
// suffix resolution that runs later must not be able to route around the gate
// by rewriting the name into an ungated one.
func GetMinLevel(modelName string) int {
	if modelName == "" || modelLevelGateSetting.MinLevels == nil {
		return 0
	}
	if level, ok := modelLevelGateSetting.MinLevels.Get(modelName); ok && level > 0 {
		return level
	}
	return 0
}

// CheckMinLevels validates the option before it is saved: a JSON object of
// model names to levels in 0..MaxUsageLevel.
func CheckMinLevels(jsonStr string) error {
	levels := map[string]int{}
	if err := common.Unmarshal([]byte(jsonStr), &levels); err != nil {
		return fmt.Errorf("model level gate must be a JSON object of model names to levels: %w", err)
	}
	for name, level := range levels {
		if name == "" {
			return fmt.Errorf("model level gate: model name must not be empty")
		}
		if level < 0 || level > MaxUsageLevel {
			return fmt.Errorf("model level gate: %s must be between 0 and %d, got %d", name, MaxUsageLevel, level)
		}
	}
	return nil
}
