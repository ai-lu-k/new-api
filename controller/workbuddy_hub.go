package controller

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	hub "github.com/QuantumNous/new-api/service/workbuddy_hub"
	"github.com/QuantumNous/new-api/setting/config"
	workbuddy_hub "github.com/QuantumNous/new-api/setting/workbuddy_hub"

	"github.com/gin-gonic/gin"
)

// The WorkBuddy console is new-api's own page, but the accounts, the scheduler
// and the request log live in the WorkBuddy hub. Rather than teach this process
// to run a second gateway, the console forwards a fixed list of hub calls: each
// console key maps to exactly one hub path and method, and anything not on the
// list is refused here instead of reaching the hub.
type workbuddyHubRoute struct {
	path    string
	timeout time.Duration
}

const workbuddyHubDefaultTimeout = 60 * time.Second

var workbuddyHubRoutes = map[string]workbuddyHubRoute{}

// registerWorkbuddyHubRoute adds one forwardable hub call. A timeout of zero
// uses the default; slow maintenance calls pass their own.
func registerWorkbuddyHubRoute(key, path string, timeout time.Duration) {
	workbuddyHubRoutes[key] = workbuddyHubRoute{path: path, timeout: timeout}
}

// WorkbuddyHubCall forwards one whitelisted hub call. Reads keep their query
// string, writes keep their JSON body, so the console sees the hub's own
// filtering instead of a second, drifting copy of it.
func WorkbuddyHubCall(c *gin.Context) {
	method := c.Request.Method
	if method != http.MethodGet && method != http.MethodPost {
		common.ApiErrorMsg(c, "unsupported workbuddy hub method")
		return
	}
	route, ok := workbuddyHubRoutes[c.Param("key")]
	if !ok {
		common.ApiErrorMsg(c, "unknown workbuddy hub call")
		return
	}
	var body []byte
	if method == http.MethodPost {
		payload, err := io.ReadAll(io.LimitReader(c.Request.Body, 8<<20))
		if err != nil {
			common.ApiErrorMsg(c, "invalid workbuddy hub request body")
			return
		}
		body = payload
	}
	payload, err := hub.Call(c.Request.Context(), method, route.path, c.Request.URL.Query(), body, route.timeout)
	if err != nil {
		common.ApiErrorMsg(c, workbuddyHubErrorMessage(err))
		return
	}
	if json.Valid(payload) {
		common.ApiSuccess(c, json.RawMessage(payload))
		return
	}
	// /logs/export answers with a text/plain attachment rather than JSON, so it
	// travels as text and the console turns it back into a download.
	common.ApiSuccess(c, gin.H{"text": string(payload)})
}

// workbuddyHubErrorMessage keeps the hub's own wording when it explains itself,
// and names the failure otherwise.
func workbuddyHubErrorMessage(err error) string {
	var hubErr *hub.Error
	if errors.As(err, &hubErr) {
		return hubErr.Error()
	}
	if errors.Is(err, hub.ErrNotConfigured) {
		return "workbuddy hub is not configured"
	}
	return "workbuddy hub is unreachable: " + err.Error()
}

// GetWorkbuddyHubStatus reports the console's own view of the hub: whether it is
// configured, and the hub's health when it answers.
func GetWorkbuddyHubStatus(c *gin.Context) {
	cfg := workbuddy_hub.GetWorkBuddyHubSettings()
	status := gin.H{
		"enabled":    cfg.Enabled,
		"configured": cfg.Configured(),
		"base_url":   cfg.Base(),
	}
	if cfg.Configured() {
		payload, err := hub.Call(c.Request.Context(), http.MethodGet, "/health", url.Values{}, nil, 15*time.Second)
		if err != nil {
			status["reachable"] = false
			status["error"] = workbuddyHubErrorMessage(err)
		} else {
			status["reachable"] = true
			status["health"] = json.RawMessage(payload)
		}
	}
	common.ApiSuccess(c, status)
}

type workbuddyHubConfigRequest struct {
	BaseURL       *string `json:"base_url"`
	PanelPassword *string `json:"panel_password"`
	Enabled       *bool   `json:"enabled"`
}

// GetWorkbuddyHubConfig returns the connection settings. The password is never
// echoed; the console only needs to know whether one is stored.
func GetWorkbuddyHubConfig(c *gin.Context) {
	cfg := workbuddy_hub.GetWorkBuddyHubSettings()
	common.ApiSuccess(c, gin.H{
		"base_url":             cfg.Base(),
		"enabled":              cfg.Enabled,
		"password_set":         strings.TrimSpace(cfg.PanelPassword) != "",
		"default_base_url":     workbuddy_hub.DefaultBaseURL,
		"environment_password": workbuddy_hub.PasswordFromEnvironment(),
	})
}

// UpdateWorkbuddyHubConfig stores the connection settings and applies them to
// the running process, dropping any cached hub session.
func UpdateWorkbuddyHubConfig(c *gin.Context) {
	var request workbuddyHubConfigRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorMsg(c, "invalid workbuddy hub settings")
		return
	}
	values := map[string]string{}
	if request.BaseURL != nil {
		base := strings.TrimRight(strings.TrimSpace(*request.BaseURL), "/")
		if base != "" && !strings.HasPrefix(base, "http://") && !strings.HasPrefix(base, "https://") {
			common.ApiErrorMsg(c, "workbuddy hub address must start with http:// or https://")
			return
		}
		values["base_url"] = base
	}
	if request.PanelPassword != nil {
		values["panel_password"] = *request.PanelPassword
	}
	if request.Enabled != nil {
		values["enabled"] = common.Interface2String(*request.Enabled)
	}
	for key, value := range values {
		if err := model.UpdateOption("workbuddy_hub."+key, value); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	if err := config.UpdateConfigFromMap(workbuddy_hub.GetWorkBuddyHubSettings(), values); err != nil {
		common.ApiError(c, err)
		return
	}
	hub.InvalidateSession()
	GetWorkbuddyHubConfig(c)
}
