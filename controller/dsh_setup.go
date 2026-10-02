package controller

import (
	"fmt"
	"net/http"
	"slices"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/service/dshsetup"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-gonic/gin"
)

// The setup hands out one key per account under a fixed name, so that the user
// can find and revoke it among their API keys.
const dshSetupTokenName = "DSH"

// dshSetupModels lists what an Auto-group key of this user can call: every
// priced model that one of the user's Auto groups carries.
func dshSetupModels(userGroup string) []dshsetup.GatewayModel {
	groups := service.GetUserAutoGroup(userGroup)
	models := make([]dshsetup.GatewayModel, 0)
	for _, pricing := range model.GetPricing() {
		reachable := slices.ContainsFunc(pricing.EnableGroup, func(group string) bool {
			return slices.Contains(groups, group)
		})
		if reachable {
			models = append(models, dshsetup.GatewayModel{ID: pricing.ModelName, Endpoints: pricing.SupportedEndpointTypes})
		}
	}
	return models
}

// GetDshSetupScript serves the setup script. It holds no secret and is the
// same for every user.
func GetDshSetupScript(c *gin.Context) {
	shell := map[string]string{"setup.sh": "sh", "setup.ps1": "ps1"}[c.Param("script")]
	if shell == "" || !operation_setting.GetDshSetupSetting().Enabled {
		c.Status(http.StatusNotFound)
		return
	}
	script, err := dshsetup.Script(shell, system_setting.ServerAddress, common.SystemName)
	if err != nil {
		logger.LogError(c.Request.Context(), err.Error())
		c.Status(http.StatusInternalServerError)
		return
	}
	c.Header("Cache-Control", "no-cache")
	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(script))
}

// CreateDshSetupCode prepares the account's DSH key and returns a one-time
// code the setup script can exchange for it.
func CreateDshSetupCode(c *gin.Context) {
	setting := operation_setting.GetDshSetupSetting()
	if !setting.Enabled {
		common.ApiErrorI18n(c, i18n.MsgDshSetupDisabled)
		return
	}
	userId := c.GetInt("id")
	userGroup, err := getTokenRequestUserGroup(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !service.GroupInUserUsableGroups(userGroup, "auto") || len(service.GetUserAutoGroup(userGroup)) == 0 {
		common.ApiErrorI18n(c, i18n.MsgDshSetupAutoGroupUnavailable)
		return
	}
	// A code is only worth handing out if redeeming it will produce something.
	if _, err := dshsetup.BuildPayload(*setting, system_setting.ServerAddress, "sk-placeholder", dshSetupModels(userGroup)); err != nil {
		logger.LogError(c.Request.Context(), err.Error())
		common.ApiErrorI18n(c, i18n.MsgDshSetupNoModels)
		return
	}

	token, err := model.GetUnrestrictedUserToken(userId, dshSetupTokenName, "auto")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	created := token == nil
	if created {
		count, err := model.CountUserTokens(userId)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		if int(count) >= operation_setting.GetMaxUserTokens() {
			common.ApiErrorI18n(c, i18n.MsgDshSetupTokenLimit)
			return
		}
		key, err := common.GenerateKey()
		if err != nil {
			common.ApiErrorI18n(c, i18n.MsgTokenGenerateFailed)
			return
		}
		token = &model.Token{
			UserId:          userId,
			Name:            dshSetupTokenName,
			Key:             key,
			CreatedTime:     common.GetTimestamp(),
			AccessedTime:    common.GetTimestamp(),
			ExpiredTime:     -1,
			UnlimitedQuota:  true,
			Group:           "auto",
			CrossGroupRetry: true,
		}
		if err := token.Insert(); err != nil {
			common.ApiError(c, err)
			return
		}
	}

	code, expires, err := dshsetup.Codes.Issue(dshsetup.Grant{UserID: userId, TokenID: token.Id})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordDshSetupAudit(c, userId, c.GetString("username"), c.GetInt("role"), "dsh_setup.code_issue", "DSH setup code issued",
		model.AuditFields{"token_id": token.Id, "token_created": created})
	common.ApiSuccess(c, gin.H{
		"code":       code,
		"expires_at": expires.Unix(),
	})
}

// RedeemDshSetupCode exchanges a setup code for the configuration. The code
// travels in a header, never in the URL, and every way it can be wrong gets the
// same answer.
func RedeemDshSetupCode(c *gin.Context) {
	setting := operation_setting.GetDshSetupSetting()
	refuse := func(reason string) {
		logger.LogWarn(c.Request.Context(), "dsh setup: redeem refused: "+reason)
		c.String(http.StatusNotFound, "setup code is invalid, used or expired\n")
	}
	if !setting.Enabled {
		refuse("feature disabled")
		return
	}
	grant, ok := dshsetup.Codes.Redeem(c.GetHeader("X-Setup-Code"))
	if !ok {
		refuse("unknown, used or expired code")
		return
	}
	user, err := model.GetUserById(grant.UserID, false)
	if err != nil || user.Status != common.UserStatusEnabled {
		refuse(fmt.Sprintf("user %d is not available", grant.UserID))
		return
	}
	token, err := model.GetTokenByIds(grant.TokenID, grant.UserID)
	if err != nil || token.Status != common.TokenStatusEnabled {
		refuse(fmt.Sprintf("token %d of user %d is not available", grant.TokenID, grant.UserID))
		return
	}
	payload, err := dshsetup.BuildPayload(*setting, system_setting.ServerAddress, "sk-"+token.Key, dshSetupModels(user.Group))
	if err != nil {
		logger.LogError(c.Request.Context(), err.Error())
		c.String(http.StatusInternalServerError, "setup is not available right now\n")
		return
	}
	recordDshSetupAudit(c, user.Id, user.Username, user.Role, "dsh_setup.redeem", "DSH setup code redeemed",
		model.AuditFields{"token_id": token.Id})
	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(payload))
}

func recordDshSetupAudit(c *gin.Context, userId int, username string, role int, action string, content string, params model.AuditFields) {
	model.RecordAuditLog(c, model.AuditLog{
		UserId: userId, Username: username, ActorRole: role,
		Category: model.AuditCategorySecurity, Action: action, Content: content,
		Status: http.StatusOK, Success: true,
		Other: model.AuditOther{Op: &model.AuditOperation{Action: action, Params: params}},
	})
}
