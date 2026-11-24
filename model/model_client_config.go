package model

import (
	"errors"
	"maps"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/naming_setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
)

// ModelClientConfig stores client-specific presentation and wire spellings.
// Token limits and modalities live on Model, shared with the catalog.
type ModelClientConfig struct {
	Name             string            `json:"name,omitempty"`
	ReasoningEfforts map[string]string `json:"reasoning_efforts"`
	Compat           map[string]any    `json:"compat,omitempty"`
	Hidden           bool              `json:"hidden,omitempty"`
}

func (config *ModelClientConfig) Validate() error {
	if config == nil {
		return nil
	}
	config.Name = strings.TrimSpace(config.Name)
	if len(config.Name) > 256 || len(config.Compat) > 32 {
		return &CatalogError{Field: "client_config"}
	}
	for level, spelling := range config.ReasoningEfforts {
		if !slices.Contains([]string{"off", "minimal", "low", "medium", "high", "xhigh", "max"}, level) || (level != "off" && strings.TrimSpace(spelling) == "") || len(spelling) > 128 {
			return &CatalogError{Field: "reasoning_efforts"}
		}
	}
	for name, value := range config.Compat {
		if !operation_setting.ValidDshClientCompat(name, value) {
			return &CatalogError{Field: "client_compat"}
		}
	}
	return nil
}

// GetModelClientConfigs resolves catalog rules in one query. It deliberately
// selects only public capabilities, never channel names, addresses or keys.
func GetModelClientConfigs(names []string) (map[string]*operation_setting.DshSetupModel, error) {
	result := make(map[string]*operation_setting.DshSetupModel)
	if len(names) == 0 {
		return result, nil
	}
	var records []Model
	if err := DB.Select("id", "model_name", "name_rule", "context_length", "max_output_tokens", "input_modalities", "output_modalities", "client_config").Order("id").Find(&records).Error; err != nil {
		return nil, err
	}
	resolved := resolveModelMetadata(records, names)
	for _, name := range names {
		record := resolved[name]
		if record == nil {
			continue
		}
		entry := &operation_setting.DshSetupModel{ContextWindow: record.ContextLength, MaxTokens: record.MaxOutputTokens, Input: SplitCatalogList(record.InputModalities), Output: SplitCatalogList(record.OutputModalities)}
		if profile := record.ClientConfig; profile != nil {
			entry.Name, entry.ReasoningEfforts, entry.Compat, entry.Hidden = profile.Name, profile.ReasoningEfforts, profile.Compat, profile.Hidden
		}
		result[name] = entry
	}
	return result, nil
}

// MigrateModelClientConfigs imports the old settings once, after InitOptionMap.
// Alias and tier resolution must use the site's loaded naming/pricing settings.
func MigrateModelClientConfigs(db *gorm.DB) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var records []Model
		if err := tx.Where("client_config IS NULL").Find(&records).Error; err != nil {
			return err
		}
		if len(records) == 0 {
			return nil
		}
		var option Option
		err := tx.Where(map[string]any{"key": "dsh_setup.models"}).First(&option).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		legacy := operation_setting.DshSetupSetting{Models: map[string]operation_setting.DshSetupModel{}}
		if err == nil && option.Value != "" {
			if err := common.UnmarshalJsonStr(option.Value, &legacy.Models); err != nil {
				return errors.New("invalid legacy quick-import model settings")
			}
		}
		for _, record := range records {
			entry, found := legacy.Models[record.ModelName]
			if !found {
				base := naming_setting.BillingName(record.ModelName)
				entry, found = legacy.Models[base]
				if !found {
					for _, name := range slices.Sorted(maps.Keys(legacy.Models)) {
						if naming_setting.BillingName(naming_setting.ResolveAlias(name)) == base {
							entry = legacy.Models[name]
							break
						}
					}
				}
			}
			record.ClientConfig = &ModelClientConfig{Name: entry.Name, ReasoningEfforts: entry.ReasoningEfforts, Compat: entry.Compat, Hidden: entry.Hidden}
			record.MaxOutputTokens = entry.MaxTokens
			if record.ContextLength == 0 {
				record.ContextLength = entry.ContextWindow
			}
			if record.InputModalities == "" {
				record.InputModalities = strings.Join(entry.Input, ",")
			}
			if err := tx.Model(&Model{}).Where("id = ? AND client_config IS NULL", record.Id).Select("client_config", "max_output_tokens", "context_length", "input_modalities").Updates(&record).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
