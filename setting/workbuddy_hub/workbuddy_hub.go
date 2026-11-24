package workbuddy_hub

import (
	"os"
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

// Settings describes how this instance reaches the WorkBuddy hub.
// The hub keeps the accounts, the scheduler and the request log; new-api owns
// the console that talks to it, so these three values are the whole link.
type Settings struct {
	BaseURL string `json:"base_url"`
	// PanelPassword is the hub's panel password. The hub only accepts its own
	// session token on /accounts, /usage, /tasks and /settings, so the console
	// logs in with this password and keeps the token in memory.
	PanelPassword string `json:"panel_password"`
	Enabled       bool   `json:"enabled"`
}

const (
	// DefaultBaseURL is empty until a proxy is configured.
	DefaultBaseURL = ""
	// configPrefix is the option key prefix, e.g. workbuddy_hub.base_url.
	configPrefix = "workbuddy_hub."
)

var settings = Settings{
	BaseURL: DefaultBaseURL,
	Enabled: false,
}

func init() {
	// The environment seeds the first boot; whatever the console later saves
	// lands in the options table and wins from then on.
	if v := strings.TrimSpace(os.Getenv("WORKBUDDY_HUB_URL")); v != "" {
		settings.BaseURL = v
		settings.Enabled = true
	}
	if v := os.Getenv("WORKBUDDY_HUB_PASSWORD"); v != "" {
		settings.PanelPassword = v
	}
	config.GlobalConfig.Register("workbuddy_hub", &settings)
}

// GetWorkBuddyHubSettings returns the live settings. Callers must not cache it.
func GetWorkBuddyHubSettings() *Settings {
	return &settings
}

// Base returns the hub root without a trailing slash.
func (s *Settings) Base() string {
	return strings.TrimRight(strings.TrimSpace(s.BaseURL), "/")
}

// PasswordFromEnvironment reports the password the process was started with, so
// the console can say whether an empty stored password is inherited.
func PasswordFromEnvironment() bool {
	return strings.TrimSpace(os.Getenv("WORKBUDDY_HUB_PASSWORD")) != ""
}

// Configured reports whether the console can talk to the hub at all.
func (s *Settings) Configured() bool {
	return s.Enabled && s.Base() != "" && strings.TrimSpace(s.PanelPassword) != ""
}
