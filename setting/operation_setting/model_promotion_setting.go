package operation_setting

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

// ModelPromotionSetting marks models that are sold for a limited time.
// DB key: model_promotion.deadlines
type ModelPromotionSetting struct {
	// Deadlines maps a model name to the Unix time its offer ends. It only
	// drives the countdown shown in the model catalog; taking the model off
	// sale is done on the channel.
	Deadlines map[string]int64 `json:"deadlines"`
}

var modelPromotionSetting = ModelPromotionSetting{Deadlines: map[string]int64{}}

func init() {
	config.GlobalConfig.Register("model_promotion", &modelPromotionSetting)
}

// GetModelPromotionDeadline returns when the limited-time offer of a model
// ends, as Unix seconds, or 0 when the model has none.
func GetModelPromotionDeadline(model string) int64 {
	return modelPromotionSetting.Deadlines[model]
}

// CheckModelPromotionDeadlines validates the value saved as
// model_promotion.deadlines.
func CheckModelPromotionDeadlines(jsonStr string) error {
	deadlines := map[string]int64{}
	if err := common.Unmarshal([]byte(jsonStr), &deadlines); err != nil {
		return fmt.Errorf("promotion deadlines must be a JSON object of model name to Unix time: %w", err)
	}
	for model, deadline := range deadlines {
		if model == "" || strings.TrimSpace(model) != model {
			return fmt.Errorf("promotion deadline: model name %q must not be empty or padded", model)
		}
		if deadline <= 0 {
			return fmt.Errorf("promotion deadline of %q must be a Unix time", model)
		}
	}
	return nil
}
