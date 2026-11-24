package model

import (
	"fmt"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/service/dshsetup"
	"github.com/QuantumNous/new-api/setting/naming_setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

func TestModelClientConfigValidation(t *testing.T) {
	for _, profile := range []*ModelClientConfig{
		{ReasoningEfforts: map[string]string{"high": ""}},
		{ReasoningEfforts: map[string]string{"unknown": "high"}},
		{Compat: map[string]any{"api-key": "private"}},
		{Compat: map[string]any{"nested": map[string]any{"secret": "private"}}},
	} {
		assert.Error(t, profile.Validate())
	}
	assert.NoError(t, (&ModelClientConfig{ReasoningEfforts: map[string]string{"off": "", "high": "high"}, Compat: map[string]any{"supportsStrictMode": false}}).Validate())
}

func TestModelClientCatalogRejectsInvalidCapabilities(t *testing.T) {
	for _, invalid := range []Model{
		{MaxOutputTokens: -1}, {MaxOutputTokens: 100_000_001},
		{OutputModalities: "unknown"},
		{ClientConfig: &ModelClientConfig{Compat: map[string]any{"maxTokensField": "private-endpoint"}}},
		{ClientConfig: &ModelClientConfig{Compat: map[string]any{"supportsStrictMode": "false"}}},
	} {
		invalid.InputModalities, invalid.ContextLength = "text", 128000
		invalid.ReleaseDate, invalid.Series = "2026-01", "Example"
		assert.Error(t, invalid.NormalizeCatalog())
	}
	valid := Model{InputModalities: "text,image", ContextLength: 128000, OutputModalities: "text", ReleaseDate: "2026-01", Series: "Example", ClientConfig: &ModelClientConfig{ReasoningEfforts: map[string]string{}}}
	assert.NoError(t, valid.NormalizeCatalog(), "unknown output limit and an explicitly empty reasoning map are allowed")
}

func TestModelClientConfigDatabaseLifecycle(t *testing.T) {
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		for _, upgrade := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/upgrade=%t", engine, upgrade), func(t *testing.T) {
				var driver gorm.Dialector
				switch engine {
				case "sqlite":
					driver = sqlite.Open(":memory:")
				case "mysql":
					if os.Getenv("TEST_MYSQL_DSN") == "" {
						t.Skip("TEST_MYSQL_DSN not configured")
					}
					driver = mysql.Open(os.Getenv("TEST_MYSQL_DSN"))
				case "postgres":
					if os.Getenv("TEST_POSTGRES_DSN") == "" {
						t.Skip("TEST_POSTGRES_DSN not configured")
					}
					driver = postgres.Open(os.Getenv("TEST_POSTGRES_DSN"))
				}
				prefix := fmt.Sprintf("client_%s_%t_", engine, upgrade)
				db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}, Logger: logger.Default.LogMode(logger.Silent)})
				require.NoError(t, err)
				sqlDB, err := db.DB()
				require.NoError(t, err)
				sqlDB.SetMaxOpenConns(1)
				previous := DB
				previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
				dbType := common.DatabaseTypeSQLite
				if engine == "mysql" {
					dbType = common.DatabaseTypeMySQL
				}
				if engine == "postgres" {
					dbType = common.DatabaseTypePostgreSQL
				}
				common.SetDatabaseTypes(dbType, dbType)
				initCol()
				DB = db
				t.Cleanup(func() {
					_ = db.Migrator().DropTable(&Model{}, &Option{}, &Vendor{})
					_ = sqlDB.Close()
					DB = previous
					common.SetDatabaseTypes(previousMain, previousLog)
					initCol()
				})
				require.NoError(t, db.Migrator().DropTable(&Model{}, &Option{}, &Vendor{}))
				query := "SELECT VERSION()"
				if engine == "sqlite" {
					query = "SELECT sqlite_version()"
				}
				var version string
				require.NoError(t, db.Raw(query).Scan(&version).Error)
				t.Logf("%s %s", engine, version)
				require.NoError(t, db.AutoMigrate(&Model{}, &Option{}, &Vendor{}))
				legacy := Model{ModelName: "example-x0.5", Status: 1, ContextLength: 128000, InputModalities: "text,image", Series: "Example", ReleaseDate: "2026-01"}
				require.NoError(t, db.Create(&legacy).Error)
				hidden := Model{ModelName: "private-tool-x0.001", Status: 1}
				require.NoError(t, db.Create(&hidden).Error)
				if upgrade {
					// Remove exactly the new columns: all deployed Model columns,
					// data and indexes remain, representing the pre-feature schema.
					for _, field := range []string{"client_config", "max_output_tokens", "output_modalities"} {
						require.NoError(t, db.Migrator().DropColumn(&Model{}, field))
					}
				}
				setting := operation_setting.DshSetupSetting{Models: map[string]operation_setting.DshSetupModel{
					"example-x0.5": {ContextWindow: 999000, MaxTokens: 8192, Input: []string{"text"}, ReasoningEfforts: map[string]string{"off": "", "high": "high"}, Compat: map[string]any{"supportsStrictMode": false}},
					"private-tool": {Hidden: true, MaxTokens: 4096},
				}}
				encoded, err := common.Marshal(setting.Models)
				require.NoError(t, err)
				require.NoError(t, db.Create(&Option{Key: "dsh_setup.models", Value: string(encoded)}).Error)
				require.NoError(t, db.Create(&Option{Key: "model_naming.price_suffix_enabled", Value: "true"}).Error)
				previousNaming := naming_setting.GetModelNamingSetting().PriceSuffixEnabled
				t.Cleanup(func() { naming_setting.GetModelNamingSetting().PriceSuffixEnabled = previousNaming })
				for range 2 {
					require.NoError(t, db.AutoMigrate(&Model{}, &Option{}, &Vendor{}))
					InitOptionMap()
					require.NoError(t, MigrateModelClientConfigs(db))
				}
				require.NoError(t, db.First(&hidden, hidden.Id).Error)
				require.NotNil(t, hidden.ClientConfig)
				assert.True(t, hidden.ClientConfig.Hidden, "base profile hiding survives a price suffix at startup")
				assert.Equal(t, 4096, hidden.MaxOutputTokens)
				require.NoError(t, db.First(&legacy, legacy.Id).Error)
				assert.Equal(t, 128000, legacy.ContextLength, "catalog context is authoritative")
				assert.Equal(t, "text,image", legacy.InputModalities)
				assert.Equal(t, 8192, legacy.MaxOutputTokens)
				require.NotNil(t, legacy.ClientConfig)
				assert.Equal(t, false, legacy.ClientConfig.Compat["supportsStrictMode"])
				assert.Contains(t, legacy.ClientConfig.ReasoningEfforts, "off", "empty off is preserved")
				assert.True(t, db.Migrator().HasIndex(&Model{}, "uk_model_name_delete_at"))
				var unchanged Option
				require.NoError(t, db.First(&unchanged).Error)
				assert.Equal(t, string(encoded), unchanged.Value)

				// Renaming through the real metadata update moves the capabilities
				// with the row; stale legacy names no longer affect the payload.
				legacy.ModelName = "example-x0.2"
				legacy.MaxOutputTokens = 4096
				legacy.OutputModalities = "text"
				legacy.ClientConfig.ReasoningEfforts = map[string]string{}
				require.NoError(t, legacy.Update())
				require.NoError(t, MigrateModelClientConfigs(db))
				configs, err := GetModelClientConfigs([]string{legacy.ModelName, "example-x0.5"})
				require.NoError(t, err)
				require.Contains(t, configs, legacy.ModelName)
				assert.NotContains(t, configs, "example-x0.5")
				assert.Empty(t, configs[legacy.ModelName].ReasoningEfforts)
				assert.NotNil(t, configs[legacy.ModelName].ReasoningEfforts, "an explicit empty map disables inferred reasoning in clients")
				assert.Equal(t, []string{"text"}, configs[legacy.ModelName].Output)
				payload, err := dshsetup.BuildPayload(operation_setting.DshSetupSetting{ProviderID: "example", Models: setting.Models}, "https://api.example.test", "sk-test", []dshsetup.GatewayModel{{ID: legacy.ModelName, Endpoints: []constant.EndpointType{constant.EndpointTypeOpenAI}, Config: configs[legacy.ModelName]}})
				require.NoError(t, err)
				assert.Contains(t, payload, "maxTokens: 4096")
				assert.NotContains(t, payload, "reasoningEfforts")
				// An older API client omitting the profile cannot clear new fields.
				legacy.ClientConfig = nil
				legacy.MaxOutputTokens = 0
				legacy.OutputModalities = ""
				require.NoError(t, legacy.Update())
				require.NoError(t, db.First(&legacy, legacy.Id).Error)
				assert.Equal(t, 4096, legacy.MaxOutputTokens)
				// Once migrated, an unused legacy option cannot override or break
				// catalog-backed profiles, even if it is no longer valid JSON.
				require.NoError(t, db.Model(&Option{}).Where(map[string]any{"key": "dsh_setup.models"}).Update("value", "invalid legacy data").Error)
				require.NoError(t, MigrateModelClientConfigs(db))
				require.NoError(t, db.Delete(&legacy).Error)
				configs, err = GetModelClientConfigs([]string{legacy.ModelName})
				require.NoError(t, err)
				assert.Empty(t, configs)
			})
		}
	}
}
