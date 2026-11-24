package controller

import (
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	botAccountReadAction  = "bot.account.read"
	botUsageReadAction    = "bot.usage.read"
	botBindingReadAction  = "bot.binding.read"
	botBindingCreate      = "bot.binding.create"
	botBindingDelete      = "bot.binding.delete"
	botIdentifierMaxRunes = 64
)

// botOpenidPattern bounds the QQ identity strings the bot submits. They are
// opaque platform tokens, so the shape is checked and never interpreted.
var botOpenidPattern = regexp.MustCompile(`^[0-9A-Za-z_\-/+=.]{1,64}$`)

// botSubject is one request's subject: the account, plus the binding that named
// it when the caller asked by QQ identity instead of by account.
type botSubject struct {
	account    *model.BotAccount
	resolvedBy string
}

// botQQIdentity reads and validates the QQ identity query pair. A caller that
// omits either half gets no lookup rather than a wildcard match.
func botQQIdentity(c *gin.Context) (groupOpenid, qqOpenid string, ok bool) {
	groupOpenid = strings.TrimSpace(c.Query("group_openid"))
	qqOpenid = strings.TrimSpace(c.Query("qq_openid"))
	if !botOpenidPattern.MatchString(groupOpenid) || !botOpenidPattern.MatchString(qqOpenid) {
		return "", "", false
	}
	return groupOpenid, qqOpenid, true
}

// resolveBotSubject turns a request into the one account it may answer about.
// The account is named either explicitly (?user=) or by the QQ identity that
// bound it; there is no way to ask for "any account" or to list accounts.
func resolveBotSubject(c *gin.Context) (*botSubject, int, string) {
	identifier := strings.TrimSpace(c.Query("user"))
	if identifier != "" {
		if len(identifier) > botIdentifierMaxRunes {
			return nil, http.StatusBadRequest, "invalid_params"
		}
		account, err := model.FindBotAccount(identifier)
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			return nil, http.StatusNotFound, "user_not_found"
		case err != nil:
			logger.LogError(c.Request.Context(), fmt.Sprintf("bot account lookup failed: %v", err))
			return nil, http.StatusInternalServerError, "internal"
		}
		return &botSubject{account: account, resolvedBy: "user"}, 0, ""
	}

	groupOpenid, qqOpenid, ok := botQQIdentity(c)
	if !ok {
		return nil, http.StatusBadRequest, "invalid_params"
	}
	binding, err := model.FindQQBinding(groupOpenid, qqOpenid)
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		// Not bound is a normal answer: the bot tells the member to bind first.
		return nil, http.StatusNotFound, "binding_not_found"
	case err != nil:
		logger.LogError(c.Request.Context(), fmt.Sprintf("bot binding lookup failed: %v", err))
		return nil, http.StatusInternalServerError, "internal"
	}
	account, err := model.FindBotAccount(strconv.Itoa(binding.UserId))
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		return nil, http.StatusNotFound, "user_not_found"
	case err != nil:
		logger.LogError(c.Request.Context(), fmt.Sprintf("bot bound account lookup failed (user_id=%d): %v", binding.UserId, err))
		return nil, http.StatusInternalServerError, "internal"
	}
	return &botSubject{account: account, resolvedBy: "qq_binding"}, 0, ""
}

// GetBotAccount answers the balance, cumulative usage and state of one account.
// Quota values stay in internal units; quota_per_unit lets the bot render currency
// without hardcoding the site's exchange rate.
func GetBotAccount(c *gin.Context) {
	if c.Request.Method != http.MethodGet {
		botLogError(c, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	subject, status, code := resolveBotSubject(c)
	if code != "" {
		botLogError(c, status, code)
		return
	}
	recordBotAudit(c, botAccountReadAction, map[string]any{
		"target_user_id":  subject.account.Id,
		"target_username": subject.account.Username,
		"resolved_by":     subject.resolvedBy,
	}, http.StatusOK, true)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"user":           subject.account,
			"quota_per_unit": common.QuotaPerUnit,
			"resolved_by":    subject.resolvedBy,
		},
	})
}

// botErrorCount is one fixed error class and how many rows fell into it.
type botErrorCount struct {
	ErrorClass string `json:"error_class"`
	Requests   int    `json:"requests"`
}

// botErrorClassCounts reduces sampled error rows to the fixed enum. Rows whose
// class is empty are not errors and are dropped.
func botErrorClassCounts(rows []*model.Log) []botErrorCount {
	counts := map[string]int{}
	for _, row := range rows {
		if class := botErrorClass(row); class != "" {
			counts[class]++
		}
	}
	out := make([]botErrorCount, 0, len(counts))
	for class, requests := range counts {
		out = append(out, botErrorCount{ErrorClass: class, Requests: requests})
	}
	slices.SortFunc(out, func(a, b botErrorCount) int {
		if a.Requests != b.Requests {
			return b.Requests - a.Requests
		}
		return strings.Compare(a.ErrorClass, b.ErrorClass)
	})
	return out
}

// GetBotUsage answers "how much did I use" with one aggregate instead of a page of
// rows, so the bot never has to sum a log listing itself.
func GetBotUsage(c *gin.Context) {
	if c.Request.Method != http.MethodGet {
		botLogError(c, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	window, status, code := botResolveWindow(c)
	if code != "" {
		botLogError(c, status, code)
		return
	}
	subject, status, code := resolveBotSubject(c)
	if code != "" {
		botLogError(c, status, code)
		return
	}

	snapshot, err := model.GetBotUsageSnapshot(subject.account.Id, window.since, window.until)
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("bot usage query failed (user_id=%d): %v", subject.account.Id, err))
		botLogError(c, http.StatusInternalServerError, "internal")
		return
	}
	errorsByClass := botErrorClassCounts(snapshot.ErrorSample)
	recordBotAudit(c, botUsageReadAction, map[string]any{
		"target_user_id":  subject.account.Id,
		"target_username": subject.account.Username,
		"since":           window.since,
		"until":           window.until,
		"requests":        snapshot.Totals.Requests,
		"error_classes":   len(errorsByClass),
	}, http.StatusOK, true)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"user":           gin.H{"id": subject.account.Id, "username": subject.account.Username},
			"since":          window.since,
			"until":          window.until,
			"quota_per_unit": common.QuotaPerUnit,
			"resolved_by":    subject.resolvedBy,
			"totals":         snapshot.Totals,
			"models":         snapshot.Models,
			"types":          snapshot.Types,
			"errors":         errorsByClass,
		},
	})
}
