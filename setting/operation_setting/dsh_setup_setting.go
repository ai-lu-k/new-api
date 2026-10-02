package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// DshSetupModel says how one gateway model is presented to the DSH client.
// Anything left at its zero value falls back to DSH's own route defaults.
type DshSetupModel struct {
	Name          string   `json:"name,omitempty"`
	ContextWindow int      `json:"context_window,omitempty"`
	MaxTokens     int      `json:"max_tokens,omitempty"`
	Input         []string `json:"input,omitempty"` // "text", "image"
	// ReasoningEfforts maps a level DSH offers to the spelling sent upstream;
	// only "off" may be left empty.
	ReasoningEfforts map[string]string `json:"reasoning_efforts,omitempty"`
	// Compat carries DSH request-compatibility switches for this model.
	Compat map[string]any `json:"compat,omitempty"`
	// Hidden keeps a model that is not a chat model (a task endpoint, say) out
	// of the client even though a key can call it.
	Hidden bool `json:"hidden,omitempty"`
}

// DshSetupSetting configures the one-command setup of the DSH client.
type DshSetupSetting struct {
	Enabled      bool                     `json:"enabled"`
	ProviderID   string                   `json:"provider_id"`
	DisplayName  string                   `json:"display_name"`
	DefaultModel string                   `json:"default_model"`
	Models       map[string]DshSetupModel `json:"models"`
}

var dshSetupSetting = DshSetupSetting{
	Enabled:     false,
	ProviderID:  "lu-k",
	DisplayName: "LUK",
	Models:      map[string]DshSetupModel{},
}

func init() {
	config.GlobalConfig.Register("dsh_setup", &dshSetupSetting)
}

func GetDshSetupSetting() *DshSetupSetting {
	return &dshSetupSetting
}
