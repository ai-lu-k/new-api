package model

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

// A Token Plan credential becomes an ordinary key: the same plaintext keeps
// working before and after the conversion, and a second run changes nothing.
func TestTokenPlanKeyMigrationToOrdinaryKey(t *testing.T) {
	t.Setenv("CRYPTO_SECRET", "token-plan-test-encryption-secret-32-bytes")
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(engine, func(t *testing.T) {
			var driver gorm.Dialector
			dbType := common.DatabaseTypeSQLite
			switch engine {
			case "sqlite":
				driver = sqlite.Open(":memory:")
			case "mysql":
				dsn := os.Getenv("TEST_MYSQL_DSN")
				if dsn == "" {
					t.Skip("TEST_MYSQL_DSN not configured")
				}
				driver, dbType = mysql.Open(dsn), common.DatabaseTypeMySQL
			case "postgres":
				dsn := os.Getenv("TEST_POSTGRES_DSN")
				if dsn == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
				driver, dbType = postgres.Open(dsn), common.DatabaseTypePostgreSQL
			}
			prefix := fmt.Sprintf("tpkey_%s_", engine)
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}, Logger: logger.Default.LogMode(logger.Silent)})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			if engine == "sqlite" {
				sqlDB.SetMaxOpenConns(1)
			}
			previousDB, previousLogDB := DB, LOG_DB
			previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
			previousRedis, previousBatch := common.RedisEnabled, common.BatchUpdateEnabled
			DB, LOG_DB = db, db
			common.SetDatabaseTypes(dbType, dbType)
			initCol()
			common.RedisEnabled, common.BatchUpdateEnabled = false, false
			t.Cleanup(func() {
				_ = db.Migrator().DropTable(&TokenPlanAccount{}, &Token{}, &User{}, &TokenPlanWeek{}, &TokenPlanResetCoupon{})
				_ = sqlDB.Close()
				DB, LOG_DB = previousDB, previousLogDB
				common.SetDatabaseTypes(previousMain, previousLog)
				initCol()
				common.RedisEnabled, common.BatchUpdateEnabled = previousRedis, previousBatch
			})
			require.NoError(t, db.Migrator().DropTable(&TokenPlanAccount{}, &Token{}, &User{}, &TokenPlanWeek{}, &TokenPlanResetCoupon{}))
			require.NoError(t, db.AutoMigrate(&User{}, &Token{}, &TokenPlanAccount{}, &TokenPlanWeek{}, &TokenPlanResetCoupon{}))

			user := User{Username: "plan-key-user", Status: common.UserStatusEnabled, Quota: 5000}
			require.NoError(t, db.Create(&user).Error)
			account, err := EnsureTokenPlanAccount(user.Id)
			require.NoError(t, err)
			credential, err := ReadTokenPlanCredential(user.Id)
			require.NoError(t, err)
			require.True(t, strings.HasPrefix(credential, "tp_"))

			// Before the migration only the digest is stored, and the plaintext
			// still resolves through it.
			stored, err := GetTokenByIds(account.TokenId, user.Id)
			require.NoError(t, err)
			require.Equal(t, TokenPlanKeyDigest(credential), stored.Key)
			found, err := GetTokenByKey(credential, false)
			require.NoError(t, err)
			assert.Equal(t, account.TokenId, found.Id)

			// A wrong host secret fails closed and never replaces the stored
			// digest with an unrelated or unusable bearer credential.
			secret := os.Getenv("CRYPTO_SECRET")
			t.Setenv("CRYPTO_SECRET", "wrong-host-secret-at-least-32-bytes-long")
			refused, err := MigrateTokenPlanKeysToOrdinaryKeys()
			require.NoError(t, err)
			assert.Equal(t, TokenPlanKeyMigrationReport{Failed: 1}, refused)
			unchanged, err := GetTokenById(account.TokenId)
			require.NoError(t, err)
			assert.Equal(t, stored.Key, unchanged.Key)
			assert.True(t, unchanged.TokenPlan)
			t.Setenv("CRYPTO_SECRET", secret)

			report, err := MigrateTokenPlanKeysToOrdinaryKeys()
			require.NoError(t, err)
			assert.Equal(t, TokenPlanKeyMigrationReport{Migrated: 1}, report)

			migrated, err := GetTokenById(account.TokenId)
			require.NoError(t, err)
			assert.Equal(t, credential, migrated.Key)
			assert.Equal(t, credential, migrated.GetFullKey())
			assert.False(t, migrated.TokenPlan)
			assert.Equal(t, TokenPlanKeyMigrationDefaultName, migrated.Name)
			assert.True(t, migrated.UnlimitedQuota)

			// After the migration the plaintext is the stored key; the digest is
			// gone rather than duplicated.
			found, err = GetTokenByKey(credential, false)
			require.NoError(t, err)
			assert.Equal(t, account.TokenId, found.Id)
			_, err = GetTokenByKey(TokenPlanKeyDigest(credential), false)
			assert.Error(t, err)

			// The console reads the account's status and its credential through
			// the plan account. Both looked the token up by token_plan = true, so
			// the migration would have blanked the balance-and-vouchers card.
			status, err := GetTokenPlanStatus(user.Id, time.Now())
			require.NoError(t, err)
			assert.Equal(t, account.TokenId, status.TokenId)
			assert.Equal(t, "sk-"+account.MaskedKey, status.MaskedKey)
			afterCredential, err := ReadTokenPlanCredential(user.Id)
			require.NoError(t, err)
			assert.Equal(t, credential, afterCredential)

			// Re-running converts nothing and leaves the key untouched.
			report, err = MigrateTokenPlanKeysToOrdinaryKeys()
			require.NoError(t, err)
			assert.Equal(t, TokenPlanKeyMigrationReport{Skipped: 1}, report)
			again, err := GetTokenById(account.TokenId)
			require.NoError(t, err)
			assert.Equal(t, credential, again.Key)

			// The retired site creates ordinary keys for new accounts, supports
			// rotating a migrated key, and never recreates a free weekly ledger.
			previousRetired := common.TokenPlanRetired
			common.TokenPlanRetired = true
			t.Cleanup(func() { common.TokenPlanRetired = previousRetired })
			rotated, err := RotateTokenPlanKey(user.Id)
			require.NoError(t, err)
			assert.False(t, rotated.TokenPlan)
			assert.NotEqual(t, credential, rotated.Key)
			_, err = GetTokenByKey(credential, true)
			assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
			found, err = GetTokenByKey(rotated.Key, true)
			require.NoError(t, err)
			assert.Equal(t, rotated.Id, found.Id)
			read, err := ReadTokenPlanCredential(user.Id)
			require.NoError(t, err)
			assert.Equal(t, rotated.Key, read)
			newUser := User{Username: "voucher-new-user", AffCode: "voucher-new", Status: common.UserStatusEnabled}
			require.NoError(t, db.Create(&newUser).Error)
			newAccount, err := EnsureTokenPlanAccount(newUser.Id)
			require.NoError(t, err)
			newToken, err := GetTokenById(newAccount.TokenId)
			require.NoError(t, err)
			assert.False(t, newToken.TokenPlan)
			assert.NotContains(t, newToken.Key, "tp_hash_")
			status, err = GetTokenPlanStatus(newUser.Id, time.Now())
			require.NoError(t, err)
			assert.True(t, status.Retired)
			assert.Zero(t, status.TotalQuota)
			var weeks int64
			require.NoError(t, db.Model(&TokenPlanWeek{}).Where("user_id = ?", newUser.Id).Count(&weeks).Error)
			assert.Zero(t, weeks)
			_, err = ReserveTokenPlanRequest(user.Id, account.TokenId, 1, time.Now())
			assert.ErrorIs(t, err, ErrTokenPlanRetired)
			_, err = UseTokenPlanReset(user.Id, "legacy-operation", true, time.Now())
			assert.ErrorIs(t, err, ErrTokenPlanRetired)
			_, err = CreateTokenPlanCouponBatch(user.Id, TokenPlanCouponGrant{}, time.Now())
			assert.ErrorIs(t, err, ErrTokenPlanRetired)

			// Deleting the default key is allowed. Reopening the balance card
			// creates a replacement ordinary key instead of stranding the card.
			require.NoError(t, newToken.Delete())
			status, err = GetTokenPlanStatus(newUser.Id, time.Now())
			require.NoError(t, err)
			assert.Zero(t, status.TokenId)
			replacement, err := EnsureTokenPlanAccount(newUser.Id)
			require.NoError(t, err)
			assert.NotEqual(t, newAccount.TokenId, replacement.TokenId)
		})
	}
}
