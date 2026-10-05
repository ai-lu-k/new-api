package controller

import (
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

const (
	feedbackMinContentLen = 5
	feedbackMaxContentLen = 2000
	feedbackMaxContactLen = 120
	feedbackMaxReplyLen   = 2000
	feedbackOwnListLimit  = 50
)

type feedbackRequest struct {
	Content   string `json:"content"`
	Contact   string `json:"contact"`
	Anonymous bool   `json:"anonymous"`
}

// CreateFeedback stores a message from the signed-in user. An anonymous one
// is stored without the user's id or name.
func CreateFeedback(c *gin.Context) {
	var req feedbackRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	content := strings.TrimSpace(req.Content)
	contact := strings.TrimSpace(req.Contact)
	length := utf8.RuneCountInString(content)
	if length < feedbackMinContentLen || length > feedbackMaxContentLen ||
		utf8.RuneCountInString(contact) > feedbackMaxContactLen {
		common.ApiErrorI18n(c, i18n.MsgFeedbackContentInvalid)
		return
	}
	feedback := model.Feedback{Content: content, Contact: contact}
	if !req.Anonymous {
		feedback.UserId = c.GetInt("id")
		feedback.Username = c.GetString("username")
	}
	if err := model.CreateFeedback(&feedback); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}

// GetOwnFeedback lists the messages the signed-in user signed, with replies.
func GetOwnFeedback(c *gin.Context) {
	items, err := model.ListFeedbackOfUser(c.GetInt("id"), feedbackOwnListLimit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": items})
}

// GetAllFeedback lists every message for administrators.
func GetAllFeedback(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	status, _ := strconv.Atoi(c.Query("status"))
	items, total, err := model.ListFeedback(status, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	open, err := model.CountOpenFeedback()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": pageInfo, "open": open})
}

type feedbackUpdateRequest struct {
	Status int    `json:"status"`
	Reply  string `json:"reply"`
}

// UpdateFeedback lets an administrator reply to a message and mark it done.
func UpdateFeedback(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	var req feedbackUpdateRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	reply := strings.TrimSpace(req.Reply)
	if utf8.RuneCountInString(reply) > feedbackMaxReplyLen ||
		(req.Status != model.FeedbackStatusOpen && req.Status != model.FeedbackStatusResolved) {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	feedback, err := model.UpdateFeedback(id, req.Status, reply)
	if err != nil {
		if model.IsFeedbackNotFound(err) {
			common.ApiErrorI18n(c, i18n.MsgInvalidParams)
			return
		}
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": feedback})
}
