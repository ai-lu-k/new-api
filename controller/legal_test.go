package controller

import (
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupLegalTest(t *testing.T) (*model.User, service.AuthIdentity) {
	t.Helper()
	// Initialize the same driver-specific column conventions as application startup.
	previousDB, previousMaster, previousPath := model.DB, common.IsMasterNode, common.SQLitePath
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	dialect := os.Getenv("TEST_SECURITY_DIALECT")
	t.Setenv("SQL_DSN", os.Getenv("TEST_"+strings.ToUpper(dialect)+"_DSN"))
	t.Setenv("LOG_SQL_DSN", "")
	common.IsMasterNode, common.SQLitePath = false, t.TempDir()+"/columns.db"
	require.NoError(t, model.InitDB())
	connection, err := model.DB.DB()
	require.NoError(t, err)
	require.NoError(t, connection.Close())
	model.DB, common.IsMasterNode, common.SQLitePath = previousDB, previousMaster, previousPath
	common.SetDatabaseTypes(previousMain, previousLog)
	user, identity := setupSecurityEnrollmentTest(t)
	previousSettings := *system_setting.GetLegalSettings()
	common.OptionMapRWMutex.Lock()
	previousAgreement, previousPrivacy := common.OptionMap["legal.user_agreement"], common.OptionMap["legal.privacy_policy"]
	if common.OptionMap == nil {
		common.OptionMap = map[string]string{}
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		*system_setting.GetLegalSettings() = previousSettings
		common.OptionMapRWMutex.Lock()
		common.OptionMap["legal.user_agreement"], common.OptionMap["legal.privacy_policy"] = previousAgreement, previousPrivacy
		common.OptionMapRWMutex.Unlock()
	})
	require.NoError(t, model.DB.AutoMigrate(&model.LegalVersion{}, &model.LegalConsent{}))
	require.NoError(t, model.InitializeLegalVersions())
	return user, identity
}

func TestLegalEnglishTranslationServesByReaderLanguage(t *testing.T) {
	user, _ := setupLegalTest(t)
	first, err := model.PublishLegalVersion(map[string]string{
		"legal.user_agreement": "条款 v1",
		"legal.privacy_policy": "隐私 v1",
	}, false, user.Id, 0)
	require.NoError(t, err)
	assert.Equal(t, "条款 v1", first.UserAgreementText("en"),
		"a revision without a translation serves the published text to everyone")

	translated, err := model.PublishLegalVersion(map[string]string{
		"legal.user_agreement":    "条款 v1",
		"legal.privacy_policy":    "隐私 v1",
		"legal.user_agreement_en": "Terms v1",
		"legal.privacy_policy_en": "Privacy v1",
	}, false, user.Id, first.Id)
	require.NoError(t, err)
	assert.NotEqual(t, first.Digest, translated.Digest,
		"adding a translation is its own revision")
	assert.Equal(t, "Terms v1", translated.UserAgreementText("en"))
	assert.Equal(t, "Privacy v1", translated.PrivacyPolicyText("en-US"))
	assert.Equal(t, "条款 v1", translated.UserAgreementText("zh-CN"))
	assert.Equal(t, "条款 v1", translated.UserAgreementText("fr"))

	// Republishing only the original documents keeps the translation in place.
	unchanged, err := model.PublishLegalVersion(map[string]string{
		"legal.user_agreement": "条款 v1",
	}, false, user.Id, translated.Id)
	require.NoError(t, err)
	assert.Equal(t, translated.Id, unchanged.Id)
	assert.Equal(t, "Terms v1", unchanged.UserAgreementText("en"))
}

func TestLegalPublicationAndConsentLifecycle(t *testing.T) {
	user, identity := setupLegalTest(t)
	required, err := model.NeedsLegalConsent(user.Id)
	require.NoError(t, err)
	assert.False(t, required)
	first, err := model.PublishLegalVersion(map[string]string{"legal.user_agreement": "Terms v1", "legal.privacy_policy": "Privacy v1"}, true, user.Id, 0)
	require.NoError(t, err)
	assert.Equal(t, first.Id, first.RequiredVersion)
	assert.Len(t, first.Digest, 64)
	required, err = model.NeedsLegalConsent(user.Id)
	require.NoError(t, err)
	assert.True(t, required, "old users have no fabricated consent")
	for _, body := range []string{`{}`, fmt.Sprintf(`{"accepted":false,"version_id":%d}`, first.Id), fmt.Sprintf(`{"accepted":true,"version_id":%d}`, first.Id+1)} {
		response := securityEnrollmentRequest("POST", "/api/user/legal-consent", body, "", identity, AcceptLegalConsent)
		assert.Equal(t, http.StatusConflict, response.Code, response.Body.String())
	}
	body := fmt.Sprintf(`{"accepted":true,"version_id":%d}`, first.Id)
	response := securityEnrollmentRequest("POST", "/api/user/legal-consent", body, "", service.AuthIdentity{UserID: user.Id}, AcceptLegalConsent)
	assert.NotEqual(t, http.StatusOK, response.Code, "PAT-like identity cannot provide person consent")
	var activeSession model.UserSession
	require.NoError(t, model.DB.Where("sid = ?", identity.SessionID).First(&activeSession).Error)
	for _, change := range []map[string]any{
		{"expires_at": time.Now().Add(-time.Minute).Unix()},
		{"status": model.UserSessionStatusRevoked},
		{"version": activeSession.Version + 1},
	} {
		require.NoError(t, model.DB.Model(&model.UserSession{}).Where("sid = ?", identity.SessionID).Updates(change).Error)
		denied := securityEnrollmentRequest("POST", "/api/user/legal-consent", body, "", identity, AcceptLegalConsent)
		var result struct {
			Success bool `json:"success"`
		}
		require.NoError(t, common.Unmarshal(denied.Body.Bytes(), &result))
		assert.False(t, result.Success, "expired, revoked or superseded sessions cannot record consent")
		require.NoError(t, model.DB.Model(&model.UserSession{}).Where("sid = ?", identity.SessionID).Updates(map[string]any{"expires_at": activeSession.ExpiresAt, "status": activeSession.Status, "version": activeSession.Version}).Error)
	}
	response = securityEnrollmentRequest("POST", "/api/user/legal-consent", body, "", identity, AcceptLegalConsent)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	var consent model.LegalConsent
	require.NoError(t, model.DB.Where("user_id = ?", user.Id).First(&consent).Error)
	assert.InDelta(t, time.Now().Unix(), consent.AcceptedAt, 5)
	response = securityEnrollmentRequest("POST", "/api/user/legal-consent", body, "", identity, AcceptLegalConsent)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	var records []model.LegalConsent
	require.NoError(t, model.DB.Find(&records).Error)
	require.Len(t, records, 1)
	assert.Equal(t, consent.AcceptedAt, records[0].AcceptedAt)
	minor, err := model.PublishLegalVersion(map[string]string{"legal.user_agreement": "Terms spelling fix"}, false, user.Id, first.Id)
	require.NoError(t, err)
	assert.Equal(t, first.RequiredVersion, minor.RequiredVersion)
	required, err = model.NeedsLegalConsent(user.Id)
	require.NoError(t, err)
	assert.False(t, required, "minor edits preserve existing acceptance")
	_, err = model.PublishLegalVersion(map[string]string{"legal.user_agreement": "stale editor"}, true, user.Id, first.Id)
	require.ErrorIs(t, err, model.ErrLegalVersionChanged)
	response = securityEnrollmentRequest("POST", "/api/user/legal-consent", body, "", identity, AcceptLegalConsent)
	assert.Equal(t, http.StatusConflict, response.Code, "new acceptances must name the exact displayed revision")
	major, err := model.PublishLegalVersion(map[string]string{"legal.user_agreement": "Materially new terms"}, true, user.Id, minor.Id)
	require.NoError(t, err)
	required, err = model.NeedsLegalConsent(user.Id)
	require.NoError(t, err)
	assert.True(t, required)
	var historical model.LegalVersion
	require.NoError(t, model.DB.First(&historical, first.Id).Error)
	assert.Equal(t, "Terms v1", historical.UserAgreement)
	assert.Equal(t, first.Digest, historical.Digest)
	require.NoError(t, model.DB.AutoMigrate(&model.LegalVersion{}, &model.LegalConsent{}))
	require.NoError(t, model.InitializeLegalVersions())
	current, err := model.CurrentLegalVersion(model.DB, false)
	require.NoError(t, err)
	assert.Equal(t, major.Id, current.Id, "repeated startup preserves publication and consent history")
	require.NoError(t, model.DB.First(&consent, consent.Id).Error)
	assert.Equal(t, first.Id, consent.VersionId)
	require.Error(t, model.UpdateOption("legal.user_agreement", "unversioned overwrite"))
	_, err = model.PublishLegalVersion(map[string]string{"legal.user_agreement": "https://example.test/terms"}, true, user.Id, major.Id)
	require.Error(t, err, "external mutable content cannot prove what was accepted")
}

func TestLegalRegistrationIsAtomic(t *testing.T) {
	_, _ = setupLegalTest(t)
	first, err := model.PublishLegalVersion(map[string]string{"legal.user_agreement": "Terms"}, true, 1, 0)
	require.NoError(t, err)
	previousRegister, previousPasswordRegister, previousVerification := common.RegisterEnabled, common.PasswordRegisterEnabled, common.EmailVerificationEnabled
	common.RegisterEnabled, common.PasswordRegisterEnabled, common.EmailVerificationEnabled = true, true, false
	t.Cleanup(func() {
		common.RegisterEnabled, common.PasswordRegisterEnabled, common.EmailVerificationEnabled = previousRegister, previousPasswordRegister, previousVerification
	})
	for _, test := range []struct {
		name, acceptance string
		allowed          bool
	}{
		{"missing", `null`, false}, {"unchecked", fmt.Sprintf(`{"accepted":false,"version_id":%d}`, first.Id), false},
		{"stale", fmt.Sprintf(`{"accepted":true,"version_id":%d}`, first.Id+1), false},
		{"accepted", fmt.Sprintf(`{"accepted":true,"version_id":%d}`, first.Id), true},
	} {
		t.Run(test.name, func(t *testing.T) {
			username := "legal-" + test.name
			body := fmt.Sprintf(`{"username":%q,"password":"legal-test-password","legal_consent":%s}`, username, test.acceptance)
			response := securityEnrollmentRequest("POST", "/api/user/register", body, "", service.AuthIdentity{}, Register)
			var count int64
			require.NoError(t, model.DB.Model(&model.User{}).Where("username = ?", username).Count(&count).Error)
			if test.allowed {
				require.EqualValues(t, 1, count, response.Body.String())
			} else {
				assert.Zero(t, count, response.Body.String())
				assert.Equal(t, http.StatusConflict, response.Code)
			}
		})
	}
	// Any consent write failure must roll back the new account as well.
	require.NoError(t, model.DB.Callback().Create().Before("gorm:create").Register("legal:fail-consent", func(tx *gorm.DB) {
		if tx.Statement.Table == "legal_consents" {
			tx.AddError(errors.New("consent storage unavailable"))
		}
	}))
	defer model.DB.Callback().Create().Remove("legal:fail-consent")
	body := fmt.Sprintf(`{"username":"legal-failed","password":"legal-test-password","legal_consent":{"accepted":true,"version_id":%d}}`, first.Id)
	securityEnrollmentRequest("POST", "/api/user/register", body, "", service.AuthIdentity{}, Register)
	var count int64
	require.NoError(t, model.DB.Model(&model.User{}).Where("username = ?", "legal-failed").Count(&count).Error)
	assert.Zero(t, count)
}

func TestLegalExistingSessionEnforcementAndRelayExemption(t *testing.T) {
	user, identity := setupLegalTest(t)
	version, err := model.PublishLegalVersion(map[string]string{"legal.user_agreement": "Terms"}, true, user.Id, 0)
	require.NoError(t, err)
	require.NoError(t, model.DB.AutoMigrate(&model.Token{}))
	token := &model.Token{UserId: user.Id, Key: strings.Repeat("l", 48), Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true}
	require.NoError(t, model.DB.Create(token).Error)
	jwt, _, err := service.IssueAccessToken(identity)
	require.NoError(t, err)
	router := gin.New()
	router.GET("/api/probe", middleware.UserAuth(), func(c *gin.Context) { c.Status(http.StatusOK) })
	router.GET("/api/user/self", middleware.UserAuth(), GetSelf)
	router.GET("/api/user/legal-consent", middleware.UserAuth(), GetLegalConsent)
	router.POST("/api/user/legal-consent", middleware.UserAuth(), AcceptLegalConsent)
	router.POST("/v1/probe", middleware.TokenAuth(), func(c *gin.Context) { c.Status(http.StatusOK) })
	router.POST("/mixed/probe", middleware.TokenOrUserAuth(), func(c *gin.Context) { c.Status(http.StatusOK) })
	for _, test := range []struct {
		method, path, bearer string
		status               int
	}{
		{"GET", "/api/probe", jwt, http.StatusForbidden},
		{"GET", "/api/user/legal-consent", jwt, http.StatusOK},
		// Relay credentials and the session-authenticated relay entry point stay
		// usable: consent gates the dashboard that displays the documents only.
		{"POST", "/v1/probe", "sk-" + token.Key, http.StatusOK},
		{"POST", "/mixed/probe", jwt, http.StatusOK},
	} {
		request := httptest.NewRequest(test.method, test.path, nil)
		request.Header.Set("Authorization", "Bearer "+test.bearer)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		assert.Equal(t, test.status, response.Code, response.Body.String())
	}
	// A refresh cookie alone cannot submit consent (CSRF); only a live bearer session can.
	request := httptest.NewRequest("POST", "/api/user/legal-consent", strings.NewReader(fmt.Sprintf(`{"accepted":true,"version_id":%d}`, version.Id)))
	request.AddCookie(&http.Cookie{Name: service.RefreshCookieName, Value: "cookie-only"})
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	assert.Equal(t, http.StatusUnauthorized, response.Code)
	body := fmt.Sprintf(`{"accepted":true,"version_id":%d}`, version.Id)
	request = httptest.NewRequest("POST", "/api/user/legal-consent", strings.NewReader(body))
	request.Header.Set("Authorization", "Bearer "+jwt)
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	for _, test := range []struct{ method, path, bearer string }{{"GET", "/api/probe", jwt}, {"POST", "/v1/probe", "sk-" + token.Key}, {"POST", "/mixed/probe", jwt}} {
		request := httptest.NewRequest(test.method, test.path, nil)
		request.Header.Set("Authorization", "Bearer "+test.bearer)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		assert.Equal(t, http.StatusOK, response.Code, response.Body.String())
	}
}

func TestLegalOAuthCannotCreateWithoutConsent(t *testing.T) {
	_, _ = setupLegalTest(t)
	version, err := model.PublishLegalVersion(map[string]string{"legal.user_agreement": "Terms"}, true, 1, 0)
	require.NoError(t, err)
	previous := common.RegisterEnabled
	common.RegisterEnabled = true
	t.Cleanup(func() { common.RegisterEnabled = previous })
	for _, test := range []struct {
		name     string
		provider oauth.Provider
	}{
		{"builtin", &authFlowTestOAuthProvider{}},
		{"custom", oauth.NewGenericOAuthProvider(&model.CustomOAuthProvider{Id: 99, Name: "Legal custom", Slug: "legal-custom", Enabled: true})},
	} {
		t.Run(test.name, func(t *testing.T) {
			for _, accept := range []bool{false, true} {
				c, _ := gin.CreateTestContext(httptest.NewRecorder())
				c.Request = httptest.NewRequest("GET", "/oauth/callback", nil)
				device := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf("%-32s", test.name)))
				device += "." + common.GenerateHMACWithKey([]byte("reward-device:"+common.CryptoSecret), device)
				c.Request.AddCookie(&http.Cookie{Name: rewardDeviceCookie, Value: device})
				if accept {
					c.Set("legal_acceptance", &model.LegalAcceptance{Accepted: true, VersionId: version.Id})
				}
				username := "legal-oauth-" + test.name
				user, _, err := findOrCreateOAuthUser(c, test.provider, &oauth.OAuthUser{ProviderUserID: username, Username: username}, &oauth.OAuthToken{}, "")
				if !accept {
					require.ErrorIs(t, err, model.ErrLegalConsentRequired)
					require.Nil(t, user)
				} else {
					require.NoError(t, err)
					var consent model.LegalConsent
					require.NoError(t, model.DB.Where("user_id = ?", user.Id).First(&consent).Error)
					assert.Equal(t, version.Id, consent.VersionId)
					if test.name == "custom" {
						var binding model.UserOAuthBinding
						require.NoError(t, model.DB.Where("user_id = ?", user.Id).First(&binding).Error)
						assert.Equal(t, username, binding.ProviderUserId)
					}
				}
			}
		})
	}

}

// Released user schema copied from v1.0.0-rc.44 (model/user.go blob
// bb83bdb8251e168cd100dc3f787efbc336fc6c38); only the Go type name differs.
type releasedLegalUser44 struct {
	Id                   int                        `json:"id"`
	Username             string                     `json:"username" gorm:"unique;index" validate:"max=20"`
	Password             string                     `json:"password" gorm:"not null;" validate:"min=8,max=128"`
	HasPassword          bool                       `json:"-" gorm:"-:all"`
	OriginalPassword     string                     `json:"original_password" gorm:"-:all"` // this field is only for Password change verification, don't save it to database!
	DisplayName          string                     `json:"display_name" gorm:"index" validate:"max=20"`
	Role                 int                        `json:"role" gorm:"type:int;default:1"`   // admin, common
	Status               int                        `json:"status" gorm:"type:int;default:1"` // enabled, disabled
	Email                string                     `json:"email" gorm:"index" validate:"max=50"`
	GitHubId             string                     `json:"github_id" gorm:"column:github_id;index"`
	DiscordId            string                     `json:"discord_id" gorm:"column:discord_id;index"`
	OidcId               string                     `json:"oidc_id" gorm:"column:oidc_id;index"`
	WeChatId             string                     `json:"wechat_id" gorm:"column:wechat_id;index"`
	TelegramId           string                     `json:"telegram_id" gorm:"column:telegram_id;index"`
	VerificationCode     string                     `json:"verification_code" gorm:"-:all"`                         // this field is only for Email verification, don't save it to database!
	AccessToken          *string                    `json:"-" gorm:"type:char(32);column:access_token;uniqueIndex"` // Deprecated: 旧版面板访问令牌，仅在升级后的过渡期内使用；删除 users.access_token 列时一并移除。
	AccessTokenCreatedAt *int64                     `json:"-" gorm:"type:bigint;column:access_token_created_at"`    // Deprecated: 旧版面板访问令牌，仅在升级后的过渡期内使用；删除 users.access_token 列时一并移除。
	Quota                int                        `json:"quota" gorm:"type:int;default:0"`
	UsedQuota            int                        `json:"used_quota" gorm:"type:int;default:0;column:used_quota"` // used quota
	RequestCount         int                        `json:"request_count" gorm:"type:int;default:0;"`               // request number
	Group                string                     `json:"group" gorm:"type:varchar(64);default:'default'"`
	AffCode              string                     `json:"aff_code" gorm:"type:varchar(32);column:aff_code;uniqueIndex"`
	AffCount             int                        `json:"aff_count" gorm:"type:int;default:0;column:aff_count"`
	AffQuota             int                        `json:"aff_quota" gorm:"type:int;default:0;column:aff_quota"`           // 邀请剩余额度
	AffHistoryQuota      int                        `json:"aff_history_quota" gorm:"type:int;default:0;column:aff_history"` // 邀请历史额度
	InviterId            int                        `json:"inviter_id" gorm:"type:int;column:inviter_id;index"`
	DeletedAt            gorm.DeletedAt             `gorm:"index"`
	LinuxDOId            string                     `json:"linux_do_id" gorm:"column:linux_do_id;index"`
	Setting              string                     `json:"setting" gorm:"type:text;column:setting"`
	Remark               string                     `json:"remark,omitempty" gorm:"type:varchar(255)" validate:"max=255"`
	StripeCustomer       string                     `json:"stripe_customer" gorm:"type:varchar(64);column:stripe_customer;index"`
	CreatedAt            int64                      `json:"created_at" gorm:"autoCreateTime;column:created_at"`
	LastLoginAt          int64                      `json:"last_login_at" gorm:"default:0;column:last_login_at"`
	AuthVersion          int64                      `json:"-" gorm:"type:bigint;not null;default:1;column:auth_version"`
	AdminPermissions     map[string]map[string]bool `json:"admin_permissions,omitempty" gorm:"-:all"`
}

func (releasedLegalUser44) TableName() string { return "users" }

func TestLegalUpgradeArchivesExistingDocuments(t *testing.T) {
	dialect := os.Getenv("TEST_SECURITY_DIALECT")
	if dialect == "" {
		dialect = "sqlite"
	}
	db, _ := newAuditTestDatabase(t, dialect, os.Getenv("TEST_"+strings.ToUpper(dialect)+"_DSN"))
	previousDB := model.DB
	previousType := common.MainDatabaseType()
	previousSettings := *system_setting.GetLegalSettings()
	common.OptionMapRWMutex.Lock()
	previousMap := common.OptionMap
	common.OptionMap = map[string]string{}
	common.OptionMapRWMutex.Unlock()
	model.DB = db
	dbType := common.DatabaseTypeSQLite
	if dialect == "mysql" {
		dbType = common.DatabaseTypeMySQL
	}
	if dialect == "postgres" {
		dbType = common.DatabaseTypePostgreSQL
	}
	common.SetMainDatabaseType(dbType)
	t.Cleanup(func() {
		model.DB = previousDB
		common.SetMainDatabaseType(previousType)
		*system_setting.GetLegalSettings() = previousSettings
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousMap
		common.OptionMapRWMutex.Unlock()
	})
	// The options schema is identical in v1.0.0-rc.44, as verified against blob
	// 35e51c4b1f0d216bc8b48fae52185b073e5c441a. Construct a released database
	// before introducing either new legal table.
	require.NoError(t, db.AutoMigrate(&releasedLegalUser44{}, &model.Option{}))
	legacy := releasedLegalUser44{Username: "released-legal-user", Password: "released-password", Quota: 1234, AffCode: "legacy-legal"}
	require.NoError(t, db.Create(&legacy).Error)
	require.NoError(t, db.Create(&model.Option{Key: "legal.user_agreement", Value: "Released terms"}).Error)
	require.NoError(t, db.Create(&model.Option{Key: "legal.privacy_policy", Value: "Released privacy"}).Error)
	for range 2 {
		require.NoError(t, db.AutoMigrate(&model.LegalVersion{}, &model.LegalConsent{}))
		require.NoError(t, model.InitializeLegalVersions())
	}
	current, err := model.CurrentLegalVersion(db, false)
	require.NoError(t, err)
	require.NotNil(t, current)
	assert.Equal(t, "Released terms", current.UserAgreement)
	assert.Equal(t, "Released privacy", current.PrivacyPolicy)
	var versions, consents int64
	require.NoError(t, db.Model(&model.LegalVersion{}).Count(&versions).Error)
	require.NoError(t, db.Model(&model.LegalConsent{}).Count(&consents).Error)
	assert.EqualValues(t, 1, versions)
	assert.Zero(t, consents)
	var stored releasedLegalUser44
	require.NoError(t, db.First(&stored, legacy.Id).Error)
	assert.Equal(t, legacy.Username, stored.Username)
	assert.Equal(t, legacy.Password, stored.Password)
	assert.Equal(t, legacy.Quota, stored.Quota)
	duplicateUser := releasedLegalUser44{Username: legacy.Username, Password: "duplicate", AffCode: "other"}
	assert.Error(t, db.Create(&duplicateUser).Error, "existing username uniqueness is retained")
	needed, err := model.NeedsLegalConsent(legacy.Id)
	require.NoError(t, err)
	assert.True(t, needed)
	// Uniqueness survives a second migration/startup.
	record := model.LegalConsent{UserId: legacy.Id, VersionId: current.Id, AcceptedAt: 100}
	require.NoError(t, db.Create(&record).Error)
	err = db.Create(&model.LegalConsent{UserId: legacy.Id, VersionId: current.Id, AcceptedAt: 200}).Error
	assert.Error(t, err)
}

func TestLegalWeChatAndOAuthFlowConsent(t *testing.T) {
	_, _ = setupLegalTest(t)
	version, err := model.PublishLegalVersion(map[string]string{"legal.user_agreement": "Terms"}, true, 1, 0)
	require.NoError(t, err)
	provider := &authFlowTestOAuthProvider{}
	oauth.Register("legal-flow", provider)
	defer oauth.Unregister("legal-flow")
	body := fmt.Sprintf(`{"provider":"legal-flow","intent":"login","legal_consent":{"accepted":true,"version_id":%d}}`, version.Id)
	response := securityEnrollmentRequest("POST", "/api/oauth/state", body, "", service.AuthIdentity{}, GenerateOAuthCode)
	var state struct {
		Success bool `json:"success"`
		Data    struct {
			FlowToken string `json:"flow_token"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &state))
	require.True(t, state.Success, response.Body.String())
	flow, err := model.GetAuthFlow(state.Data.FlowToken, model.AuthFlowMatch{Purpose: model.AuthFlowPurposeOAuth, Provider: "legal-flow"})
	require.NoError(t, err)
	var payload oauthFlowPayload
	require.NoError(t, common.UnmarshalJsonStr(flow.Payload, &payload))
	require.NotNil(t, payload.LegalConsent)
	assert.Equal(t, version.Id, payload.LegalConsent.VersionId)
	newer, err := model.PublishLegalVersion(map[string]string{"legal.user_agreement": "New terms"}, true, 1, version.Id)
	require.NoError(t, err)
	previousRegister, previousWeChat, previousServer := common.RegisterEnabled, common.WeChatAuthEnabled, common.WeChatServerAddress
	common.RegisterEnabled, common.WeChatAuthEnabled = true, true
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, err := w.Write([]byte(`{"success":true,"data":"legal-wechat-subject"}`))
		assert.NoError(t, err)
	}))
	defer server.Close()
	common.WeChatServerAddress = server.URL
	t.Cleanup(func() {
		common.RegisterEnabled, common.WeChatAuthEnabled, common.WeChatServerAddress = previousRegister, previousWeChat, previousServer
	})
	// The pre-redirect consent stored in OAuth state cannot authorize a newer revision.
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("GET", "/callback", nil)
	device := base64.RawURLEncoding.EncodeToString(make([]byte, 32))
	device += "." + common.GenerateHMACWithKey([]byte("reward-device:"+common.CryptoSecret), device)
	c.Request.AddCookie(&http.Cookie{Name: rewardDeviceCookie, Value: device})
	c.Set("legal_acceptance", payload.LegalConsent)
	_, _, err = findOrCreateOAuthUser(c, provider, &oauth.OAuthUser{ProviderUserID: "stale-flow-user", Username: "stale-flow-user"}, &oauth.OAuthToken{}, "")
	require.ErrorIs(t, err, model.ErrLegalVersionChanged)
	for _, test := range []struct {
		method, body string
		allowed      bool
	}{
		{"GET", "", false},
		{"POST", fmt.Sprintf(`{"code":"fixture","legal_consent":{"accepted":true,"version_id":%d}}`, version.Id), false},
		{"POST", fmt.Sprintf(`{"code":"fixture","legal_consent":{"accepted":true,"version_id":%d}}`, newer.Id), true},
	} {
		response := securityEnrollmentRequest(test.method, "/api/oauth/wechat?code=fixture", test.body, "", service.AuthIdentity{}, WeChatAuth)
		var count int64
		require.NoError(t, model.DB.Model(&model.User{}).Where("wechat_id = ?", "legal-wechat-subject").Count(&count).Error)
		if test.allowed {
			require.EqualValues(t, 1, count, response.Body.String())
			var record model.LegalConsent
			require.NoError(t, model.DB.Where("version_id = ?", newer.Id).First(&record).Error)
		} else {
			assert.Zero(t, count)
			assert.Equal(t, http.StatusConflict, response.Code, response.Body.String())
		}
	}
}
