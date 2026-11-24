package controller

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"math/big"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const rewardDeviceCookie = "registration_device"
const registrationProofCookie = "registration_proof"

func RegistrationRewardDevice(c *gin.Context) {
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		common.ApiError(c, errors.New("Unable to prepare registration"))
		return
	}
	// Keep the existing valid cookie so reloading never rotates the signal.
	risk := registrationRisk(c)
	if risk.DeviceHash == "" {
		value := base64.RawURLEncoding.EncodeToString(token)
		value += "." + common.GenerateHMACWithKey([]byte("reward-device:"+common.CryptoSecret), value)
		c.SetSameSite(http.SameSiteLaxMode)
		c.SetCookie(rewardDeviceCookie, value, 30*24*60*60, "/", "", common.SessionCookieSecure || c.Request.TLS != nil || strings.HasPrefix(system_setting.ServerAddress, "https://"), true)
		unsigned, _, _ := strings.Cut(value, ".")
		risk.DeviceHash = common.GenerateHMACWithKey([]byte("reward-device-signal:"+common.CryptoSecret), unsigned)
	}
	reason, err := model.RegistrationRiskReason(risk, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	_, proofErr := model.RegistrationProofWithTx(model.DB, risk, time.Now())
	common.ApiSuccess(c, gin.H{"required": reason != "", "verified": proofErr == nil, "available": geeTestAvailable()})
}

func registrationRisk(c *gin.Context) *model.RegistrationRisk {
	risk := &model.RegistrationRisk{}
	if ip := net.ParseIP(c.ClientIP()); ip != nil {
		risk.IPHash = common.GenerateHMACWithKey([]byte("reward-ip:"+common.CryptoSecret), ip.String())
	}
	cookie, _ := c.Cookie(rewardDeviceCookie)
	value, signature, ok := strings.Cut(cookie, ".")
	raw, err := base64.RawURLEncoding.DecodeString(value)
	expected := common.GenerateHMACWithKey([]byte("reward-device:"+common.CryptoSecret), value)
	if ok && err == nil && len(raw) == 32 && subtle.ConstantTimeCompare([]byte(signature), []byte(expected)) == 1 {
		risk.DeviceHash = common.GenerateHMACWithKey([]byte("reward-device-signal:"+common.CryptoSecret), value)
	}
	risk.ProofToken, _ = c.Cookie(registrationProofCookie)
	return risk
}

func GetRegistrationReward(c *gin.Context) {
	var reward model.RegistrationReward
	err := model.DB.First(&reward, c.GetInt("id")).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"exists": err == nil, "required": reward.Reason != "" && reward.VerifiedAt == 0, "verified": reward.VerifiedAt > 0, "issued": reward.IssuedAt > 0})
}

func clearRegistrationProof(c *gin.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(registrationProofCookie, "", -1, "/", "", common.SessionCookieSecure || c.Request.TLS != nil || strings.HasPrefix(system_setting.ServerAddress, "https://"), true)
}

func SendRegistrationRewardCode(c *gin.Context) {
	succeeded := false
	defer func() { auditRegistrationVerification(c, "email_code", succeeded) }()
	var request struct {
		Email   string        `json:"email"`
		Captcha *geeTestProof `json:"captcha"`
	}
	if common.DecodeJson(c.Request.Body, &request) != nil || !verifyGeeTest(c, request.Captcha, "registration_human") {
		writeSecurityOperationError(c, model.ErrRewardVerification)
		return
	}
	email, err := service.ValidateAccountEmail(request.Email)
	if err != nil {
		writeSecurityOperationError(c, err)
		return
	}
	// Check availability only after the recipient proves ownership, so this
	// anonymous endpoint does not reveal which addresses already have accounts.
	number, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		writeSecurityOperationError(c, model.ErrRewardVerification)
		return
	}
	code := fmt.Sprintf("%06d", number.Int64())
	token, err := model.StartRegistrationVerification(registrationRisk(c), email, code, time.Now())
	if err != nil {
		writeSecurityOperationError(c, err)
		return
	}
	if err := common.SendEmail("Registration verification", email, fmt.Sprintf("<p>Your registration verification code: <strong>%s</strong></p><p>Valid for 10 minutes. Ignore this email if you did not request it.</p>", code)); err != nil {
		_, _ = model.ConsumeAuthFlow(token, model.AuthFlowMatch{Purpose: "registration_verification"})
		writeSecurityOperationError(c, service.ErrEmailBindingDelivery)
		return
	}
	succeeded = true
	common.ApiSuccess(c, gin.H{"flow_token": token})
}

func VerifyRegistrationReward(c *gin.Context) {
	succeeded := false
	defer func() { auditRegistrationVerification(c, "verify", succeeded) }()
	var request struct {
		FlowToken string `json:"flow_token"`
		Code      string `json:"code"`
	}
	if common.DecodeJson(c.Request.Body, &request) != nil || len(request.FlowToken) > 128 || len(request.Code) != 6 {
		writeSecurityOperationError(c, model.ErrRewardVerification)
		return
	}
	token, err := model.CompleteRegistrationVerification(registrationRisk(c), request.FlowToken, request.Code, time.Now())
	if err != nil {
		writeSecurityOperationError(c, err)
		return
	}
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(registrationProofCookie, token, 10*60, "/", "", common.SessionCookieSecure || c.Request.TLS != nil || strings.HasPrefix(system_setting.ServerAddress, "https://"), true)
	succeeded = true
	common.ApiSuccess(c, nil)
}

// RetryRegistrationReward recovers failed issuance without reusing a proof or
// requiring another challenge after this registration has been verified.
func RetryRegistrationReward(c *gin.Context) {
	if err := model.ReleaseRegistrationReward(c.GetInt("id"), time.Now()); err != nil {
		common.ApiError(c, err)
		return
	}
	if _, err := model.IssueReferralReward(c.GetInt("id"), time.Now()); err != nil && !errors.Is(err, model.ErrReferralRewardNotFound) {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// ListRegistrationRewards omits stored signals and challenge material while
// retaining the trigger, verification, and wallet/coupon issuance results.
func ListRegistrationRewards(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	page = max(1, min(100000, page))
	var rewards []model.RegistrationReward
	query := model.DB.Model(&model.RegistrationReward{}).Where("reason <> ?", "")
	var total int64
	if err := query.Count(&total).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	if err := query.Order("created_at DESC").Offset((page - 1) * 20).Limit(20).Find(&rewards).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": rewards, "total": total})
}

// Anonymous verification events deliberately contain neither IPs nor signal
// digests. Identifying signals stay in the short-lived risk/flow storage only.
func auditRegistrationVerification(c *gin.Context, stage string, success bool) {
	reason, err := model.RegistrationRiskReason(registrationRisk(c), time.Now())
	if err != nil {
		reason = "risk_unavailable"
	}
	model.RecordOperationAuditLog(0, common.RoleCommonUser, "Registration verification", "", "registration.verification", map[string]any{"stage": stage, "success": success, "reason": reason}, nil, &model.AuditRequestInfo{Method: c.Request.Method, Route: c.FullPath(), Path: c.FullPath(), Status: c.Writer.Status(), Success: success}, nil)
}
