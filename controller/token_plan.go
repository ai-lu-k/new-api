package controller

import (
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetTokenPlan(c *gin.Context) {
	status, err := model.GetTokenPlanStatus(c.GetInt("id"), time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, status)
}

func CreateTokenPlan(c *gin.Context) {
	account, err := model.EnsureTokenPlanAccount(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordUserSecurityAudit(c, c.GetInt("id"), "token_plan.create", map[string]any{"token_id": account.TokenId})
	GetTokenPlan(c)
}

func ReadTokenPlanKey(c *gin.Context) {
	if middleware.RequireSecurityProof(c, service.VerificationOperation{Scope: service.VerificationScopeTokenPlanKeyRead}) == nil {
		return
	}
	status, err := model.GetTokenPlanStatus(c.GetInt("id"), time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	key, err := model.ReadTokenPlanCredential(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordUserSecurityAudit(c, c.GetInt("id"), "token_plan.key.read", map[string]any{"token_id": status.TokenId})
	common.ApiSuccess(c, gin.H{"key": key})
}

func ResetTokenPlanKey(c *gin.Context) {
	if middleware.RequireSecurityProof(c, service.VerificationOperation{Scope: service.VerificationScopeTokenPlanKeyRotate}) == nil {
		return
	}
	token, err := model.RotateTokenPlanKey(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordUserSecurityAudit(c, c.GetInt("id"), "token_plan.key.rotate", map[string]any{"token_id": token.Id})
	common.ApiSuccess(c, gin.H{"key": token.GetFullKey()})
}

func UpdateTokenPlanSettings(c *gin.Context) {
	var request struct {
		WalletFallback  *bool `json:"wallet_fallback"`
		AutoResetCoupon *bool `json:"auto_reset_coupon"`
	}
	if err := common.DecodeJson(c.Request.Body, &request); err != nil || (request.WalletFallback == nil && request.AutoResetCoupon == nil) {
		c.JSON(400, gin.H{"success": false, "message": "wallet_fallback or auto_reset_coupon must be a boolean"})
		return
	}
	if middleware.RequireSecurityProof(c, service.VerificationOperation{Scope: service.VerificationScopeTokenPlanSettings}) == nil {
		return
	}
	settings := model.TokenPlanSettings{WalletFallback: request.WalletFallback, AutoResetCoupon: request.AutoResetCoupon}
	if err := model.UpdateTokenPlanSettings(c.GetInt("id"), settings); err != nil {
		common.ApiError(c, err)
		return
	}
	audit := map[string]any{}
	if request.WalletFallback != nil {
		audit["wallet_fallback"] = *request.WalletFallback
	}
	if request.AutoResetCoupon != nil {
		audit["auto_reset_coupon"] = *request.AutoResetCoupon
	}
	recordUserSecurityAudit(c, c.GetInt("id"), "token_plan.settings", audit)
	GetTokenPlan(c)
}
