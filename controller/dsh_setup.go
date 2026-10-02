package controller

import (
	"fmt"
	"maps"
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

// dshSetupModels lists what a key in these groups can call: every priced model
// that one of the groups carries.
func dshSetupModels(groups []string) []dshsetup.GatewayModel {
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

// GetDshSetupModels tells the quick-start guides which models to offer: the
// catalogue as this account would reach it. Nothing here is private: the same
// model names are on the public pricing page.
func GetDshSetupModels(c *gin.Context) {
	userGroup := ""
	if userId := c.GetInt("id"); userId > 0 {
		group, err := getTokenRequestUserGroup(c)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		userGroup = group
	}
	setting := operation_setting.GetDshSetupSetting()
	groups := service.GetUserAutoGroup(userGroup)
	autoGroup := service.GroupInUserUsableGroups(userGroup, "auto") && len(groups) > 0
	if !autoGroup {
		// No single key reaches everything, so show what the account could
		// reach with a key in any group it may use.
		groups = slices.Collect(maps.Keys(service.GetUserUsableGroups(userGroup)))
	}
	common.ApiSuccess(c, gin.H{
		"auto_group":    autoGroup,
		"default_model": setting.DefaultModel,
		"models":        dshsetup.ClientModels(*setting, dshSetupModels(groups)),
	})
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
	if _, err := dshsetup.BuildPayload(*setting, system_setting.ServerAddress, "sk-placeholder", dshSetupModels(service.GetUserAutoGroup(userGroup))); err != nil {
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
	payload, err := dshsetup.BuildPayload(*setting, system_setting.ServerAddress, "sk-"+token.Key, dshSetupModels(service.GetUserAutoGroup(user.Group)))
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
