package service

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

func environmentTestConfig(t *testing.T, role string) *EnvironmentConfig {
	t.Helper()
	t.Setenv("APP_ENVIRONMENT_ROLE", role)
	t.Setenv("APP_ENVIRONMENT_ORIGIN", "http://127.0.0.1:5342")
	t.Setenv("APP_ENVIRONMENT_BRIDGE_SECRET", "independent-environment-test-key-32-bytes")
	t.Setenv("APP_ENVIRONMENT_UPSTREAM", "")
	t.Setenv("APP_ENVIRONMENT_USER_MAP", "")
	if role == "production" {
		t.Setenv("APP_ENVIRONMENT_UPSTREAM", "https://staging.example.test")
		t.Setenv("APP_ENVIRONMENT_USER_MAP", `{"production-admin":"staging-admin"}`)
	}
	config, err := LoadEnvironmentConfig()
	require.NoError(t, err)
	return config
}

func environmentTestParent() EnvParent {
	return EnvParent{Identity: AuthIdentity{UserID: 7, SessionID: "production-browser", UserAuthVersion: 1, SessionVersion: 1}, Username: "production-admin", Role: common.RoleAdminUser, ExpiresAt: time.Now().Add(time.Hour).Unix()}
}

func TestEnvironmentConfiguration(t *testing.T) {
	for _, name := range []string{"APP_ENVIRONMENT_ROLE", "APP_ENVIRONMENT_ORIGIN", "APP_ENVIRONMENT_BRIDGE_SECRET", "APP_ENVIRONMENT_UPSTREAM", "APP_ENVIRONMENT_USER_MAP"} {
		t.Setenv(name, "")
	}
	config, err := LoadEnvironmentConfig()
	require.NoError(t, err)
	assert.Nil(t, config)
	t.Setenv("APP_ENVIRONMENT_BRIDGE_SECRET", "partial")
	_, err = LoadEnvironmentConfig()
	require.Error(t, err)
	for _, upstream := range []string{"https://staging.example.test", "https://127.0.0.1:18080", "https://[::1]:18080"} {
		t.Run("upstream/"+upstream, func(t *testing.T) {
			environmentTestConfig(t, "production")
			t.Setenv("APP_ENVIRONMENT_UPSTREAM", upstream)
			config, err := LoadEnvironmentConfig()
			require.NoError(t, err)
			assert.Equal(t, upstream, config.Upstream.String())
		})
	}
	for index, test := range []struct{ name, value string }{
		{"APP_ENVIRONMENT_UPSTREAM", ""},
		{"APP_ENVIRONMENT_UPSTREAM", "http://staging.example.test"},
		{"APP_ENVIRONMENT_UPSTREAM", "http://127.0.0.1:18080"},
		{"APP_ENVIRONMENT_UPSTREAM", "http://[::1]:18080"},
		{"APP_ENVIRONMENT_UPSTREAM", "https://user@staging.example.test"},
		{"APP_ENVIRONMENT_UPSTREAM", "https://staging.example.test/path"},
		{"APP_ENVIRONMENT_UPSTREAM", "https://staging.example.test?x"},
		{"APP_ENVIRONMENT_UPSTREAM", "https://staging.example.test#fragment"},
		{"APP_ENVIRONMENT_UPSTREAM", "http://169.254.169.254"},
		{"APP_ENVIRONMENT_ORIGIN", "https://example.com/path"},
		{"APP_ENVIRONMENT_ORIGIN", "http://example.com"},
		{"APP_ENVIRONMENT_ORIGIN", "https://user:password@example.com"},
		{"APP_ENVIRONMENT_BRIDGE_SECRET", common.SessionSecret},
		{"APP_ENVIRONMENT_BRIDGE_SECRET", common.CryptoSecret},
		{"APP_ENVIRONMENT_BRIDGE_SECRET", "weak"},
		{"APP_ENVIRONMENT_USER_MAP", `{}`},
		{"APP_ENVIRONMENT_USER_MAP", `{"admin":""}`},
	} {
		t.Run(fmt.Sprintf("%s/%d", test.name, index), func(t *testing.T) {
			environmentTestConfig(t, "production")
			t.Setenv(test.name, test.value)
			_, err := LoadEnvironmentConfig()
			require.Error(t, err)
		})
	}
	for _, origin := range []string{"https://EXAMPLE.COM:443", "https://example.com"} {
		t.Run("normalized_origin/"+origin, func(t *testing.T) {
			environmentTestConfig(t, "production")
			t.Setenv("APP_ENVIRONMENT_ORIGIN", origin)
			config, err := LoadEnvironmentConfig()
			require.NoError(t, err)
			assert.Equal(t, "https://example.com", config.Origin)
		})
	}
}

func TestEnvironmentSelectionPurposeAndLifetime(t *testing.T) {
	useTestSessionSecret(t)
	parent := environmentTestParent()
	origin := "https://example.com"
	raw, expires, err := IssueEnvironmentSelection(parent, "staging-session", "test-version", origin)
	require.NoError(t, err)
	assert.Equal(t, parent.ExpiresAt, expires)
	claims, err := ParseEnvironmentSelection(raw, origin)
	require.NoError(t, err)
	assert.Equal(t, parent.Identity, claims.Parent.Identity)
	assert.Equal(t, "staging-session", claims.StageSID)
	_, err = ParseEnvironmentSelection(raw, "https://another.example")
	require.Error(t, err)
	_, err = ParseEnvironmentSelection(raw[:len(raw)-8]+"tampered", origin)
	require.Error(t, err)
	_, err = ParseAccessToken(raw)
	require.Error(t, err)
	access, _, err := IssueAccessToken(parent.Identity)
	require.NoError(t, err)
	_, err = ParseEnvironmentSelection(access, origin)
	require.Error(t, err)
	for _, mutation := range []string{"issuer", "expired", "future", "nonce", "stage_sid", "issued_at", "not_before"} {
		t.Run(mutation, func(t *testing.T) {
			modified := *claims
			switch mutation {
			case "issuer":
				modified.Issuer = authTokenIssuer
			case "expired":
				modified.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Second))
			case "future":
				modified.IssuedAt = jwt.NewNumericDate(time.Now().Add(time.Minute))
			case "nonce":
				modified.ID = ""
			case "stage_sid":
				modified.StageSID = ""
			case "issued_at":
				modified.IssuedAt = nil
			case "not_before":
				modified.NotBefore = nil
			}
			changed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, &modified).SignedString(environmentSelectionKey())
			require.NoError(t, err)
			_, err = ParseEnvironmentSelection(changed, origin)
			require.Error(t, err)
		})
	}
	parent.ExpiresAt = time.Now().Add(24 * time.Hour).Unix()
	_, expires, err = IssueEnvironmentSelection(parent, "staging-session", "test-version", origin)
	require.NoError(t, err)
	assert.LessOrEqual(t, expires, time.Now().Add(12*time.Hour).Unix())
	parent.ExpiresAt = time.Now().Unix() - 1
	_, _, err = IssueEnvironmentSelection(parent, "staging-session", "test-version", origin)
	require.Error(t, err)
	parent = environmentTestParent()
	parent.Role = common.RoleCommonUser
	_, _, err = IssueEnvironmentSelection(parent, "staging-session", "test-version", origin)
	require.Error(t, err)
}

func TestEnvironmentRequestBindingAndReplay(t *testing.T) {
	production := environmentTestConfig(t, "production")
	staging := environmentTestConfig(t, "staging")
	request := httptest.NewRequest(http.MethodPost, "/api/internal/environment/session?mode=test", strings.NewReader(`{"test":true}`))
	request.Header.Set("Authorization", "Bearer test-staging-token")
	body := []byte(`{"test":true}`)
	parent := environmentTestParent()
	t.Run("plaintext target cannot sign a ticket", func(t *testing.T) {
		plaintext := environmentTestConfig(t, "production")
		plaintext.Upstream.Scheme = "http"
		ticket, err := SignEnvironmentRequest(plaintext, request, body, parent)
		require.ErrorIs(t, err, ErrEnvironmentBridge)
		assert.Empty(t, ticket)
	})
	raw, err := SignEnvironmentRequest(production, request, body, parent)
	require.NoError(t, err)
	for _, mutation := range []string{"body", "authorization", "method", "query", "signature"} {
		t.Run(mutation, func(t *testing.T) {
			changed := request.Clone(t.Context())
			urlCopy := *request.URL
			changed.URL = &urlCopy
			changedBody, changedRaw := body, raw
			switch mutation {
			case "body":
				changedBody = []byte(`{"test":false}`)
			case "authorization":
				changed.Header.Set("Authorization", "Bearer another-session")
			case "method":
				changed.Method = http.MethodGet
			case "query":
				changed.URL.RawQuery = "mode=other"
			case "signature":
				changedRaw = raw[:len(raw)-8] + "tampered"
			}
			_, err := VerifyEnvironmentRequest(staging, changed, changedBody, changedRaw)
			require.Error(t, err)
		})
	}
	var successes atomic.Int32
	var wait sync.WaitGroup
	for range 8 {
		wait.Go(func() {
			if _, err := VerifyEnvironmentRequest(staging, request, body, raw); err == nil {
				successes.Add(1)
			}
		})
	}
	wait.Wait()
	assert.EqualValues(t, 1, successes.Load())
	for _, mutation := range []string{"purpose", "expired", "future", "lifetime", "issuer", "audience", "origin", "parent_expiry"} {
		t.Run(mutation, func(t *testing.T) {
			original, err := SignEnvironmentRequest(production, request, body, parent)
			require.NoError(t, err)
			claims := &EnvironmentRequestClaims{}
			_, _, err = jwt.NewParser().ParseUnverified(original, claims)
			require.NoError(t, err)
			switch mutation {
			case "purpose":
				claims.TokenUse = "access"
			case "expired":
				claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Second))
			case "future":
				claims.IssuedAt = jwt.NewNumericDate(time.Now().Add(time.Minute))
			case "lifetime":
				claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(time.Minute))
			case "issuer":
				claims.Issuer = "new-api"
			case "audience":
				claims.Audience = jwt.ClaimStrings{"new-api-dashboard"}
			case "origin":
				claims.Origin = "https://another-site.example"
			case "parent_expiry":
				claims.Parent.ExpiresAt = time.Now().Unix() - 1
			}
			modified, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(environmentKey(production, environmentRequestUse))
			require.NoError(t, err)
			_, err = VerifyEnvironmentRequest(staging, request, body, modified)
			require.Error(t, err)
		})
	}
	parent.Username = "unmapped-admin"
	_, err = SignEnvironmentRequest(production, request, body, parent)
	require.Error(t, err)
	parent = environmentTestParent()
	parent.Role = common.RoleCommonUser
	_, err = SignEnvironmentRequest(production, request, body, parent)
	require.Error(t, err)
}

func TestEnvironmentShadowSessionsDatabase(t *testing.T) {
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(engine, func(t *testing.T) {
			var driver gorm.Dialector
			dbType := common.DatabaseTypeSQLite
			switch engine {
			case "sqlite":
				driver = sqlite.Open(":memory:")
			case "mysql":
				if os.Getenv("TEST_MYSQL_DSN") == "" {
					t.Skip("TEST_MYSQL_DSN not configured")
				}
				driver, dbType = mysql.Open(os.Getenv("TEST_MYSQL_DSN")), common.DatabaseTypeMySQL
			case "postgres":
				if os.Getenv("TEST_POSTGRES_DSN") == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
				driver, dbType = postgres.Open(os.Getenv("TEST_POSTGRES_DSN")), common.DatabaseTypePostgreSQL
			}
			db, err := gorm.Open(driver, &gorm.Config{Logger: logger.Default.LogMode(logger.Silent), NamingStrategy: schema.NamingStrategy{TablePrefix: "env_bridge_"}})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)
			oldDB, oldRedis := model.DB, common.RedisEnabled
			oldRetention := common.UserSessionRevokedRetentionDays
			common.UserSessionRevokedRetentionDays = 7
			mainType, logType := common.MainDatabaseType(), common.LogDatabaseType()
			model.DB, common.RedisEnabled = db, false
			common.SetDatabaseTypes(dbType, dbType)
			t.Cleanup(func() {
				require.NoError(t, db.Migrator().DropTable(&model.UserSession{}, &model.User{}))
				model.DB, common.RedisEnabled = oldDB, oldRedis
				common.UserSessionRevokedRetentionDays = oldRetention
				common.SetDatabaseTypes(mainType, logType)
				_ = sqlDB.Close()
			})
			require.NoError(t, db.Migrator().DropTable(&model.UserSession{}, &model.User{}))
			require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}))
			require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}))
			query := "SELECT VERSION()"
			if engine == "sqlite" {
				query = "SELECT sqlite_version()"
			}
			var version string
			require.NoError(t, db.Raw(query).Scan(&version).Error)
			t.Logf("database=%s version=%s", engine, version)
			production, staging := environmentTestConfig(t, "production"), environmentTestConfig(t, "staging")
			user := &model.User{Username: "staging-admin", Role: common.RoleAdminUser, Status: common.UserStatusEnabled, AuthVersion: 1, Group: "default", AffCode: "env-admin"}
			require.NoError(t, db.Create(user).Error)
			request := httptest.NewRequest(http.MethodPost, "/api/internal/environment/session", nil)
			parent := environmentTestParent()
			parent.ExpiresAt = time.Now().Add(10 * 24 * time.Hour).Unix()
			raw, err := SignEnvironmentRequest(production, request, nil, parent)
			require.NoError(t, err)
			claims, err := VerifyEnvironmentRequest(staging, request, nil, raw)
			require.NoError(t, err)
			unverified := &EnvironmentRequestClaims{Parent: claims.Parent, StagingUsername: claims.StagingUsername}
			_, _, err = GetEnvironmentAuthBundle(staging, unverified)
			require.Error(t, err)
			bundle, stageUser, err := GetEnvironmentAuthBundle(staging, claims)
			require.NoError(t, err)
			assert.Empty(t, bundle.RefreshToken)
			assert.LessOrEqual(t, bundle.AccessExpiresAt, parent.ExpiresAt)
			identity, err := ParseAccessToken(bundle.AccessToken)
			require.NoError(t, err)
			session, _, err := ValidateLoginSession(identity)
			require.NoError(t, err)
			require.NoError(t, ValidateEnvironmentSession(staging, claims, session, stageUser))
			different := *claims
			different.Parent.Identity.SessionID = "other-production-session"
			require.Error(t, ValidateEnvironmentSession(staging, &different, session, stageUser))
			repeat, _, err := GetEnvironmentAuthBundle(staging, claims)
			require.NoError(t, err)
			assert.Equal(t, bundle.Session.SID, repeat.Session.SID)
			// Security rotation advances the same active stage session, while
			// version mismatches revoke rather than silently granting access.
			require.NoError(t, db.Model(user).Update("auth_version", 2).Error)
			require.NoError(t, db.Model(&model.UserSession{}).Where("sid = ?", session.SID).Updates(map[string]any{"version": 2, "user_auth_version": 2}).Error)
			rotated, _, err := GetEnvironmentAuthBundle(staging, claims)
			require.NoError(t, err)
			rotatedIdentity, err := ParseAccessToken(rotated.AccessToken)
			require.NoError(t, err)
			assert.EqualValues(t, 2, rotatedIdentity.SessionVersion)
			assert.EqualValues(t, 2, rotatedIdentity.UserAuthVersion)
			require.NoError(t, db.Model(user).Update("auth_version", 3).Error)
			_, _, err = GetEnvironmentAuthBundle(staging, claims)
			require.Error(t, err)
			require.NoError(t, db.Model(user).Update("auth_version", 2).Error)
			require.NoError(t, RevokeEnvironmentSession(staging, claims))
			_, _, err = GetEnvironmentAuthBundle(staging, claims)
			require.Error(t, err)
			var count int64
			require.NoError(t, db.Model(&model.UserSession{}).Count(&count).Error)
			assert.EqualValues(t, 1, count)
			// Seven-day retention must not delete a bridge revocation while
			// its production parent could still present this binding.
			now := time.Now().Unix()
			ordinary := &model.UserSession{SID: "ordinary-revoked", UserID: user.Id, Version: 1, UserAuthVersion: 2, Status: model.UserSessionStatusRevoked, LoginMethod: "password", RefreshHash: "unused", CreatedAt: now, LastActiveAt: now, RevokedAt: now, ExpiresAt: parent.ExpiresAt}
			require.NoError(t, db.Create(ordinary).Error)
			require.NoError(t, model.DeleteOldRevokedUserSessions(now+8*24*60*60))
			retained, err := model.GetUserSessionBySID(session.SID)
			require.NoError(t, err)
			assert.Equal(t, model.UserSessionStatusRevoked, retained.Status)
			_, err = model.GetUserSessionBySID(ordinary.SID)
			require.ErrorIs(t, err, gorm.ErrRecordNotFound)
			_, _, err = GetEnvironmentAuthBundle(staging, claims)
			require.Error(t, err)
			require.NoError(t, model.DeleteOldRevokedUserSessions(parent.ExpiresAt+1))
			_, err = model.GetUserSessionBySID(session.SID)
			require.ErrorIs(t, err, gorm.ErrRecordNotFound)
			parent.Identity.SessionID = "fresh-production-session"
			claims.Parent = parent
			require.NoError(t, db.Model(user).Update("role", common.RoleRootUser).Error)
			_, _, err = GetEnvironmentAuthBundle(staging, claims)
			require.Error(t, err)
			require.NoError(t, db.Model(user).Update("role", common.RoleAdminUser).Error)
			require.NoError(t, db.Model(user).Update("status", common.UserStatusDisabled).Error)
			_, _, err = GetEnvironmentAuthBundle(staging, claims)
			require.Error(t, err)
			assert.False(t, errors.Is(err, gorm.ErrRecordNotFound))
			claims.StagingUsername = fmt.Sprintf("missing-%s", engine)
			_, _, err = GetEnvironmentAuthBundle(staging, claims)
			require.Error(t, err)
		})
	}
}
