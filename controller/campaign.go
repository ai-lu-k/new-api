package controller

import (
	"mime"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

const campaignGuestCookieName = "campaign_guest"

const campaignGuestCookieMaxAge = 180 * 24 * 60 * 60

// GetCampaignFile serves one published campaign payload. The route is only
// reachable while the campaign is live (see middleware.CampaignEnabled) and the
// campaign definition owns the bytes, so archived material has no URL at all.
func GetCampaignFile(c *gin.Context) {
	name := c.Param("name")
	data, err := model.ReadCampaignFile(name)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	contentType := mime.TypeByExtension(path.Ext(name))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.Header("Cache-Control", "public, max-age=3600")
	c.Data(http.StatusOK, contentType, data)
}

func GetCampaignStatus(c *gin.Context) {
	status, err := model.GetCampaignStatus(c.GetInt("id"), campaignGuestToken(c), time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, status)
}

func SubmitCampaignAnswer(c *gin.Context) {
	var request struct {
		ChallengeId string `json:"challenge_id"`
		Answer      string `json:"answer"`
	}
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorMsg(c, "请求格式不正确")
		return
	}
	userId := c.GetInt("id")
	guestToken := campaignGuestToken(c)
	if userId <= 0 && guestToken == "" {
		token, err := model.NewCampaignGuestToken()
		if err != nil {
			common.ApiError(c, err)
			return
		}
		guestToken = token
	}
	result, err := model.SubmitCampaignAnswer(userId, guestToken, request.ChallengeId, request.Answer, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if userId <= 0 && guestToken != "" {
		campaignWriteGuestCookie(c, guestToken)
	}
	common.ApiSuccess(c, result)
}

// ClaimCampaignGuestProgress binds the visitor's event progress to the signed-in
// account and settles the rewards that were earned before signing in.
func ClaimCampaignGuestProgress(c *gin.Context) {
	userId := c.GetInt("id")
	if userId <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "请先登录"})
		return
	}
	status, err := model.ClaimCampaignGuest(userId, campaignGuestToken(c), time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	campaignClearGuestCookie(c)
	common.ApiSuccess(c, status)
}

func ClaimCampaignShare(c *gin.Context) {
	userId := c.GetInt("id")
	if userId <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "请先登录"})
		return
	}
	result, err := model.ClaimCampaignShare(userId, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

// SettleCampaignRankingRewards is the explicit administrator action that pays the
// final top-three prizes; it never runs on a timer.
func SettleCampaignRankingRewards(c *gin.Context) {
	settlement, err := model.SettleCampaignRanking(time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, settlement)
}

func campaignGuestToken(c *gin.Context) string {
	token, err := c.Request.Cookie(campaignGuestCookieName)
	if err != nil {
		return ""
	}
	value := strings.TrimSpace(token.Value)
	if len(value) != 32 {
		return ""
	}
	for _, char := range value {
		if !strings.ContainsRune("0123456789abcdef", char) {
			return ""
		}
	}
	return value
}

func campaignWriteGuestCookie(c *gin.Context, token string) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     campaignGuestCookieName,
		Value:    token,
		Path:     "/api/campaign",
		MaxAge:   campaignGuestCookieMaxAge,
		Expires:  time.Now().Add(campaignGuestCookieMaxAge * time.Second),
		HttpOnly: true,
		Secure:   common.SessionCookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func campaignClearGuestCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     campaignGuestCookieName,
		Value:    "",
		Path:     "/api/campaign",
		MaxAge:   -1,
		Expires:  time.Unix(1, 0),
		HttpOnly: true,
		Secure:   common.SessionCookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}
