package controller

import (
	"errors"
	"fmt"
	"maps"
	"net/http"
	"slices"
	"sync"

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

// dshSetupRefusal says why an account cannot be set up right now, as a message
// key, or "" when it can. The key itself is only prepared when a code is
// redeemed, so this checks that one exists or that there is room for one.
func dshSetupRefusal(c *gin.Context, setting *operation_setting.DshSetupSetting, userId int, userGroup string) (string, error) {
	groups := service.GetUserAutoGroup(userGroup)
	if !service.GroupInUserUsableGroups(userGroup, "auto") || len(groups) == 0 {
		return i18n.MsgDshSetupAutoGroupUnavailable, nil
	}
	// A code is only worth handing out if redeeming it will produce something.
	if _, err := dshsetup.BuildPayload(*setting, system_setting.ServerAddress, "sk-placeholder", dshSetupModels(groups)); err != nil {
		logger.LogError(c.Request.Context(), err.Error())
		return i18n.MsgDshSetupNoModels, nil
	}
	token, err := model.GetUnrestrictedUserToken(userId, dshSetupTokenName, "auto")
	if err != nil {
		return "", err
	}
	if token == nil {
		count, err := model.CountUserTokens(userId)
		if err != nil {
			return "", err
		}
		if int(count) >= operation_setting.GetMaxUserTokens() {
			return i18n.MsgDshSetupTokenLimit, nil
		}
	}
	return "", nil
}

// CreateDshSetupCode returns a one-time code the setup script can exchange for
// the account's configuration. The setup page asks for one each time it is
// opened, so this neither creates a key nor leaves a record: both happen when
// the code is redeemed.
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
	refusal, err := dshSetupRefusal(c, setting, userId, userGroup)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if refusal != "" {
		common.ApiErrorI18n(c, refusal)
		return
	}

	code, expires, err := dshsetup.Codes.Issue(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"code":       code,
		"expires_at": expires.Unix(),
	})
}

var errDshSetupTokenLimit = errors.New("dsh setup: the account has no room for another API key")

// One setup at a time, so that two machines set up for the same account at the
// same moment end up sharing a key instead of each creating one.
var dshSetupTokenMu sync.Mutex

// ensureDshSetupToken returns the account's DSH key, creating it on first use.
func ensureDshSetupToken(userId int) (token *model.Token, created bool, err error) {
	dshSetupTokenMu.Lock()
	defer dshSetupTokenMu.Unlock()

	token, err = model.GetUnrestrictedUserToken(userId, dshSetupTokenName, "auto")
	if err != nil || token != nil {
		return token, false, err
	}
	count, err := model.CountUserTokens(userId)
	if err != nil {
		return nil, false, err
	}
	if int(count) >= operation_setting.GetMaxUserTokens() {
		return nil, false, errDshSetupTokenLimit
	}
	key, err := common.GenerateKey()
	if err != nil {
		return nil, false, err
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
		return nil, false, err
	}
	return token, true, nil
}

// RedeemDshSetupCode exchanges a setup code for the configuration, preparing
// the account's DSH key if it has none yet. The code travels in a header, never
// in the URL, and every way it can be wrong gets the same answer.
func RedeemDshSetupCode(c *gin.Context) {
	setting := operation_setting.GetDshSetupSetting()
	refuse := func(reason string) {
		logger.LogWarn(c.Request.Context(), "dsh setup: redeem refused: "+reason)
		c.String(http.StatusNotFound, "setup code is invalid, used or expired\n")
	}
	unavailable := func(reason string) {
		logger.LogError(c.Request.Context(), "dsh setup: redeem failed: "+reason)
		c.String(http.StatusInternalServerError, "setup is not available right now\n")
	}
	if !setting.Enabled {
		refuse("feature disabled")
		return
	}
	userId, ok := dshsetup.Codes.Redeem(c.GetHeader("X-Setup-Code"))
	if !ok {
		refuse("unknown, used or expired code")
		return
	}
	user, err := model.GetUserById(userId, false)
	if err != nil || user.Status != common.UserStatusEnabled {
		refuse(fmt.Sprintf("user %d is not available", userId))
		return
	}
	// Nothing is created for an account that could not use it.
	groups := service.GetUserAutoGroup(user.Group)
	if !service.GroupInUserUsableGroups(user.Group, "auto") || len(groups) == 0 {
		unavailable(fmt.Sprintf("user %d cannot use the Auto group", user.Id))
		return
	}
	models := dshSetupModels(groups)
	if _, err := dshsetup.BuildPayload(*setting, system_setting.ServerAddress, "sk-placeholder", models); err != nil {
		unavailable(err.Error())
		return
	}
	token, created, err := ensureDshSetupToken(user.Id)
	if errors.Is(err, errDshSetupTokenLimit) {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("dsh setup: user %d has no room for another API key", user.Id))
		c.String(http.StatusConflict, "the account has reached its API key limit\n")
		return
	}
	if err != nil {
		unavailable(err.Error())
		return
	}
	payload, err := dshsetup.BuildPayload(*setting, system_setting.ServerAddress, "sk-"+token.Key, models)
	if err != nil {
		unavailable(err.Error())
		return
	}
	recordDshSetupAudit(c, user.Id, user.Username, user.Role, "dsh_setup.redeem", "DSH setup code redeemed",
		model.AuditFields{"token_id": token.Id, "token_created": created})
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
