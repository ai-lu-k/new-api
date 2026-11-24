package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/gin-gonic/gin"
)

const (
	// botMaxWindowSeconds bounds one answer. A bot that wants a longer history
	// has to page through several explicit windows instead of pulling it at once.
	botMaxWindowSeconds     = 7 * 24 * 60 * 60
	botDefaultWindowSeconds = 24 * 60 * 60
	botLogDefaultPageSize   = 50
	botLogMaxPageSize       = 200
	// botLogMaxOffset bounds how deep one credential can page, so an account-id
	// sweep cannot walk an unbounded log table. A caller that needs older rows
	// narrows the window instead of skipping further.
	botLogMaxOffset  = 10000
	botLogReadAction = "bot.log.read"
)

// botLogItem is the complete whitelist a bot response row can contain. It is
// filled field by field from a log row, so infrastructure detail (channel, ip,
// upstream ids, raw upstream bodies) stays unreachable even when model.Log grows
// new columns.
type botLogItem struct {
	CreatedAt        int64  `json:"created_at"`
	RequestId        string `json:"request_id"`
	ModelName        string `json:"model_name"`
	Type             int    `json:"type"`
	Quota            int    `json:"quota"`
	PromptTokens     int    `json:"prompt_tokens"`
	CompletionTokens int    `json:"completion_tokens"`
	UseTime          int    `json:"use_time"`
	IsStream         bool   `json:"is_stream"`
	TokenName        string `json:"token_name"`
	Group            string `json:"group"`
	ErrorClass       string `json:"error_class"`
}

// botErrorClass reduces a row to the small enum a chat bot may repeat. Upstream
// text, driver errors and stack traces never become part of this string.
func botErrorClass(row *model.Log) string {
	var other struct {
		StatusCode   *int   `json:"status_code"`
		ErrorCode    string `json:"error_code"`
		StreamStatus *struct {
			Status string `json:"status"`
		} `json:"stream_status"`
	}
	// The public projection of a log's "other" payload carries these keys; an
	// unparsable payload simply contributes no classification.
	_ = common.UnmarshalJsonStr(row.Other, &other)

	switch row.Type {
	case model.LogTypeError:
		switch other.ErrorCode {
		case string(types.ErrorCodeInsufficientUserQuota), string(types.ErrorCodePreConsumeTokenQuotaFailed):
			return "quota_exhausted"
		case string(types.ErrorCodeModelNotFound):
			return "model_unavailable"
		case string(types.ErrorCodeAccessDenied):
			return "auth_failed"
		}
		status := 0
		if other.StatusCode != nil {
			status = *other.StatusCode
		}
		switch {
		case status == http.StatusPaymentRequired:
			return "quota_exhausted"
		case status == http.StatusUnauthorized || status == http.StatusForbidden:
			return "auth_failed"
		case status == http.StatusNotFound:
			return "model_unavailable"
		case status == http.StatusRequestTimeout || status == http.StatusGatewayTimeout:
			return "timeout"
		case status == http.StatusTooManyRequests:
			return "rate_limited"
		case status == http.StatusBadRequest || status == http.StatusRequestEntityTooLarge || status == http.StatusUnprocessableEntity:
			return "invalid_request"
		case status >= 500:
			return "upstream_error"
		}
		return "other"
	case model.LogTypeConsume:
		if other.StreamStatus != nil && other.StreamStatus.Status == "error" {
			return "interrupted"
		}
	}
	return ""
}

func botLogItemFromRow(row *model.Log) botLogItem {
	return botLogItem{
		CreatedAt:        row.CreatedAt,
		RequestId:        row.RequestId,
		ModelName:        row.ModelName,
		Type:             row.Type,
		Quota:            row.Quota,
		PromptTokens:     row.PromptTokens,
		CompletionTokens: row.CompletionTokens,
		UseTime:          row.UseTime,
		IsStream:         row.IsStream,
		TokenName:        row.TokenName,
		Group:            row.Group,
		ErrorClass:       botErrorClass(row),
	}
}

// botLogError answers with one of the fixed bot error codes. No driver, upstream
// or stack text is ever part of the response.
func botLogError(c *gin.Context, status int, code string) {
	c.JSON(status, gin.H{"success": false, "code": code})
}

// botWindow is the resolved time range of one query, kept apart so the audit
// entry and the response describe the same window.
type botWindow struct {
	since int64
	until int64
}

// botResolveWindow reads the since/until query pair shared by the read
// endpoints and refuses a window it cannot answer exactly: clamping silently
// would answer a different question than the bot asked.
func botResolveWindow(c *gin.Context) (botWindow, int, string) {
	window := botWindow{until: common.GetTimestamp()}
	if raw := strings.TrimSpace(c.Query("until")); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || parsed <= 0 {
			return botWindow{}, http.StatusBadRequest, "invalid_params"
		}
		window.until = parsed
	}
	window.since = window.until - botDefaultWindowSeconds
	if raw := strings.TrimSpace(c.Query("since")); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || parsed <= 0 {
			return botWindow{}, http.StatusBadRequest, "invalid_params"
		}
		window.since = parsed
	}
	if window.since > window.until {
		return botWindow{}, http.StatusBadRequest, "invalid_params"
	}
	if window.until-window.since > botMaxWindowSeconds {
		return botWindow{}, http.StatusBadRequest, "window_too_large"
	}
	return window, 0, ""
}

// recordBotAudit audits the fact of one bot query (credential version, target
// account, parameters) and never the returned payload. The row belongs to no
// user: the support bot is a service actor, so it stays out of the queried
// account's own audit page while administrators can still filter it as the bot
// category.
func recordBotAudit(c *gin.Context, action string, params map[string]any, status int, success bool) {
	model.RecordAuditLog(c, model.AuditLog{
		Category:   model.AuditCategoryBot,
		Action:     action,
		AuthMethod: "bot_token",
		TokenRef:   c.GetString(middleware.BotTokenRefContextKey),
		Content:    auditContentEN(action, params),
		Success:    success,
		Status:     status,
		Other: model.AuditOther{
			Op:        &model.AuditOperation{Action: action, Params: model.AuditFields(params)},
			AdminInfo: &model.AuditAdminInfo{AdminUsername: "support bot", AuthMethod: "bot_token"},
		},
	})
}

// recordBotLogRead audits one usage-log page read.
func recordBotLogRead(c *gin.Context, subject *botSubject, window botWindow, rows int, total int64) {
	recordBotAudit(c, botLogReadAction, map[string]any{
		"target_user_id":  subject.account.Id,
		"target_username": subject.account.Username,
		"resolved_by":     subject.resolvedBy,
		"since":           window.since,
		"until":           window.until,
		"rows":            rows,
		"total":           total,
	}, http.StatusOK, true)
}

// GetBotLogs answers the external support bot: one account's usage rows over a
// bounded window, projected onto botLogItem. The account is named either by exact
// username / numeric id, or through the QQ binding the bot itself maintains, and
// needs no user credential. Every failure is one of a fixed set of codes:
// invalid_params, window_too_large, user_not_found, method_not_allowed,
// rate_limited (from middleware) and internal.
func GetBotLogs(c *gin.Context) {
	if c.Request.Method != http.MethodGet {
		botLogError(c, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	window, status, code := botResolveWindow(c)
	if code != "" {
		botLogError(c, status, code)
		return
	}

	logType := model.LogTypeUnknown
	if raw := strings.TrimSpace(c.Query("type")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < model.LogTypeUnknown || parsed > model.LogTypeLogin {
			botLogError(c, http.StatusBadRequest, "invalid_params")
			return
		}
		logType = parsed
	}
	modelName := strings.TrimSpace(c.Query("model"))
	// The shared log query reads "%" as a LIKE pattern; the bot only gets exact
	// model names.
	if len(modelName) > 200 || strings.Contains(modelName, "%") {
		botLogError(c, http.StatusBadRequest, "invalid_params")
		return
	}

	page, pageSize := 1, botLogDefaultPageSize
	if raw := strings.TrimSpace(c.Query("page")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > botLogMaxOffset {
			botLogError(c, http.StatusBadRequest, "invalid_params")
			return
		}
		page = parsed
	}
	if raw := strings.TrimSpace(c.Query("page_size")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > botLogMaxPageSize {
			botLogError(c, http.StatusBadRequest, "invalid_params")
			return
		}
		pageSize = parsed
	}
	offset := (page - 1) * pageSize
	if offset > botLogMaxOffset {
		botLogError(c, http.StatusBadRequest, "invalid_params")
		return
	}

	subject, status, code := resolveBotSubject(c)
	if code != "" {
		botLogError(c, status, code)
		return
	}

	logs, total, err := model.GetUserLogs(subject.account.Id, logType, window.since, window.until, modelName, "", offset, pageSize, "", "", "")
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("bot log query failed (user_id=%d): %v", subject.account.Id, err))
		botLogError(c, http.StatusInternalServerError, "internal")
		return
	}
	items := make([]botLogItem, 0, len(logs))
	for _, row := range logs {
		items = append(items, botLogItemFromRow(row))
	}
	recordBotLogRead(c, subject, window, len(items), total)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"user":        gin.H{"id": subject.account.Id, "username": subject.account.Username},
			"resolved_by": subject.resolvedBy,
			"since":       window.since,
			"until":       window.until,
			"page":        page,
			"page_size":   pageSize,
			"total":       total,
			"items":       items,
		},
	})
}
