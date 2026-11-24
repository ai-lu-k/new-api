package commandcode_pool

import (
	"os"
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

// Settings describes how this instance reaches its own CommandCode proxy. The
// proxy keeps the upstream keys, the load-balancing state and the credits; this
// instance only owns the console that talks to it, so the address is the whole
// link. The proxy's admin API is reachable on the private docker network and
// carries no credential of its own, so there is nothing else to store here.
type Settings struct {
	BaseURL string `json:"base_url"`
	Enabled bool   `json:"enabled"`
}

const (
	// DefaultBaseURL is empty until a proxy is configured.
	DefaultBaseURL = ""
	// configPrefix is the option key prefix, e.g. commandcode_pool.base_url.
	configPrefix = "commandcode_pool."
)

var settings = Settings{
	BaseURL: DefaultBaseURL,
	Enabled: false,
}

func init() {
	// The environment seeds the first boot; whatever the console later saves
	// lands in the options table and wins from then on.
	if v := strings.TrimSpace(os.Getenv("COMMANDCODE_POOL_URL")); v != "" {
		settings.BaseURL = v
		settings.Enabled = true
	}
	config.GlobalConfig.Register("commandcode_pool", &settings)
}

// GetCommandCodePoolSettings returns the live settings. Callers must not cache it.
func GetCommandCodePoolSettings() *Settings {
	return &settings
}

// Base returns the proxy root without a trailing slash.
func (s *Settings) Base() string {
	return strings.TrimRight(strings.TrimSpace(s.BaseURL), "/")
}

// Configured reports whether the console can talk to the proxy at all.
func (s *Settings) Configured() bool {
	return s.Enabled && s.Base() != ""
}
