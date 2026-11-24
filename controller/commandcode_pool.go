package controller

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	pool "github.com/QuantumNous/new-api/service/commandcode_pool"
	commandcode_pool "github.com/QuantumNous/new-api/setting/commandcode_pool"
	"github.com/QuantumNous/new-api/setting/config"

	"github.com/gin-gonic/gin"
)

// The CommandCode console is new-api's own page, but the upstream keys, the
// load-balancing state and the credits live in a CommandCode proxy. Rather
// than teach this process to run a second pool, the console forwards a fixed
// set of proxy admin calls: every route below names exactly one proxy path, and
// nothing else is reachable from a dashboard session.
const (
	commandCodePoolAdmin     = "/admin/api"
	commandCodePoolDefault   = 60 * time.Second
	commandCodePoolCredits   = 120 * time.Second
	commandCodePoolRefresh   = 300 * time.Second
	commandCodePoolMaxBody   = 1 << 20
	commandCodePoolKeyIDExpr = `^[A-Za-z0-9_-]+$`
)

var commandCodePoolKeyID = regexp.MustCompile(commandCodePoolKeyIDExpr)

// GetCommandCodePoolStatus reports the console's own view of the proxy: whether
// it is configured, and the pool's size when the proxy answers.
func GetCommandCodePoolStatus(c *gin.Context) {
	cfg := commandcode_pool.GetCommandCodePoolSettings()
	status := gin.H{
		"enabled":    cfg.Enabled,
		"configured": cfg.Configured(),
		"base_url":   cfg.Base(),
	}
	if cfg.Configured() {
		payload, err := pool.Call(c.Request.Context(), http.MethodGet, commandCodePoolAdmin+"/keys", nil, 15*time.Second)
		if err != nil {
			status["reachable"] = false
			status["error"] = commandCodePoolErrorMessage(err)
		} else {
			status["reachable"] = true
			var state struct {
				APIBase string `json:"apiBase"`
				Keys    []struct {
					Enabled bool `json:"enabled"`
				} `json:"keys"`
			}
			if err := common.Unmarshal(payload, &state); err == nil {
				enabled := 0
				for _, key := range state.Keys {
					if key.Enabled {
						enabled++
					}
				}
				status["api_base"] = state.APIBase
				status["keys_total"] = len(state.Keys)
				status["keys_enabled"] = enabled
			}
		}
	}
	common.ApiSuccess(c, status)
}

type commandCodePoolConfigRequest struct {
	BaseURL *string `json:"base_url"`
	Enabled *bool   `json:"enabled"`
}

// GetCommandCodePoolConfig returns the connection settings.
func GetCommandCodePoolConfig(c *gin.Context) {
	cfg := commandcode_pool.GetCommandCodePoolSettings()
	common.ApiSuccess(c, gin.H{
		"base_url":         cfg.Base(),
		"enabled":          cfg.Enabled,
		"default_base_url": commandcode_pool.DefaultBaseURL,
	})
}

// UpdateCommandCodePoolConfig stores the connection settings and applies them to
// the running process, so the console needs no restart after a change.
func UpdateCommandCodePoolConfig(c *gin.Context) {
	var request commandCodePoolConfigRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorMsg(c, "invalid commandcode pool settings")
		return
	}
	values := map[string]string{}
	if request.BaseURL != nil {
		base := strings.TrimRight(strings.TrimSpace(*request.BaseURL), "/")
		if base != "" && !strings.HasPrefix(base, "http://") && !strings.HasPrefix(base, "https://") {
			common.ApiErrorMsg(c, "commandcode pool address must start with http:// or https://")
			return
		}
		values["base_url"] = base
	}
	if request.Enabled != nil {
		values["enabled"] = common.Interface2String(*request.Enabled)
	}
	for key, value := range values {
		if err := model.UpdateOption("commandcode_pool."+key, value); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	if err := config.UpdateConfigFromMap(commandcode_pool.GetCommandCodePoolSettings(), values); err != nil {
		common.ApiError(c, err)
		return
	}
	GetCommandCodePoolConfig(c)
}

// GetCommandCodePoolOverview forwards the proxy's own summary of the egresses it
// serves, so the console describes the pool the same way the proxy does.
func GetCommandCodePoolOverview(c *gin.Context) {
	commandCodePoolForward(c, http.MethodGet, commandCodePoolAdmin+"/overview", commandCodePoolDefault)
}

// GetCommandCodePoolState forwards the pool snapshot: keys, load balancing,
// settings and the credits refresh state in one reply.
func GetCommandCodePoolState(c *gin.Context) {
	commandCodePoolForward(c, http.MethodGet, commandCodePoolAdmin+"/keys", commandCodePoolDefault)
}

// CreateCommandCodePoolKey adds one upstream key. The proxy validates the key
// shape and refuses duplicates; its wording travels back unchanged.
func CreateCommandCodePoolKey(c *gin.Context) {
	commandCodePoolForward(c, http.MethodPost, commandCodePoolAdmin+"/keys", commandCodePoolDefault)
}

// UpdateCommandCodePoolKey edits one key's label, weight, priority, enabled or
// default state.
func UpdateCommandCodePoolKey(c *gin.Context) {
	id, ok := commandCodePoolKeyParam(c)
	if !ok {
		return
	}
	commandCodePoolForward(c, http.MethodPatch, commandCodePoolAdmin+"/keys/"+id, commandCodePoolDefault)
}

// DeleteCommandCodePoolKey removes one key from the pool. The proxy returns an
// empty body, so the console only needs the envelope.
func DeleteCommandCodePoolKey(c *gin.Context) {
	id, ok := commandCodePoolKeyParam(c)
	if !ok {
		return
	}
	commandCodePoolForward(c, http.MethodDelete, commandCodePoolAdmin+"/keys/"+id, commandCodePoolDefault)
}

// GetCommandCodePoolKeyCredits asks the proxy to re-read one key's credits from
// upstream. Slow: the call waits for the provider.
func GetCommandCodePoolKeyCredits(c *gin.Context) {
	id, ok := commandCodePoolKeyParam(c)
	if !ok {
		return
	}
	commandCodePoolForward(c, http.MethodGet, commandCodePoolAdmin+"/keys/"+id+"/credits", commandCodePoolCredits)
}

// RefreshCommandCodePoolCredits re-reads every key's credits. Slow: it waits for
// one upstream call per key.
func RefreshCommandCodePoolCredits(c *gin.Context) {
	commandCodePoolForward(c, http.MethodPost, commandCodePoolAdmin+"/keys/refresh-credits", commandCodePoolRefresh)
}

// GetCommandCodePoolLB returns the load-balancing configuration.
func GetCommandCodePoolLB(c *gin.Context) {
	commandCodePoolForward(c, http.MethodGet, commandCodePoolAdmin+"/lb", commandCodePoolDefault)
}

// UpdateCommandCodePoolLB saves the load-balancing configuration. The proxy
// clamps every field, so the reply is its own normalized copy.
func UpdateCommandCodePoolLB(c *gin.Context) {
	commandCodePoolForward(c, http.MethodPut, commandCodePoolAdmin+"/lb", commandCodePoolDefault)
}

// GetCommandCodePoolSettings returns the pool's scheduling settings together
// with the credits refresh state.
func GetCommandCodePoolSettings(c *gin.Context) {
	commandCodePoolForward(c, http.MethodGet, commandCodePoolAdmin+"/settings", commandCodePoolDefault)
}

// UpdateCommandCodePoolSettings saves the scheduling settings. Alert channels
// have their own proxy endpoint and are not touched from here.
func UpdateCommandCodePoolSettings(c *gin.Context) {
	commandCodePoolForward(c, http.MethodPut, commandCodePoolAdmin+"/settings", commandCodePoolDefault)
}

// commandCodePoolKeyParam reads and validates the key id. It is never taken
// verbatim from the browser: the id is restricted to the characters the proxy
// itself generates, so it cannot address another admin path.
func commandCodePoolKeyParam(c *gin.Context) (string, bool) {
	id := c.Param("id")
	if !commandCodePoolKeyID.MatchString(id) {
		common.ApiErrorMsg(c, "invalid commandcode pool key id")
		return "", false
	}
	return id, true
}

// commandCodePoolForward performs one whitelisted proxy call and answers the
// console with the proxy's own JSON.
func commandCodePoolForward(c *gin.Context, method, path string, timeout time.Duration) {
	var body []byte
	if method != http.MethodGet {
		payload, err := io.ReadAll(io.LimitReader(c.Request.Body, commandCodePoolMaxBody+1))
		if err != nil {
			common.ApiErrorMsg(c, "invalid commandcode pool request body")
			return
		}
		if len(payload) > commandCodePoolMaxBody {
			common.ApiErrorMsg(c, "commandcode pool request body is too large")
			return
		}
		body = payload
	}
	payload, err := pool.Call(c.Request.Context(), method, path, body, timeout)
	if err != nil {
		common.ApiErrorMsg(c, commandCodePoolErrorMessage(err))
		return
	}
	if len(payload) == 0 {
		common.ApiSuccess(c, nil)
		return
	}
	common.ApiSuccess(c, json.RawMessage(payload))
}

// commandCodePoolErrorMessage keeps the proxy's own wording when it explains
// itself, and names the failure otherwise.
func commandCodePoolErrorMessage(err error) string {
	var proxyErr *pool.Error
	if errors.As(err, &proxyErr) {
		return proxyErr.Error()
	}
	if errors.Is(err, pool.ErrNotConfigured) {
		return "commandcode pool is not configured"
	}
	return "commandcode pool is unreachable: " + err.Error()
}
