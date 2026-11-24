package controller

import (
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	botUsernameMaxRunes = 64
	botQQNameMaxRunes   = 128
)

// botUsernamePattern bounds the account name the bot submits before it is used
// as an exact-match lookup key.
var botUsernamePattern = regexp.MustCompile(`^[\p{Han}A-Za-z0-9_.\-]{1,64}$`)

// botBindingPayload is the "this group member is that account" statement the bot
// sends after a member names the account in the group. The account is resolved
// here, not trusted from the caller: only an existing username binds.
type botBindingPayload struct {
	GroupOpenid string `json:"group_openid"`
	QQOpenid    string `json:"qq_openid"`
	QQName      string `json:"qq_name"`
	Username    string `json:"username"`
}

func botBindingJSON(binding *model.QQBinding) gin.H {
	qqName := ""
	if binding.QQName != nil {
		qqName = *binding.QQName
	}
	return gin.H{
		"group_openid": binding.GroupOpenid,
		"qq_openid":    binding.QQOpenid,
		"qq_name":      qqName,
		"user_id":      binding.UserId,
		"username":     binding.Username,
		"created_at":   binding.CreatedAt,
	}
}

// GetBotBinding answers which account one QQ identity claimed. "Not bound" is a
// normal answer with a null binding, because the bot has to say so in the group.
func GetBotBinding(c *gin.Context) {
	groupOpenid, qqOpenid, ok := botQQIdentity(c)
	if !ok {
		botLogError(c, http.StatusBadRequest, "invalid_params")
		return
	}
	binding, err := model.FindQQBinding(groupOpenid, qqOpenid)
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		recordBotAudit(c, botBindingReadAction, map[string]any{"bound": false}, http.StatusOK, true)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"binding": nil}})
		return
	case err != nil:
		logger.LogError(c.Request.Context(), fmt.Sprintf("bot binding read failed: %v", err))
		botLogError(c, http.StatusInternalServerError, "internal")
		return
	}
	recordBotAudit(c, botBindingReadAction, map[string]any{
		"target_user_id":  binding.UserId,
		"target_username": binding.Username,
		"bound":           true,
	}, http.StatusOK, true)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"binding": botBindingJSON(binding)}})
}

// CreateBotBinding records one member's claim on an existing account. A rebind by
// the same member replaces the earlier account; another member's claim on an
// account that is already bound is refused, so a typo cannot steal an identity.
func CreateBotBinding(c *gin.Context) {
	payload := botBindingPayload{}
	if err := c.ShouldBindJSON(&payload); err != nil {
		botLogError(c, http.StatusBadRequest, "invalid_params")
		return
	}
	payload.GroupOpenid = strings.TrimSpace(payload.GroupOpenid)
	payload.QQOpenid = strings.TrimSpace(payload.QQOpenid)
	payload.QQName = strings.TrimSpace(payload.QQName)
	payload.Username = strings.TrimSpace(payload.Username)
	if !botOpenidPattern.MatchString(payload.GroupOpenid) || !botOpenidPattern.MatchString(payload.QQOpenid) {
		botLogError(c, http.StatusBadRequest, "invalid_params")
		return
	}
	if !botUsernamePattern.MatchString(payload.Username) || len(payload.QQName) > botQQNameMaxRunes {
		botLogError(c, http.StatusBadRequest, "invalid_params")
		return
	}

	account, err := model.FindBotAccount(payload.Username)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		botLogError(c, http.StatusNotFound, "user_not_found")
		return
	}
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("bot binding account lookup failed: %v", err))
		botLogError(c, http.StatusInternalServerError, "internal")
		return
	}

	binding, err := model.BindQQAccount(model.QQBindingInput{
		GroupOpenid: payload.GroupOpenid,
		QQOpenid:    payload.QQOpenid,
		QQName:      payload.QQName,
		UserId:      account.Id,
		Username:    account.Username,
		Now:         common.GetTimestamp(),
	})
	switch {
	case errors.Is(err, model.ErrQQBindingAccountTaken):
		recordBotAudit(c, botBindingCreate, map[string]any{
			"target_user_id":  account.Id,
			"target_username": account.Username,
			"rejected":        "account_already_bound",
		}, http.StatusConflict, false)
		botLogError(c, http.StatusConflict, "account_already_bound")
		return
	case err != nil:
		logger.LogError(c.Request.Context(), fmt.Sprintf("bot binding write failed (user_id=%d): %v", account.Id, err))
		botLogError(c, http.StatusInternalServerError, "internal")
		return
	}

	recordBotAudit(c, botBindingCreate, map[string]any{
		"target_user_id":  binding.UserId,
		"target_username": binding.Username,
	}, http.StatusOK, true)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"binding": botBindingJSON(binding)}})
}

// DeleteBotBinding drops one member's claim. It reports whether a row was
// removed instead of claiming success unconditionally.
func DeleteBotBinding(c *gin.Context) {
	groupOpenid, qqOpenid, ok := botQQIdentity(c)
	if !ok {
		botLogError(c, http.StatusBadRequest, "invalid_params")
		return
	}
	existing, err := model.FindQQBinding(groupOpenid, qqOpenid)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		logger.LogError(c.Request.Context(), fmt.Sprintf("bot binding read before delete failed: %v", err))
		botLogError(c, http.StatusInternalServerError, "internal")
		return
	}
	removed, err := model.UnbindQQAccount(groupOpenid, qqOpenid)
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("bot binding delete failed: %v", err))
		botLogError(c, http.StatusInternalServerError, "internal")
		return
	}
	if reminder := existing; reminder != nil {
		recordBotAudit(c, botBindingDelete, map[string]any{
			"target_user_id":  reminder.UserId,
			"target_username": reminder.Username,
			"removed":         removed,
		}, http.StatusOK, true)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"removed": removed}})
}

// HandleBotBinding dispatches the binding method set. The path accepts the three
// methods it serves and answers 405 for anything else, matching the log surface.
func HandleBotBinding(c *gin.Context) {
	switch c.Request.Method {
	case http.MethodGet:
		GetBotBinding(c)
	case http.MethodPost:
		CreateBotBinding(c)
	case http.MethodDelete:
		DeleteBotBinding(c)
	default:
		botLogError(c, http.StatusMethodNotAllowed, "method_not_allowed")
	}
}
