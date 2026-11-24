package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func writeLegalError(c *gin.Context, err error) {
	if errors.Is(err, model.ErrLegalConsentRequired) || errors.Is(err, model.ErrLegalVersionChanged) {
		c.JSON(http.StatusConflict, gin.H{"success": false, "code": "LEGAL_CONSENT_REQUIRED", "message": err.Error()})
		return
	}
	common.ApiError(c, err)
}

func GetLegalVersion(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	var version *model.LegalVersion
	var err error
	if raw := c.Param("version"); raw != "" {
		id, parseErr := strconv.ParseInt(raw, 10, 64)
		if parseErr != nil || id <= 0 {
			c.Status(http.StatusBadRequest)
			return
		}
		version = &model.LegalVersion{}
		err = model.DB.First(version, id).Error
	} else {
		version, err = model.CurrentLegalVersion(model.DB, false)
	}
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.Status(http.StatusNotFound)
			return
		}
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, version)
}

func GetLegalConsent(c *gin.Context) {
	needed, err := model.NeedsLegalConsent(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var records []model.LegalConsent
	if err := model.DB.Where("user_id = ?", c.GetInt("id")).Order("id DESC").Find(&records).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"required": needed, "records": records})
}

func AcceptLegalConsent(c *gin.Context) {
	// API keys and PATs must not record consent on behalf of a person. Dashboard
	// bearer authentication does not accept the refresh cookie on this endpoint.
	identity, ok := middleware.GetSessionAuthIdentity(c)
	if !ok {
		writeSecurityOperationError(c, service.ErrAuthTokenInvalid)
		return
	}
	var acceptance model.LegalAcceptance
	if err := common.DecodeJson(c.Request.Body, &acceptance); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	if !acceptance.Accepted {
		writeLegalError(c, model.ErrLegalConsentRequired)
		return
	}
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := model.ValidateAuthSessionWithTx(tx, identity); err != nil {
			return err
		}
		return model.RecordLegalConsentWithTx(tx, identity.UserID, &acceptance)
	})
	if err != nil {
		writeLegalError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func PublishLegal(c *gin.Context) {
	var request struct {
		UserAgreement   *string `json:"user_agreement"`
		PrivacyPolicy   *string `json:"privacy_policy"`
		UserAgreementEn *string `json:"user_agreement_en"`
		PrivacyPolicyEn *string `json:"privacy_policy_en"`
		Material        *bool   `json:"material"`
		ExpectedVersion *int64  `json:"expected_version"`
	}
	if err := common.DecodeJson(c.Request.Body, &request); err != nil || request.Material == nil || request.ExpectedVersion == nil || *request.ExpectedVersion < 0 {
		c.Status(http.StatusBadRequest)
		return
	}
	// An omitted document keeps what is already published, so a translation can
	// be added without resending the original text.
	documents := map[string]string{}
	if request.UserAgreement != nil {
		documents["legal.user_agreement"] = *request.UserAgreement
	}
	if request.PrivacyPolicy != nil {
		documents["legal.privacy_policy"] = *request.PrivacyPolicy
	}
	if request.UserAgreementEn != nil {
		documents["legal.user_agreement_en"] = *request.UserAgreementEn
	}
	if request.PrivacyPolicyEn != nil {
		documents["legal.privacy_policy_en"] = *request.PrivacyPolicyEn
	}
	version, err := model.PublishLegalVersion(documents, *request.Material, c.GetInt("id"), *request.ExpectedVersion)
	if err != nil {
		writeLegalError(c, err)
		return
	}
	common.ApiSuccess(c, version)
}
