package dshsetup

import (
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSetupCodeWorksOnceWithinItsLifetime(t *testing.T) {
	now := time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)
	store := NewCodeStore()
	store.now = func() time.Time { return now }

	code, expires, err := store.Issue(7)
	require.NoError(t, err)
	assert.Equal(t, now.Add(10*time.Minute), expires)
	assert.Len(t, code, 32, "192 random bits, base64url")

	_, ok := store.Redeem("not-" + code)
	assert.False(t, ok, "a code that was never issued")

	userID, ok := store.Redeem(code)
	require.True(t, ok)
	assert.Equal(t, 7, userID)

	_, ok = store.Redeem(code)
	assert.False(t, ok, "a code that has been used")

	stale, _, err := store.Issue(7)
	require.NoError(t, err)
	now = now.Add(10 * time.Minute)
	_, ok = store.Redeem(stale)
	assert.False(t, ok, "a code at the end of its lifetime")
}

// A code issued for one of the user's keys says so when redeemed, and never
// holds the key itself.
func TestSetupCodeRemembersTheKeyItWasIssuedFor(t *testing.T) {
	store := NewCodeStore()

	chosen, _, err := store.IssueFor(7, 42)
	require.NoError(t, err)
	plain, _, err := store.Issue(7)
	require.NoError(t, err)

	grant, ok := store.RedeemGrant(chosen)
	require.True(t, ok)
	assert.Equal(t, Grant{UserID: 7, TokenID: 42}, grant)
	_, ok = store.RedeemGrant(chosen)
	assert.False(t, ok, "used up like any other code")

	grant, ok = store.RedeemGrant(plain)
	require.True(t, ok)
	assert.Equal(t, Grant{UserID: 7}, grant, "no key chosen: the account's DSH key")
}

// The page asks for a code each time it is opened, so a newer code must not
// void the one the user has already copied.
func TestSetupCodesOfOneUserCoexistUpToALimit(t *testing.T) {
	now := time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)
	store := NewCodeStore()
	store.now = func() time.Time { return now }

	issue := func(userID int) string {
		code, _, err := store.Issue(userID)
		require.NoError(t, err)
		return code
	}

	first := issue(7)
	second := issue(7)
	other := issue(8)
	userID, ok := store.Redeem(first)
	require.True(t, ok, "an earlier code survives a newer one")
	assert.Equal(t, 7, userID)
	userID, ok = store.Redeem(second)
	require.True(t, ok)
	assert.Equal(t, 7, userID)
	userID, ok = store.Redeem(other)
	require.True(t, ok)
	assert.Equal(t, 8, userID)

	oldest := issue(7)
	kept := make([]string, 0, MaxPendingPerUser)
	for range MaxPendingPerUser {
		kept = append(kept, issue(7))
	}
	bystander := issue(8)
	_, ok = store.Redeem(oldest)
	assert.False(t, ok, "the oldest code gives way once the user holds too many")
	for _, code := range kept {
		_, ok = store.Redeem(code)
		assert.True(t, ok)
	}
	_, ok = store.Redeem(bystander)
	assert.True(t, ok, "another user's code is not affected")

	// Expired codes do not count against the limit and leave nothing behind.
	for range MaxPendingPerUser {
		issue(7)
	}
	now = now.Add(CodeLifetime)
	fresh := issue(7)
	assert.Len(t, store.pending, 1)
	assert.Len(t, store.byUser[7], 1)
	_, ok = store.Redeem(fresh)
	assert.True(t, ok)
	assert.Empty(t, store.pending)
	assert.Empty(t, store.byUser)
}

var testSetting = operation_setting.DshSetupSetting{
	Enabled:      true,
	ProviderID:   "lu-k",
	DisplayName:  "LUK",
	DefaultModel: "deepseek/deepseek-v4.1-flash",
	Models: map[string]operation_setting.DshSetupModel{
		"deepseek/deepseek-v4.1-flash": {
			Name:             "DeepSeek V4.1 Flash",
			ContextWindow:    1000000,
			MaxTokens:        32768,
			Input:            []string{"image", "text", "audio"},
			ReasoningEfforts: map[string]string{"off": "", "high": "high", "max": "max", "low": ""},
			Compat:           map[string]any{"thinkingFormat": "deepseek", "supportsDeveloperRole": false, "bad key": true},
		},
		"glm-5.3": {Name: "GLM 5.3（特惠）", ReasoningEfforts: map[string]string{"off": ""}},
		"jev":     {Hidden: true},
	},
}

var testModels = []GatewayModel{
	{ID: "jev", Endpoints: []constant.EndpointType{constant.EndpointTypeOpenAI}},
	{ID: "glm-5.3", Endpoints: []constant.EndpointType{constant.EndpointTypeOpenAI}},
	{ID: "gpt-image-2.5-flare", Endpoints: []constant.EndpointType{constant.EndpointTypeImageGeneration}},
	{ID: "claude-sonnet-5-5", Endpoints: []constant.EndpointType{constant.EndpointTypeAnthropic}},
	{ID: "bad id'; rm -rf ~", Endpoints: []constant.EndpointType{constant.EndpointTypeOpenAI}},
	{ID: "deepseek/deepseek-v4.1-flash", Endpoints: []constant.EndpointType{constant.EndpointTypeOpenAIResponse, constant.EndpointTypeOpenAI, constant.EndpointTypeAnthropic}},
}

const testPayload = `luk-dsh-setup 1
ref LU_K_API_KEY
key sk-test0123456789
ids lu-k lu-k-messages lu-k-responses
@@providers
lu-k:
  displayName: "LUK"
  apiKeyEnv: LU_K_API_KEY
  api: openai-completions
  baseURL: "https://ai.example.test/v1"
  models:
    - id: "deepseek/deepseek-v4.1-flash"
      name: "DeepSeek V4.1 Flash"
      contextWindow: 1000000
      maxTokens: 32768
      input: [text, image]
      reasoningEfforts:
        off:
        high: "high"
        max: "max"
      compat:
        supportsDeveloperRole: false
        thinkingFormat: "deepseek"
    - id: "glm-5.3"
      name: "GLM 5.3（特惠）"
lu-k-messages:
  displayName: "LUK (Messages)"
  apiKeyEnv: LU_K_API_KEY
  api: anthropic-messages
  baseURL: "https://ai.example.test"
  models:
    - id: "claude-sonnet-5-5"
@@default-model
agent-default-model:
  provider: lu-k
  model: "deepseek/deepseek-v4.1-flash"
@@end
`

func TestClientModelsNameTheProtocolsOfEachChatModel(t *testing.T) {
	assert.Equal(t, []ClientModel{
		{ID: "claude-sonnet-5-5", Protocols: []string{"anthropic-messages"}},
		{
			ID:            "deepseek/deepseek-v4.1-flash",
			Name:          "DeepSeek V4.1 Flash",
			Protocols:     []string{"openai-completions", "anthropic-messages", "openai-responses"},
			ContextWindow: 1000000,
			MaxTokens:     32768,
			Input:         []string{"text", "image"},
		},
		{ID: "glm-5.3", Name: "GLM 5.3（特惠）", Protocols: []string{"openai-completions"}},
	}, ClientModels(testSetting, testModels), "hidden, image-only and unsafe ids are left out")
}

func TestRenamedModelsKeepTheirSetup(t *testing.T) {
	saved := map[string]string{}
	require.NoError(t, config.GlobalConfig.SaveToDB(func(key, value string) error {
		saved[key] = value
		return nil
	}))
	t.Cleanup(func() { require.NoError(t, config.GlobalConfig.LoadFromDB(saved)) })
	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		"model_naming.price_suffix_enabled": "true",
		"model_naming.aliases":              `{"deepseek/deepseek-v4.1-flash":"deepseek-v4.1-flash-x0.25"}`,
	}))

	endpoints := []constant.EndpointType{constant.EndpointTypeOpenAI}
	models := ClientModels(testSetting, []GatewayModel{
		{ID: "deepseek-v4.1-flash-x0.25", Endpoints: endpoints},
		{ID: "deepseek-v4.1-flash-x0.5", Endpoints: endpoints},
	})
	require.Len(t, models, 2)
	for _, model := range models {
		assert.Equal(t, "DeepSeek V4.1 Flash", model.Name, model.ID)
		assert.Equal(t, 1000000, model.ContextWindow, model.ID)
	}
	assert.Equal(t, "deepseek-v4.1-flash-x0.25", DefaultModel(operation_setting.DshSetupSetting{DefaultModel: "deepseek/deepseek-v4.1-flash"}))
}

func TestPayloadOffersEachModelOnOneProtocol(t *testing.T) {
	payload, err := BuildPayload(testSetting, "https://ai.example.test/", "sk-test0123456789", testModels)
	require.NoError(t, err)
	assert.Equal(t, testPayload, payload)

	fallback := testSetting
	fallback.DefaultModel = "no-such-model"
	payload, err = BuildPayload(fallback, "https://ai.example.test", "sk-test0123456789", testModels[3:4])
	require.NoError(t, err)
	assert.Contains(t, payload, "agent-default-model:\n  provider: lu-k-messages\n  model: \"claude-sonnet-5-5\"\n")

	_, err = BuildPayload(testSetting, "https://ai.example.test", "sk-test0123456789", testModels[:1])
	assert.ErrorIs(t, err, ErrNoModels, "only a hidden model is left")

	for name, mutate := range map[string]func(setting *operation_setting.DshSetupSetting, address *string, key *string){
		"provider id DSH would refuse": func(setting *operation_setting.DshSetupSetting, _ *string, _ *string) { setting.ProviderID = "LU K" },
		"address that is not an origin": func(_ *operation_setting.DshSetupSetting, address *string, _ *string) {
			*address = "https://ai.example.test/'; echo pwned"
		},
		"key that needs escaping": func(_ *operation_setting.DshSetupSetting, _ *string, key *string) { *key = "sk-\"\nrefs: {}" },
	} {
		setting, address, key := testSetting, "https://ai.example.test", "sk-test0123456789"
		mutate(&setting, &address, &key)
		_, err := BuildPayload(setting, address, key, testModels)
		assert.Error(t, err, name)
	}
}

const (
	configuredProviders = `    lu-k:
      displayName: "LUK"
      apiKeyEnv: LU_K_API_KEY
      api: openai-completions
      baseURL: "https://ai.example.test/v1"
      models:
        - id: "deepseek/deepseek-v4.1-flash"
          name: "DeepSeek V4.1 Flash"
          contextWindow: 1000000
          maxTokens: 32768
          input: [text, image]
          reasoningEfforts:
            off:
            high: "high"
            max: "max"
          compat:
            supportsDeveloperRole: false
            thinkingFormat: "deepseek"
        - id: "glm-5.3"
          name: "GLM 5.3（特惠）"
    lu-k-messages:
      displayName: "LUK (Messages)"
      apiKeyEnv: LU_K_API_KEY
      api: anthropic-messages
      baseURL: "https://ai.example.test"
      models:
        - id: "claude-sonnet-5-5"
`
	configuredDefault = `agent-default-model:
  provider: lu-k
  model: "deepseek/deepseek-v4.1-flash"
`
	freshSettings    = "llm-pi-ai:\n  providers:\n" + configuredProviders + "\n" + configuredDefault
	freshCredentials = "version: 1\nrefs:\n  LU_K_API_KEY: \"sk-test0123456789\"\n"
)

// setupRun is one run of a setup script against a throwaway DSH home and a
// stand-in gateway.
type setupRun struct {
	output   string
	exit     int
	redeemed int32
}

func runSetup(t *testing.T, shell string, home string, redeem http.HandlerFunc) setupRun {
	t.Helper()
	var redeemed atomic.Int32
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/dsh_setup/redeem" || r.URL.RawQuery != "" {
			http.NotFound(w, r)
			return
		}
		redeemed.Add(1)
		redeem(w, r)
	}))
	defer gateway.Close()

	script, err := Script(shell, gateway.URL, "LUK")
	require.NoError(t, err)
	var cmd *exec.Cmd
	if shell == "sh" {
		cmd = exec.Command("sh", "-s", "--", "the-setup-code")
		cmd.Stdin = strings.NewReader(script)
	} else {
		file := filepath.Join(t.TempDir(), "setup.ps1")
		require.NoError(t, os.WriteFile(file, []byte(script), 0o600))
		cmd = exec.Command("pwsh", "-NoProfile", "-NonInteractive", "-File", file)
	}
	cmd.Env = append(os.Environ(), "DSH_HOME="+home, "LUK_SETUP_CODE=the-setup-code")
	output, err := cmd.CombinedOutput()
	run := setupRun{output: string(output), redeemed: redeemed.Load()}
	if exit, ok := err.(*exec.ExitError); ok {
		run.exit = exit.ExitCode()
	} else {
		require.NoError(t, err, run.output)
	}
	return run
}

func configured(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Setup-Code") != "the-setup-code" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte(testPayload))
}

func TestSetupScriptsEditOnlyTheirOwnEntries(t *testing.T) {
	shells := []string{}
	if _, err := exec.LookPath("sh"); err == nil && runtime.GOOS != "windows" {
		shells = append(shells, "sh")
	}
	if _, err := exec.LookPath("pwsh"); err == nil {
		shells = append(shells, "ps1")
	}
	if len(shells) == 0 {
		t.Skip("neither sh nor pwsh is available")
	}

	cases := []struct {
		name            string
		settings        string // "" leaves the file out
		credentials     string
		wantSettings    string
		wantCredentials string
		wantExit        int
		wantBackups     int
	}{
		{
			name:            "a home with no configuration yet",
			wantSettings:    freshSettings,
			wantCredentials: freshCredentials,
		},
		{
			name: "other providers, sections and credentials are kept",
			settings: `# my settings
theme:
  mode: dark

llm-pi-ai:
  providers:
    openrouter:
      apiKeyEnv: OPENROUTER_API_KEY
    "lu-k":
      apiKeyEnv: LU_K_API_KEY
      api: openai-completions
      baseURL: https://ai.lu-k.cn/v1
      models:
        - id: old-model
          input: [text]

    lu-k-responses:
      api: openai-responses
      baseURL: https://old.example/v1
      models:
        - id: gone
    my-gateway:
      api: openai-completions
      baseURL: https://gateway.example/v1
      models:
        - id: mine
  # belongs to the key below
  transport: sse

agent-default-model:
  provider: openrouter
  model: some/model
`,
			credentials: `# keys
version: 1
refs:
  OPENROUTER_API_KEY: sk-or-abc
  LU_K_API_KEY: sk-old # typed by hand
records:
  web-session/signing:
    kind: secret
`,
			wantSettings: `# my settings
theme:
  mode: dark

llm-pi-ai:
  providers:
    openrouter:
      apiKeyEnv: OPENROUTER_API_KEY

    my-gateway:
      api: openai-completions
      baseURL: https://gateway.example/v1
      models:
        - id: mine
` + configuredProviders + `  # belongs to the key below
  transport: sse

agent-default-model:
  provider: openrouter
  model: some/model
`,
			wantCredentials: `# keys
version: 1
refs:
  OPENROUTER_API_KEY: sk-or-abc
  LU_K_API_KEY: "sk-test0123456789"
records:
  web-session/signing:
    kind: secret
`,
			wantBackups: 2,
		},
		{
			name:         "sections that DSH emptied",
			settings:     "llm-pi-ai:\n    providers: {}\n    transport: sse\n",
			credentials:  "version: 1\nrefs: {}\n",
			wantSettings: "llm-pi-ai:\n    providers:\n" + indent(configuredProviders, 4) + "    transport: sse\n\n" + configuredDefault,
			wantCredentials: `version: 1
refs:
  LU_K_API_KEY: "sk-test0123456789"
`,
			wantBackups: 2,
		},
		{
			name:            "a document emptied to a bare mapping",
			settings:        "{}\n",
			credentials:     "\n",
			wantSettings:    "\n" + freshSettings,
			wantCredentials: "\n" + freshCredentials,
			wantBackups:     2,
		},
		{
			name:            "layouts the editor does not understand are left alone",
			settings:        "{\"llm-pi-ai\": {\"providers\": {}}}\n",
			credentials:     "version: 2\nrefs: {}\n",
			wantSettings:    "{\"llm-pi-ai\": {\"providers\": {}}}\n",
			wantCredentials: "version: 2\nrefs: {}\n",
			wantExit:        2,
		},
	}

	for _, shell := range shells {
		for _, tc := range cases {
			t.Run(shell+"/"+tc.name, func(t *testing.T) {
				home := filepath.Join(t.TempDir(), "dsh home")
				settings := filepath.Join(home, "settings.yaml")
				credentials := filepath.Join(home, ".credentials.yaml")
				require.NoError(t, os.MkdirAll(home, 0o700))
				if tc.settings != "" {
					require.NoError(t, os.WriteFile(settings, []byte(tc.settings), 0o644))
				}
				if tc.credentials != "" {
					require.NoError(t, os.WriteFile(credentials, []byte(tc.credentials), 0o600))
				}

				run := runSetup(t, shell, home, configured)
				if shell == "sh" {
					assert.Equal(t, tc.wantExit, run.exit, run.output)
				}
				assert.NotContains(t, run.output, "sk-test0123456789", "the key is never printed")
				assert.Equal(t, tc.wantSettings, readFile(t, settings), run.output)
				assert.Equal(t, tc.wantCredentials, readFile(t, credentials), run.output)
				assert.Len(t, backups(t, home), tc.wantBackups, run.output)
				if runtime.GOOS != "windows" {
					info, err := os.Stat(credentials)
					require.NoError(t, err)
					assert.Equal(t, os.FileMode(0o600), info.Mode().Perm(), "DSH refuses a credentials file others can read")
				}

				again := runSetup(t, shell, home, configured)
				assert.Equal(t, tc.wantSettings, readFile(t, settings), again.output)
				assert.Equal(t, tc.wantCredentials, readFile(t, credentials), again.output)
				assert.Len(t, backups(t, home), tc.wantBackups, "a second run has nothing left to change")
			})
		}

		t.Run(shell+"/a home that cannot be written keeps the code unused", func(t *testing.T) {
			if os.Geteuid() == 0 || runtime.GOOS == "windows" {
				t.Skip("needs a directory the test cannot write to")
			}
			locked := filepath.Join(t.TempDir(), "locked")
			require.NoError(t, os.Mkdir(locked, 0o500))
			run := runSetup(t, shell, filepath.Join(locked, ".dsh"), configured)
			assert.Zero(t, run.redeemed, run.output)
			assert.Contains(t, run.output, "配置码还没有被用掉")
			if shell == "sh" {
				assert.Equal(t, 1, run.exit)
			}
		})

		t.Run(shell+"/a code the gateway turns down changes nothing", func(t *testing.T) {
			home := filepath.Join(t.TempDir(), ".dsh")
			run := runSetup(t, shell, home, http.NotFound)
			assert.EqualValues(t, 1, run.redeemed)
			assert.Contains(t, run.output, "配置码无效")
			entries, err := os.ReadDir(home)
			require.NoError(t, err)
			assert.Empty(t, entries)
			if shell == "sh" {
				assert.Equal(t, 1, run.exit)
			}
		})
	}
}

func indent(block string, by int) string {
	lines := strings.SplitAfter(block, "\n")
	for i, line := range lines {
		if line != "" {
			lines[i] = strings.Repeat(" ", by) + line
		}
	}
	return strings.Join(lines, "")
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	require.NoError(t, err)
	return string(data)
}

func backups(t *testing.T, home string) []string {
	t.Helper()
	found, err := filepath.Glob(filepath.Join(home, "*.luk-backup-*"))
	require.NoError(t, err)
	return found
}

func TestScriptIsPointedAtTheConfiguredGateway(t *testing.T) {
	for _, shell := range []string{"sh", "ps1"} {
		script, err := Script(shell, "https://ai.example.test/", "LUK's \"API\"\n")
		require.NoError(t, err)
		assert.Contains(t, script, "'https://ai.example.test'")
		assert.Contains(t, script, "'LUKs \"API\"'", "an apostrophe would end the quoted name")
		assert.NotContains(t, script, "__")
	}
	_, err := Script("sh", "https://ai.example.test/$(id)", "LUK")
	assert.Error(t, err)
	_, err = Script("fish", "https://ai.example.test", "LUK")
	assert.Error(t, err)
}
