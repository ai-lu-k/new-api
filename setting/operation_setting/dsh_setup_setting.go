package operation_setting

import (
	"github.com/QuantumNous/new-api/setting/config"
	"slices"
)

// Public client compatibility describes protocol behavior, not credentials or
// transport configuration. Keep the allowlist shared by validation and export.
var DshClientCompatFields = map[string]string{
	"thinkingFormat": "string", "maxTokensField": "string",
	"supportsStrictMode": "bool", "supportsDeveloperRole": "bool",
	"supportsUsageInStreaming": "bool", "supportsReasoningEffort": "bool",
	"supportsStore": "bool",
}

func ValidDshClientCompat(name string, value any) bool {
	if DshClientCompatFields[name] == "bool" {
		_, ok := value.(bool)
		return ok
	}
	text, ok := value.(string)
	if !ok {
		return false
	}
	switch name {
	case "maxTokensField":
		return text == "max_tokens" || text == "max_completion_tokens"
	case "thinkingFormat":
		return slices.Contains([]string{"openai", "deepseek", "openrouter", "together", "baseten", "zai", "qwen", "chat-template", "qwen-chat-template", "string-thinking", "ant-ling"}, text)
	default:
		return false
	}
}

// DshSetupModel says how one gateway model is presented to the DSH client.
// Anything left at its zero value falls back to DSH's own route defaults.
type DshSetupModel struct {
	Name          string   `json:"name,omitempty"`
	ContextWindow int      `json:"context_window,omitempty"`
	MaxTokens     int      `json:"max_tokens,omitempty"`
	Input         []string `json:"input,omitempty"` // "text", "image"
	Output        []string `json:"output,omitempty"`
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
	ProviderID:  "new-api",
	DisplayName: "New API",
	Models:      map[string]DshSetupModel{},
}

func init() {
	config.GlobalConfig.Register("dsh_setup", &dshSetupSetting)
}

func GetDshSetupSetting() *DshSetupSetting {
	return &dshSetupSetting
}
