package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A setup code may name a key to hand out. Only an enabled key of the same
// user qualifies, when the code is issued and again when it is redeemed.
func TestDshSetupUsesOnlyTheUsersOwnEnabledKey(t *testing.T) {
	database := modelManagementDB(t, "sqlite", "")
	require.NoError(t, database.AutoMigrate(&model.Token{}))

	own := model.Token{UserId: 7, Name: "mine", Key: "own-key", Status: common.TokenStatusEnabled}
	disabled := model.Token{UserId: 7, Name: "off", Key: "disabled-key", Status: common.TokenStatusDisabled}
	foreign := model.Token{UserId: 8, Name: "theirs", Key: "foreign-key", Status: common.TokenStatusEnabled}
	for _, token := range []*model.Token{&own, &disabled, &foreign} {
		require.NoError(t, database.Create(token).Error)
	}

	found := dshSetupOwnToken(7, own.Id)
	require.NotNil(t, found)
	assert.Equal(t, "own-key", found.Key)

	assert.Nil(t, dshSetupOwnToken(7, disabled.Id), "a disabled key")
	assert.Nil(t, dshSetupOwnToken(7, foreign.Id), "another user's key")
	assert.Nil(t, dshSetupOwnToken(7, 999999), "a key that does not exist")
	assert.Nil(t, dshSetupOwnToken(7, 0), "no key named")
	assert.Nil(t, dshSetupOwnToken(7, -1))
	own.TokenPlan = true
	require.NoError(t, database.Model(&own).Update("token_plan", true).Error)
	assert.Nil(t, dshSetupOwnToken(7, own.Id), "managed Token Plan keys cannot be handed out by setup codes")

	// Deleted after the code was issued: gone by the time it is redeemed.
	require.NoError(t, database.Delete(&own).Error)
	assert.Nil(t, dshSetupOwnToken(7, own.Id), "a key deleted in the meantime")
}

// requestSetupScript answers one setup-script request the way the router would,
// with the feature switched on or off for the duration of the test.
func requestSetupScript(t *testing.T, enabled bool, script string, query string) (int, string) {
	t.Helper()
	previousAddress := system_setting.ServerAddress
	system_setting.ServerAddress = "https://ai.example.test"
	setting := operation_setting.GetDshSetupSetting()
	previousEnabled := setting.Enabled
	setting.Enabled = enabled
	t.Cleanup(func() {
		system_setting.ServerAddress = previousAddress
		setting.Enabled = previousEnabled
	})

	target := "/api/dsh_setup/" + script
	if query != "" {
		target += "?" + query
	}
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.GET("/api/dsh_setup/:script", GetDshSetupScript)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, target, nil))
	return recorder.Code, recorder.Body.String()
}

// The script endpoint serves the DSH script unless a client is named, so every
// address that worked before keeps working.
func TestDshSetupScriptDefaultsToDsh(t *testing.T) {
	for _, query := range []string{"", "client=dsh"} {
		status, body := requestSetupScript(t, true, "setup.sh", query)
		require.Equal(t, http.StatusOK, status, query)
		assert.Contains(t, body, "Points the DSH client at this gateway", query)
		// Pointed at this gateway, and carrying nothing but the code.
		assert.Contains(t, body, "BASE_URL='https://ai.example.test'", query)
		assert.Contains(t, body, "/api/dsh_setup/redeem", query)
		assert.NotContains(t, body, "ANTHROPIC_AUTH_TOKEN", query)
	}

	status, body := requestSetupScript(t, true, "setup.ps1", "")
	require.Equal(t, http.StatusOK, status)
	assert.Contains(t, body, "dsh_setup/redeem")
	assert.NotContains(t, body, "ANTHROPIC_AUTH_TOKEN")
}

// Claude Code has a script of its own, and it writes the three env keys its
// hand-written configuration uses.
func TestDshSetupScriptServesTheClaudeCodeSetup(t *testing.T) {
	status, body := requestSetupScript(t, true, "setup.sh", "client=claude")
	require.Equal(t, http.StatusOK, status)

	assert.Contains(t, body, "Claude Code")
	assert.Contains(t, body, "BASE_URL='https://ai.example.test'")
	assert.Contains(t, body, "/api/dsh_setup/redeem")
	for _, key := range []string{"ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_MODEL"} {
		assert.Contains(t, body, key)
	}
	// It writes Claude Code's own settings file and leaves DSH's files alone.
	assert.Contains(t, body, ".claude/settings.json")
	assert.NotContains(t, body, ".dsh")
	// The key it redeemed is only printed on request, never by default.
	assert.Contains(t, body, "--show-key")
	assert.Contains(t, body, "NEW_API_SETUP_SHOW_KEY")
	// The gateway address is filled in, not left as a placeholder.
	assert.NotContains(t, body, "__BASE_URL__")
	assert.NotContains(t, body, "__SITE_NAME__")
}

// Windows is set up by a PowerShell script of its own for Claude Code: it
// writes the same three env keys into Claude Code's settings and knows nothing
// of DSH's files.
func TestDshSetupScriptServesTheClaudeCodePowerShellScript(t *testing.T) {
	status, body := requestSetupScript(t, true, "setup.ps1", "client=claude")
	require.Equal(t, http.StatusOK, status)

	assert.Contains(t, body, "Claude Code")
	assert.Contains(t, body, "/api/dsh_setup/redeem")
	for _, key := range []string{"ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_MODEL"} {
		assert.Contains(t, body, key)
	}
	// It reads the code from the environment, as the command that runs it
	// sets it, and writes Claude Code's own settings file.
	assert.Contains(t, body, "NEW_API_SETUP_CODE")
	assert.Contains(t, body, ".claude")
	assert.Contains(t, body, "settings.json")
	// The key it redeemed is only printed on request.
	assert.Contains(t, body, "-DryRun")
	assert.Contains(t, body, "-ShowKey")
	// The gateway address is filled in, not left as a placeholder.
	assert.NotContains(t, body, "__")
	assert.Contains(t, body, "https://ai.example.test")

	// It is not the DSH script, and carries nothing DSH alone needs.
	dshStatus, dshBody := requestSetupScript(t, true, "setup.ps1", "")
	require.Equal(t, http.StatusOK, dshStatus)
	assert.NotEqual(t, dshBody, body)
	for _, fragment := range []string{"llm-pi-ai", ".dsh", "settings.yaml", ".credentials.yaml", "apiKeyEnv"} {
		assert.NotContains(t, body, fragment)
	}
}

// With the feature off, and for a client nobody serves, the address does not
// exist.
func TestDshSetupScriptIsNotFoundWithoutAScript(t *testing.T) {
	for _, request := range []struct {
		script string
		query  string
	}{
		{"setup.sh", ""},
		{"setup.sh", "client=claude"},
		{"setup.ps1", ""},
		{"setup.ps1", "client=claude"},
	} {
		status, body := requestSetupScript(t, false, request.script, request.query)
		assert.Equal(t, http.StatusNotFound, status, request.script+"?"+request.query)
		assert.Empty(t, body, request.script+"?"+request.query)
	}

	status, body := requestSetupScript(t, true, "setup.sh", "client=codex")
	assert.Equal(t, http.StatusNotFound, status, "an unknown client")
	assert.Empty(t, body)
}
