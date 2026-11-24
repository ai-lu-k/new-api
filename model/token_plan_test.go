package model

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

// Representative deployed Token schema before the plan column was added.
type legacyPlanToken struct {
	Id                 int
	UserId             int    `gorm:"index"`
	Key                string `gorm:"type:varchar(128);uniqueIndex"`
	Status             int    `gorm:"default:1"`
	Name               string `gorm:"index"`
	CreatedTime        int64  `gorm:"bigint"`
	AccessedTime       int64  `gorm:"bigint"`
	ExpiredTime        int64  `gorm:"bigint;default:-1"`
	RemainQuota        int    `gorm:"default:0"`
	UnlimitedQuota     bool
	ModelLimitsEnabled bool
	ModelLimits        string  `gorm:"type:text"`
	AllowIps           *string `gorm:"default:''"`
	UsedQuota          int     `gorm:"default:0"`
	Group              string  `gorm:"default:''"`
	CrossGroupRetry    bool
	AutoGroups         string         `gorm:"type:text"`
	DeletedAt          gorm.DeletedAt `gorm:"index"`
}

type legacyPlanMidjourney struct {
	Id          int    `json:"id"`
	Code        int    `json:"code"`
	UserId      int    `json:"user_id" gorm:"index"`
	Action      string `json:"action" gorm:"type:varchar(40);index"`
	MjId        string `json:"mj_id" gorm:"index"`
	Prompt      string `json:"prompt"`
	PromptEn    string `json:"prompt_en"`
	Description string `json:"description"`
	State       string `json:"state"`
	SubmitTime  int64  `json:"submit_time" gorm:"index"`
	StartTime   int64  `json:"start_time" gorm:"index"`
	FinishTime  int64  `json:"finish_time" gorm:"index"`
	ImageUrl    string `json:"image_url"`
	VideoUrl    string `json:"video_url"`
	VideoUrls   string `json:"video_urls"`
	Status      string `json:"status" gorm:"type:varchar(20);index"`
	Progress    string `json:"progress" gorm:"type:varchar(30);index"`
	FailReason  string `json:"fail_reason"`
	ChannelId   int    `json:"channel_id"`
	Quota       int    `json:"quota"`
	Buttons     string `json:"buttons"`
	Properties  string `json:"properties"`

	TokenId          int `json:"-" gorm:"default:0"`
	BillingChannelId int `json:"-" gorm:"default:0"`
}

// Schemas deployed before balance continuation and separate reservations.
type legacyPlanAccount struct {
	Id            int
	UserId        int    `gorm:"uniqueIndex;not null"`
	TokenId       int    `gorm:"uniqueIndex;not null"`
	KeyCiphertext string `gorm:"type:text;not null"`
	MaskedKey     string `gorm:"not null"`
}
type legacyPlanWeek struct {
	Id        int
	UserId    int   `gorm:"uniqueIndex:idx_token_plan_week;not null"`
	WeekStart int64 `gorm:"uniqueIndex:idx_token_plan_week;not null"`
	UsedQuota int64 `gorm:"not null"`
}

// The deployed coupon table predates the arrival acknowledgement column.
type legacyPlanCoupon struct {
	Id         int
	BatchId    int `gorm:"uniqueIndex:idx_plan_coupon_grant;not null"`
	UserId     int `gorm:"uniqueIndex:idx_plan_coupon_grant;index;not null"`
	Ordinal    int `gorm:"uniqueIndex:idx_plan_coupon_grant;not null"`
	Multiplier int
	ExpiresAt  int64
	Status     string `gorm:"size:16;not null"`
	UsedAt     int64
	WeekId     int
}

func TestTokenPlanDatabaseLifecycle(t *testing.T) {
	t.Setenv("CRYPTO_SECRET", "token-plan-test-encryption-secret-32-bytes")
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		for _, revision := range []string{"fresh", "legacy", "previous"} {
			upgrade := revision != "fresh"
			t.Run(fmt.Sprintf("%s/%s", engine, revision), func(t *testing.T) {
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
				prefix := fmt.Sprintf("tp_%s_%s_", engine, revision)
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
					_ = db.Migrator().DropTable(&TokenPlanResetCoupon{}, &TokenPlanCouponBatch{}, &TokenPlanResetOperation{}, &TokenPlanReservation{}, &TokenPlanWeek{}, &TokenPlanAccount{}, &Token{}, &Midjourney{}, &Task{}, &User{})
					_ = sqlDB.Close()
					DB, LOG_DB = previousDB, previousLogDB
					common.SetDatabaseTypes(previousMain, previousLog)
					initCol()
					common.RedisEnabled, common.BatchUpdateEnabled = previousRedis, previousBatch
				})
				require.NoError(t, db.Migrator().DropTable(&TokenPlanResetCoupon{}, &TokenPlanCouponBatch{}, &TokenPlanResetOperation{}, &TokenPlanReservation{}, &TokenPlanWeek{}, &TokenPlanAccount{}, &Token{}, &Midjourney{}, &Task{}, &User{}))
				query := "SELECT VERSION()"
				if engine == "sqlite" {
					query = "SELECT sqlite_version()"
				}
				var version string
				require.NoError(t, db.Raw(query).Scan(&version).Error)
				t.Logf("%s %s", engine, version)
				require.NoError(t, db.AutoMigrate(&User{}))
				thresholds := operation_setting.GetUsageLevelThresholds()
				user := User{Username: "plan-user", Status: common.UserStatusEnabled, Quota: 12345, UsedQuota: thresholds[2], LevelQuota: thresholds[2]}
				require.NoError(t, db.Create(&user).Error)
				if upgrade {
					require.NoError(t, db.Table(prefix+"midjourneys").AutoMigrate(&legacyPlanMidjourney{}))
					require.NoError(t, db.Table(prefix+"midjourneys").Create(&legacyPlanMidjourney{UserId: user.Id, MjId: "legacy-mj", Quota: 99, TokenId: 7}).Error)
					require.NoError(t, db.Table(prefix+"tokens").AutoMigrate(&legacyPlanToken{}))
					require.NoError(t, db.Table(prefix+"tokens").Create(&legacyPlanToken{UserId: user.Id, Key: "legacy-key", Name: "legacy", RemainQuota: 99}).Error)
				}
				if upgrade {
					require.NoError(t, db.Migrator().DropColumn(&User{}, "token_plan_reserved_quota"))
					require.NoError(t, db.Table(prefix+"token_plan_accounts").AutoMigrate(&legacyPlanAccount{}))
					require.NoError(t, db.Table(prefix+"token_plan_weeks").AutoMigrate(&legacyPlanWeek{}))
					require.NoError(t, db.Table(prefix+"token_plan_accounts").Create(&legacyPlanAccount{UserId: 99, TokenId: 999, KeyCiphertext: "encrypted-fixture", MaskedKey: "masked-fixture"}).Error)
					require.NoError(t, db.Table(prefix+"token_plan_weeks").Create(&legacyPlanWeek{UserId: 99, WeekStart: 1, UsedQuota: 17}).Error)
				}
				if revision == "previous" {
					// The last deployed schema already has wallet continuation
					// and reservations, but none of the coupon/cycle columns.
					require.NoError(t, db.AutoMigrate(&Token{}, &TokenPlanAccount{}, &TokenPlanWeek{}, &TokenPlanReservation{}))
					require.NoError(t, db.Create(&TokenPlanReservation{UserId: 99, WeekId: 999, Settled: true, ActualQuota: 11, FreeUsed: 9, WalletUsed: 2}).Error)
					require.NoError(t, db.Migrator().DropColumn(&TokenPlanReservation{}, "settled_at"))
					for _, field := range []string{"cycle_anchor", "current_week_id", "auto_reset_coupon"} {
						require.NoError(t, db.Migrator().DropColumn(&TokenPlanAccount{}, field))
					}
					for _, field := range []string{"cycle_start", "cycle_end", "multiplier"} {
						require.NoError(t, db.Migrator().DropColumn(&TokenPlanWeek{}, field))
					}
					require.NoError(t, db.Model(&TokenPlanAccount{}).Where("user_id = ?", 99).UpdateColumn("wallet_fallback", true).Error)
					require.NoError(t, db.Model(&TokenPlanWeek{}).Where("user_id = ?", 99).UpdateColumn("reserved_quota", 7).Error)
					require.NoError(t, db.Table(prefix+"token_plan_reset_coupons").AutoMigrate(&legacyPlanCoupon{}))
					require.NoError(t, db.Table(prefix+"token_plan_reset_coupons").Create(&legacyPlanCoupon{UserId: 99, Ordinal: 1, Multiplier: 5, ExpiresAt: 4102444800, Status: "available"}).Error)
					// A deployed reset history predates the automatic-trigger marker.
					require.NoError(t, db.Table(prefix+"token_plan_reset_operations").AutoMigrate(&TokenPlanResetOperation{}))
					require.NoError(t, db.Table(prefix+"token_plan_reset_operations").Create(&TokenPlanResetOperation{Id: "legacy-operation", UserId: 99, CouponId: 7, NewTotal: 500000, NewMultiplier: 5, WeekId: 999, Status: "succeeded"}).Error)
					require.NoError(t, db.Migrator().DropColumn(&TokenPlanResetOperation{}, "auto"))
				}
				// Both a fresh install and a deployed schema must survive two startups.
				for range 2 {
					require.NoError(t, db.AutoMigrate(&User{}, &Token{}, &TokenPlanAccount{}, &TokenPlanWeek{}, &TokenPlanResetCoupon{}, &TokenPlanCouponBatch{}, &TokenPlanResetOperation{}, &TokenPlanReservation{}, &Midjourney{}, &Task{}))
					require.NoError(t, MigrateTokenPlanCouponAcknowledgements(db))
				}
				if upgrade {
					var oldAccount TokenPlanAccount
					require.NoError(t, db.Where("user_id = ?", 99).First(&oldAccount).Error)
					assert.Equal(t, revision == "previous", oldAccount.WalletFallback)
					assert.Equal(t, "masked-fixture", oldAccount.MaskedKey)
					assert.False(t, oldAccount.AutoResetCoupon, "automatic coupon use starts disabled")
					if revision == "previous" {
						var oldReservation TokenPlanReservation
						require.NoError(t, db.Where("user_id = ?", 99).First(&oldReservation).Error)
						assert.Zero(t, oldReservation.SettledAt)
						assert.EqualValues(t, 9, oldReservation.FreeUsed)
						assert.EqualValues(t, 2, oldReservation.WalletUsed)
						assert.True(t, oldReservation.Settled)
						// An already-issued coupon is still announced once: the
						// added column starts NULL, which no equality check matches.
						var oldCoupon TokenPlanResetCoupon
						require.NoError(t, db.Where("user_id = ?", 99).First(&oldCoupon).Error)
						assert.Equal(t, 5, oldCoupon.Multiplier)
						assert.Equal(t, "available", oldCoupon.Status)
						assert.EqualValues(t, 4102444800, oldCoupon.ExpiresAt)
						assert.Zero(t, oldCoupon.AcknowledgedAt)
						var oldOperation TokenPlanResetOperation
						require.NoError(t, db.First(&oldOperation, "id = ?", "legacy-operation").Error)
						assert.Equal(t, "succeeded", oldOperation.Status)
						assert.EqualValues(t, 500000, oldOperation.NewTotal)
						assert.False(t, oldOperation.Auto, "a historic reset was not automatic")
						announced, err := ListPendingTokenPlanCoupons(99, time.Unix(4102444700, 0))
						require.NoError(t, err)
						require.Len(t, announced, 1)
						assert.Equal(t, oldCoupon.Id, announced[0].Id)
					}
					var oldBucket TokenPlanWeek
					require.NoError(t, db.Where("user_id = ?", 99).First(&oldBucket).Error)
					assert.EqualValues(t, 17, oldBucket.UsedQuota)
					if revision == "previous" {
						assert.EqualValues(t, 7, oldBucket.ReservedQuota)
					} else {
						assert.Zero(t, oldBucket.ReservedQuota)
					}
					var oldTask Midjourney
					require.NoError(t, db.Where("mj_id = ?", "legacy-mj").First(&oldTask).Error)
					assert.Equal(t, 99, oldTask.Quota)
					assert.Equal(t, 7, oldTask.TokenId)
					keys, err := GetAllUserTokens(user.Id, 0, 100)
					require.NoError(t, err)
					require.Len(t, keys, 1)
					assert.Equal(t, 99, keys[0].RemainQuota)
					assert.Error(t, db.Create(&Token{UserId: user.Id, Key: "legacy-key"}).Error)
				}
				account, err := EnsureTokenPlanAccount(user.Id)
				require.NoError(t, err)
				again, err := EnsureTokenPlanAccount(user.Id)
				require.NoError(t, err)
				assert.Equal(t, account.TokenId, again.TokenId)
				assert.Error(t, db.Create(&TokenPlanAccount{UserId: user.Id, TokenId: account.TokenId + 1}).Error)
				token, err := GetTokenByIds(account.TokenId, user.Id)
				require.NoError(t, err)
				credential, err := ReadTokenPlanCredential(user.Id)
				require.NoError(t, err)
				assert.NotEqual(t, credential, token.Key)
				_, err = ValidateUserToken(token.Key)
				assert.ErrorIs(t, err, ErrTokenInvalid)
				_, err = ValidateUserToken(credential)
				require.NoError(t, err)
				now := time.Date(2026, 10, 11, 23, 59, 0, 0, time.FixedZone("Asia/Shanghai", 8*3600))
				status, err := GetTokenPlanStatus(user.Id, now)
				require.NoError(t, err)
				assert.Equal(t, 2, status.Level)
				assert.EqualValues(t, common.QuotaPerUnit, status.TotalQuota)
				assert.NotContains(t, status.MaskedKey, token.Key)
				// Concurrent half-budget reservations can succeed exactly twice.
				amounts := make(chan error, 6)
				var wg sync.WaitGroup
				for range 6 {
					wg.Go(func() { _, err := ReserveTokenPlanQuota(user.Id, token.Id, status.TotalQuota/2, now); amounts <- err })
				}
				wg.Wait()
				close(amounts)
				successes := 0
				for err := range amounts {
					if err == nil {
						successes++
					} else {
						assert.ErrorIs(t, err, ErrTokenPlanExhausted)
					}
				}
				assert.Equal(t, 2, successes)
				status, err = GetTokenPlanStatus(user.Id, now)
				require.NoError(t, err)
				assert.Zero(t, status.RemainingQuota)
				var oldWeek TokenPlanWeek
				require.NoError(t, db.Where("user_id = ? AND week_start = ?", user.Id, status.WeekStart).First(&oldWeek).Error)
				assert.Error(t, AdjustTokenPlanQuota(user.Id, oldWeek.Id, -status.TotalQuota-1, false))
				// An upstream overrun stays in this week, never draws from a wallet.
				require.NoError(t, AdjustTokenPlanQuota(user.Id, oldWeek.Id, 1, false))
				_, err = ReserveTokenPlanQuota(user.Id, token.Id, 1, now)
				assert.ErrorIs(t, err, ErrTokenPlanExhausted)
				// Deferred task settlement retains the week across every database's serializer.
				job := Task{UserId: user.Id, TaskID: "plan-task", PrivateData: TaskPrivateData{BillingSource: "token_plan", TokenPlanWeekId: oldWeek.Id}}
				require.NoError(t, db.Create(&job).Error)
				var saved Task
				require.NoError(t, db.First(&saved, job.ID).Error)
				assert.Equal(t, job.PrivateData.TokenPlanWeekId, saved.PrivateData.TokenPlanWeekId)
				assert.Equal(t, "token_plan", saved.PrivateData.BillingSource)
				mj := Midjourney{UserId: user.Id, MjId: "plan-mj", Quota: 1}
				require.NoError(t, db.Create(&mj).Error)
				mj.TokenPlanWeekId = oldWeek.Id
				require.NoError(t, mj.UpdateBillingState())
				var savedMj Midjourney
				require.NoError(t, db.First(&savedMj, mj.Id).Error)
				assert.Equal(t, oldWeek.Id, savedMj.TokenPlanWeekId)
				rotated, err := RotateTokenPlanKey(user.Id)
				require.NoError(t, err)
				assert.Equal(t, token.Id, rotated.Id)
				assert.NotEqual(t, token.Key, rotated.Key)
				_, err = GetTokenByKey(credential, false)
				assert.Error(t, err)
				_, err = GetTokenByKey(rotated.Key, false)
				require.NoError(t, err)
				ordinary := Token{UserId: user.Id, Key: "ordinary-key", Name: "ordinary"}
				require.NoError(t, db.Create(&ordinary).Error)
				revealed, err := GetTokenKeysByIds([]int{rotated.Id, ordinary.Id}, user.Id)
				require.NoError(t, err)
				require.Len(t, revealed, 1)
				assert.Equal(t, ordinary.Id, revealed[0].Id)
				// A Token Plan key is an ordinary key: it can be renamed and
				// deleted like any other credential.
				rotated.Name = "renamed plan key"
				require.NoError(t, rotated.Update())
				var renamed Token
				require.NoError(t, db.Select("name").First(&renamed, rotated.Id).Error)
				assert.Equal(t, "renamed plan key", renamed.Name)
				spare := Token{UserId: user.Id, Key: "spare-plan-key", Name: "Token Plan", UnlimitedQuota: true, TokenPlan: true}
				require.NoError(t, db.Create(&spare).Error)
				deleted, err := BatchDeleteTokens([]int{spare.Id, ordinary.Id}, user.Id)
				require.NoError(t, err)
				assert.Equal(t, 2, deleted)
				_, err = GetTokenByIds(spare.Id, user.Id)
				assert.Error(t, err)
				_, err = GetTokenByIds(ordinary.Id, user.Id)
				assert.Error(t, err)
				// A refund of the old week never tops up a new week.
				next := now.Add(time.Minute)
				newStatus, err := GetTokenPlanStatus(user.Id, next)
				require.NoError(t, err)
				assert.Zero(t, newStatus.UsedQuota)
				nextWeek, err := ReserveTokenPlanQuota(user.Id, rotated.Id, 7, next)
				require.NoError(t, err)
				require.NoError(t, AdjustTokenPlanQuota(user.Id, oldWeek.Id, -11, false))
				newStatus, err = GetTokenPlanStatus(user.Id, next)
				require.NoError(t, err)
				assert.EqualValues(t, 7, newStatus.UsedQuota)
				// Upgrade adds headroom, never resets consumed quota.
				require.NoError(t, db.Model(&user).UpdateColumn("level_quota", thresholds[3]).Error)
				upgraded, err := GetTokenPlanStatus(user.Id, next)
				require.NoError(t, err)
				assert.Equal(t, 3, upgraded.Level)
				assert.EqualValues(t, 7, upgraded.UsedQuota)
				assert.EqualValues(t, common.QuotaPerUnit*2, upgraded.TotalQuota)
				// Ownership and disabled users are checked in the transactional debit.
				_, err = ReserveTokenPlanQuota(user.Id, ordinary.Id, 1, next)
				require.Error(t, err)
				assert.Error(t, AdjustTokenPlanQuota(user.Id+1, nextWeek, 1, true))
				require.NoError(t, db.Model(&user).UpdateColumn("status", common.UserStatusDisabled).Error)
				_, err = ReserveTokenPlanQuota(user.Id, rotated.Id, 1, next)
				require.Error(t, err)
				var wallet User
				require.NoError(t, db.First(&wallet, user.Id).Error)
				assert.Equal(t, 12345, wallet.Quota)
				exerciseTokenPlanContinuation(t, db, now)
				exerciseTokenPlanResetCoupons(t, db, now)
				exerciseTokenPlanAutoCoupons(t, db, now)
				exerciseTokenPlanStatistics(t, db, now)
			})
		}
	}
}

func TestTokenPlanCalendarAndBudget(t *testing.T) {
	for level, amount := range []float64{0, .5, 1, 2, 4, 8, 16} {
		quota, err := TokenPlanQuota(level)
		require.NoError(t, err)
		assert.EqualValues(t, amount*common.QuotaPerUnit, quota)
	}
	for _, test := range []struct {
		instant  string
		expected string
	}{
		{"2026-10-11T15:59:59Z", "2026-10-05T00:00:00+08:00"},
		{"2026-10-11T16:00:00Z", "2026-10-12T00:00:00+08:00"},
		{"2027-01-03T16:00:00Z", "2027-01-04T00:00:00+08:00"},
	} {
		instant, err := time.Parse(time.RFC3339, test.instant)
		require.NoError(t, err)
		assert.Equal(t, test.expected, TokenPlanWeekStart(instant).Format(time.RFC3339))
	}
	_, err := TokenPlanQuota(-1)
	assert.Error(t, err)
}

func TestTokenPlanCachedRotationAndEncryptedCredential(t *testing.T) {
	t.Setenv("CRYPTO_SECRET", "token-plan-test-encryption-secret-32-bytes")
	truncateTables(t)
	require.NoError(t, DB.AutoMigrate(&TokenPlanAccount{}, &TokenPlanWeek{}, &TokenPlanResetCoupon{}, &TokenPlanCouponBatch{}, &TokenPlanResetOperation{}, &TokenPlanReservation{}))
	t.Cleanup(func() { DB.Where("1 = 1").Delete(&TokenPlanWeek{}); DB.Where("1 = 1").Delete(&TokenPlanAccount{}) })
	useUserCacheMiniRedis(t)
	user := User{Username: "plan-cache", Status: common.UserStatusEnabled, UsedQuota: 1}
	require.NoError(t, DB.Create(&user).Error)
	account, err := EnsureTokenPlanAccount(user.Id)
	require.NoError(t, err)
	credential, err := ReadTokenPlanCredential(user.Id)
	require.NoError(t, err)
	stored, err := GetTokenByIds(account.TokenId, user.Id)
	require.NoError(t, err)
	assert.NotContains(t, account.KeyCiphertext, credential)
	_, err = protectTokenPlanKey(account.KeyCiphertext, user.Id+1, account.TokenId, true)
	assert.Error(t, err)
	require.NoError(t, cacheSetTokenForTest(*stored))
	cached, err := ValidateUserToken(credential)
	require.NoError(t, err)
	require.True(t, cached.TokenPlan)
	rotated, err := RotateTokenPlanKey(user.Id)
	require.NoError(t, err)
	_, err = ValidateUserToken(credential)
	assert.Error(t, err)
	active, err := ValidateUserToken(rotated.Key)
	require.NoError(t, err)
	assert.True(t, active.TokenPlan)
	// A stale database snapshot cannot republish a revoked credential.
	require.NoError(t, cacheSetTokenForTest(*stored))
	_, err = ValidateUserToken(credential)
	assert.Error(t, err)
	// Plan wallet holds share the ordinary atomic cache balance, which can be
	// below the database balance while ordinary debits await batch persistence.
	require.NoError(t, DB.Model(&user).UpdateColumn("quota", 50000).Error)
	require.NoError(t, invalidateUserCache(user.Id))
	_, err = GetUserCache(user.Id)
	require.NoError(t, err)
	_, err = cacheApplyUserQuotaDelta(user.Id, -49900)
	require.NoError(t, err)
	require.NoError(t, UpdateTokenPlanSettings(user.Id, walletFallback(true)))
	status, err := GetTokenPlanStatus(user.Id, time.Now())
	require.NoError(t, err)
	_, err = ReserveTokenPlanRequest(user.Id, rotated.Id, status.TotalQuota+101, time.Now())
	assert.ErrorIs(t, err, ErrTokenPlanWalletInsufficient)
	pending, err := ReserveTokenPlanRequest(user.Id, rotated.Id, status.TotalQuota+100, time.Now())
	require.NoError(t, err)
	balance, err := GetUserQuota(user.Id, false)
	require.NoError(t, err)
	assert.Zero(t, balance)
	_, err = SettleTokenPlanRequest(user.Id, pending.Id, 0)
	require.NoError(t, err)
	balance, err = GetUserQuota(user.Id, false)
	require.NoError(t, err)
	assert.Equal(t, 100, balance)
	// A failed ledger write must compensate its already-atomic cache hold.
	require.NoError(t, DB.Migrator().DropTable(&TokenPlanResetCoupon{}, &TokenPlanCouponBatch{}, &TokenPlanResetOperation{}, &TokenPlanReservation{}))
	_, err = ReserveTokenPlanRequest(user.Id, rotated.Id, status.TotalQuota+100, time.Now())
	require.Error(t, err)
	balance, err = GetUserQuota(user.Id, false)
	require.NoError(t, err)
	assert.Equal(t, 100, balance)
	require.NoError(t, DB.AutoMigrate(&TokenPlanResetCoupon{}, &TokenPlanCouponBatch{}, &TokenPlanResetOperation{}, &TokenPlanReservation{}))
	require.NoError(t, common.RDB.Close())
	_, err = RotateTokenPlanKey(user.Id)
	assert.Error(t, err)
	current, err := ReadTokenPlanCredential(user.Id)
	require.NoError(t, err)
	assert.Equal(t, rotated.Key, current)
	// Misconfigured encryption must not leave an orphan credential in the DB.
	t.Setenv("CRYPTO_SECRET", "")
	t.Setenv("SESSION_SECRET", "")
	other := User{Username: "plan-config-user", AffCode: "plan-config-aff", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(&other).Error)
	_, err = EnsureTokenPlanAccount(other.Id)
	require.Error(t, err)
	var count int64
	require.NoError(t, DB.Model(&Token{}).Where("user_id = ?", other.Id).Count(&count).Error)
	assert.Zero(t, count)
}

func exerciseTokenPlanContinuation(t *testing.T, db *gorm.DB, now time.Time) {
	t.Helper()
	user := User{Username: "continuation", AffCode: "continuation", Status: common.UserStatusEnabled, Quota: 1000000, UsedQuota: operation_setting.GetUsageLevelThresholds()[2], LevelQuota: operation_setting.GetUsageLevelThresholds()[2]}
	require.NoError(t, db.Create(&user).Error)
	account, err := EnsureTokenPlanAccount(user.Id)
	require.NoError(t, err)
	status, err := GetTokenPlanStatus(user.Id, now)
	require.NoError(t, err)
	assert.False(t, status.WalletFallback)
	total := status.TotalQuota
	reservation, err := ReserveTokenPlanRequest(user.Id, account.TokenId, total, now)
	require.NoError(t, err)
	status, err = GetTokenPlanStatus(user.Id, now)
	require.NoError(t, err)
	assert.Zero(t, status.UsedQuota, "pending work must not appear as consumption")
	assert.Equal(t, total, status.RemainingQuota)
	_, err = ReserveTokenPlanRequest(user.Id, account.TokenId, 1, now)
	assert.ErrorIs(t, err, ErrTokenPlanExhausted, "displayed quota is not concurrent spending capacity")
	_, err = SettleTokenPlanRequest(user.Id, reservation.Id, total-100)
	require.NoError(t, err)
	_, err = SettleTokenPlanRequest(user.Id, reservation.Id, total-100)
	require.NoError(t, err)
	status, err = GetTokenPlanStatus(user.Id, now)
	require.NoError(t, err)
	assert.EqualValues(t, total-100, status.UsedQuota)
	require.NoError(t, UpdateTokenPlanSettings(user.Id, walletFallback(true)))
	reservation, err = ReserveTokenPlanRequest(user.Id, account.TokenId, 200, now)
	require.NoError(t, err)
	assert.EqualValues(t, 100, reservation.FreeReserved)
	assert.EqualValues(t, 100, reservation.WalletReserved)
	profile, err := GetSelfUserById(user.Id)
	require.NoError(t, err)
	assert.Equal(t, 1000000, profile.Quota, "wallet reservations must not make displayed balance jump")
	// Disabled opt-in affects new requests, not a request already authorized.
	require.NoError(t, UpdateTokenPlanSettings(user.Id, walletFallback(false)))
	settled, err := SettleTokenPlanRequest(user.Id, reservation.Id, 150)
	require.NoError(t, err)
	assert.EqualValues(t, 100, settled.FreeUsed)
	assert.EqualValues(t, 50, settled.WalletUsed)
	assert.Positive(t, settled.SettledAt)
	// An old settlement date is immutable through idempotent retries/refunds.
	firstSettlement := now.Add(-48 * time.Hour).Unix()
	require.NoError(t, db.Model(settled).UpdateColumn("settled_at", firstSettlement).Error)
	profile, err = GetSelfUserById(user.Id)
	require.NoError(t, err)
	assert.Equal(t, 999950, profile.Quota)
	_, err = SettleTokenPlanRequest(user.Id, reservation.Id, 150)
	require.NoError(t, err)
	// Refund after a week boundary belongs to the original bucket and reverses
	// the original free/wallet split; the new week's allowance is untouched.
	_, err = SettleTokenPlanRequest(user.Id, reservation.Id, 0)
	require.NoError(t, err)
	var refunded TokenPlanReservation
	require.NoError(t, db.First(&refunded, reservation.Id).Error)
	assert.Equal(t, firstSettlement, refunded.SettledAt)
	profile, err = GetSelfUserById(user.Id)
	require.NoError(t, err)
	assert.Equal(t, 1000000, profile.Quota)
	status, err = GetTokenPlanStatus(user.Id, now.Add(time.Minute))
	require.NoError(t, err)
	assert.Zero(t, status.UsedQuota)
	assert.Equal(t, total, status.RemainingQuota)
	// An insufficient paid balance rolls back both reservations.
	require.NoError(t, UpdateTokenPlanSettings(user.Id, walletFallback(true)))
	_, err = ReserveTokenPlanRequest(user.Id, account.TokenId, total+1000001, now)
	assert.ErrorIs(t, err, ErrTokenPlanWalletInsufficient)
	// A pending request can grow or fail without creating a consumption entry.
	pending, err := ReserveTokenPlanRequest(user.Id, account.TokenId, 100, now)
	require.NoError(t, err)
	require.NoError(t, ResizeTokenPlanReservation(user.Id, pending.Id, 300))
	require.NoError(t, ResizeTokenPlanReservation(user.Id, pending.Id, 100))
	_, err = SettleTokenPlanRequest(user.Id, pending.Id, 0)
	require.NoError(t, err)
	assert.Error(t, UpdateTokenPlanSettings(user.Id+100, walletFallback(true)))
	_, err = SettleTokenPlanRequest(user.Id+100, reservation.Id, 0)
	assert.Error(t, err)
	// With continuation disabled, underestimated usage must never debit cash.
	require.NoError(t, UpdateTokenPlanSettings(user.Id, walletFallback(false)))
	pending, err = ReserveTokenPlanRequest(user.Id, account.TokenId, 1, now)
	require.NoError(t, err)
	settled, err = SettleTokenPlanRequest(user.Id, pending.Id, 101)
	require.NoError(t, err)
	assert.Zero(t, settled.WalletUsed)
	profile, err = GetSelfUserById(user.Id)
	require.NoError(t, err)
	assert.Equal(t, 1000000, profile.Quota)
	concurrent := User{Username: "plan-concurrent", AffCode: "plan-concurrent", Status: common.UserStatusEnabled, Quota: 100, UsedQuota: operation_setting.GetUsageLevelThresholds()[2], LevelQuota: operation_setting.GetUsageLevelThresholds()[2]}
	require.NoError(t, db.Create(&concurrent).Error)
	other, err := EnsureTokenPlanAccount(concurrent.Id)
	require.NoError(t, err)
	require.NoError(t, UpdateTokenPlanSettings(concurrent.Id, walletFallback(true)))
	require.NoError(t, db.Create(&TokenPlanWeek{UserId: concurrent.Id, WeekStart: TokenPlanWeekStart(now).Unix(), UsedQuota: total}).Error)
	results := make(chan *TokenPlanReservation, 6)
	failures := make(chan error, 6)
	var wg sync.WaitGroup
	for range 6 {
		wg.Go(func() {
			reservation, err := ReserveTokenPlanRequest(concurrent.Id, other.TokenId, 50, now)
			if err != nil {
				failures <- err
			} else {
				results <- reservation
			}
		})
	}
	wg.Wait()
	close(results)
	close(failures)
	assert.Len(t, results, 2, "concurrent paid holds must never exceed the wallet")
	for err := range failures {
		assert.ErrorIs(t, err, ErrTokenPlanWalletInsufficient)
	}
	for reservation := range results {
		_, err := SettleTokenPlanRequest(concurrent.Id, reservation.Id, 0)
		require.NoError(t, err)
	}
	profile, err = GetSelfUserById(concurrent.Id)
	require.NoError(t, err)
	assert.Equal(t, 100, profile.Quota)

}

// Runs against every fresh/upgrade database in the existing lifecycle matrix.
func exerciseTokenPlanResetCoupons(t *testing.T, db *gorm.DB, now time.Time) {
	admin := User{Username: "coupon-admin", AffCode: "coupon-admin", Role: common.RoleAdminUser, Status: common.UserStatusEnabled}
	user := User{Username: "coupon-user", AffCode: "coupon-user", Status: common.UserStatusEnabled, Quota: 1000, UsedQuota: operation_setting.GetUsageLevelThresholds()[2], LevelQuota: operation_setting.GetUsageLevelThresholds()[2]}
	lv0 := User{Username: "coupon-lv0", AffCode: "coupon-lv0", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(&admin).Error)
	require.NoError(t, db.Create(&user).Error)
	require.NoError(t, db.Create(&lv0).Error)
	account, err := EnsureTokenPlanAccount(user.Id)
	require.NoError(t, err)
	_, err = EnsureTokenPlanAccount(lv0.Id)
	require.NoError(t, err)
	grant := TokenPlanCouponGrant{RequestId: common.GetUUID(), Audience: "users", UserIds: []int{user.Id, lv0.Id}, Multiplier: 10, PerUser: 2, ExpiresAt: now.Unix() + 3600, Reason: "fixture"}
	_, err = CreateTokenPlanCouponBatch(user.Id, grant, now)
	require.Error(t, err, "a normal user cannot issue coupons")
	batch, err := CreateTokenPlanCouponBatch(admin.Id, grant, now)
	require.NoError(t, err)
	same, err := CreateTokenPlanCouponBatch(admin.Id, grant, now)
	require.NoError(t, err)
	assert.Equal(t, batch.Id, same.Id)
	batch, err = ContinueTokenPlanCouponBatch(batch.Id)
	require.NoError(t, err)
	assert.Equal(t, "complete", batch.Status)
	_, err = ContinueTokenPlanCouponBatch(batch.Id)
	require.NoError(t, err)
	coupons, count, err := ListTokenPlanCoupons(user.Id, 0, 0, 10, now)
	require.NoError(t, err)
	require.Len(t, coupons, 2)
	assert.EqualValues(t, 2, count)
	_, err = PreviewTokenPlanReset(lv0.Id, coupons[0].Id, now)
	require.Error(t, err, "ownership is checked")
	zero, _, err := ListTokenPlanCoupons(lv0.Id, 0, 0, 10, now)
	require.NoError(t, err)
	_, err = PreviewTokenPlanReset(lv0.Id, zero[0].Id, now)
	require.ErrorContains(t, err, "LV1")
	// Arrival notices cover owned, usable and unacknowledged coupons only.
	arrivals, err := ListPendingTokenPlanCoupons(user.Id, now)
	require.NoError(t, err)
	require.Len(t, arrivals, 2)
	foreign, err := ListPendingTokenPlanCoupons(lv0.Id, now)
	require.NoError(t, err)
	require.Len(t, foreign, 2)
	foreignSigned, err := AcknowledgeTokenPlanCoupons(lv0.Id, []int{coupons[0].Id}, now)
	require.NoError(t, err)
	assert.Zero(t, foreignSigned, "ownership is checked")
	signed, err := AcknowledgeTokenPlanCoupons(user.Id, []int{coupons[0].Id}, now)
	require.NoError(t, err)
	assert.EqualValues(t, 1, signed)
	signed, err = AcknowledgeTokenPlanCoupons(user.Id, []int{coupons[0].Id}, now.Add(time.Minute))
	require.NoError(t, err)
	assert.Zero(t, signed, "repeating the acknowledgement is a no-op")
	arrivals, err = ListPendingTokenPlanCoupons(user.Id, now)
	require.NoError(t, err)
	require.Len(t, arrivals, 1)
	assert.Equal(t, coupons[1].Id, arrivals[0].Id)
	// Signing for a coupon neither consumes it nor changes its state.
	stillListed, count, err := ListTokenPlanCoupons(user.Id, 0, 0, 10, now)
	require.NoError(t, err)
	require.Len(t, stillListed, 2)
	assert.EqualValues(t, 2, count)
	for _, item := range stillListed {
		assert.Equal(t, "available", item.Status)
	}
	reserved, err := ReserveTokenPlanRequest(user.Id, account.TokenId, 100, now)
	require.NoError(t, err)
	preview, err := PreviewTokenPlanReset(user.Id, coupons[0].Id, now)
	require.NoError(t, err)
	_, err = UseTokenPlanReset(user.Id, preview.Id, false, now)
	require.Error(t, err)
	_, err = TokenPlanResetOperationStatus(lv0.Id, preview.Id)
	require.Error(t, err)
	results := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Go(func() { _, err := UseTokenPlanReset(user.Id, preview.Id, true, now); results <- err })
	}
	wg.Wait()
	close(results)
	for err := range results {
		require.NoError(t, err)
	}
	result, err := TokenPlanResetOperationStatus(user.Id, preview.Id)
	require.NoError(t, err)
	assert.Equal(t, "succeeded", result.Status)
	status, err := GetTokenPlanStatus(user.Id, now)
	require.NoError(t, err)
	assert.True(t, status.PersonalCycle)
	assert.True(t, status.CouponCycle)
	assert.Equal(t, 10, status.Multiplier)
	assert.Equal(t, now.Unix()+tokenPlanCycleSeconds, status.ResetsAt)
	assert.EqualValues(t, 10*common.QuotaPerUnit, status.TotalQuota)
	assert.Zero(t, status.UsedQuota)
	// Old in-flight requests and a subsequent refund cannot touch the new cycle.
	_, err = SettleTokenPlanRequest(user.Id, reserved.Id, 120)
	require.NoError(t, err)
	_, err = SettleTokenPlanRequest(user.Id, reserved.Id, 0)
	require.NoError(t, err)
	current, err := GetTokenPlanStatus(user.Id, now)
	require.NoError(t, err)
	assert.Zero(t, current.UsedQuota)
	// Two distinct coupons in one second must still create different ledgers.
	second, err := PreviewTokenPlanReset(user.Id, coupons[1].Id, now)
	require.NoError(t, err)
	reset, err := UseTokenPlanReset(user.Id, second.Id, true, now)
	require.NoError(t, err)
	assert.NotEqual(t, result.WeekId, reset.WeekId)
	_, err = PreviewTokenPlanReset(user.Id, coupons[0].Id, now)
	require.Error(t, err)
	// A used coupon keeps its original expiry window until the cycle ends;
	// a subsequent lower tier replaces it rather than multiplying the grant.
	early, err := GetTokenPlanStatus(user.Id, now.Add(3599*time.Second))
	require.NoError(t, err)
	assert.Equal(t, 10, early.Multiplier)
	savedUsed := user.LevelQuota
	require.NoError(t, db.Model(&user).UpdateColumn("level_quota", operation_setting.GetUsageLevelThresholds()[3]).Error)
	raised, err := GetTokenPlanStatus(user.Id, now.Add(3599*time.Second))
	require.NoError(t, err)
	assert.EqualValues(t, 20*common.QuotaPerUnit, raised.TotalQuota)
	require.NoError(t, db.Model(&user).UpdateColumn("level_quota", savedUsed).Error)
	grant.RequestId = common.GetUUID()
	grant.Multiplier = 1
	grant.UserIds = []int{user.Id}
	grant.PerUser = 2
	batch, err = CreateTokenPlanCouponBatch(admin.Id, grant, now)
	require.NoError(t, err)
	_, err = ContinueTokenPlanCouponBatch(batch.Id)
	require.NoError(t, err)
	rows, _, err := ListTokenPlanCoupons(user.Id, batch.Id, 0, 10, now)
	require.NoError(t, err)
	require.NoError(t, UpdateTokenPlanSettings(user.Id, walletFallback(true)))
	boosted, err := ReserveTokenPlanRequest(user.Id, account.TokenId, int64(common.QuotaPerUnit*8), now)
	require.NoError(t, err)
	lower, err := PreviewTokenPlanReset(user.Id, rows[0].Id, now)
	require.NoError(t, err)
	assert.Equal(t, 10, lower.OldMultiplier)
	_, err = UseTokenPlanReset(user.Id, lower.Id, true, now)
	require.NoError(t, err)
	lowered, err := GetTokenPlanStatus(user.Id, now)
	require.NoError(t, err)
	assert.Equal(t, 1, lowered.Multiplier)
	assert.True(t, lowered.CouponCycle, "a standard coupon still has its own material")
	_, err = SettleTokenPlanRequest(user.Id, boosted.Id, int64(common.QuotaPerUnit*8))
	require.NoError(t, err)
	expired, err := PreviewTokenPlanReset(user.Id, rows[1].Id, now)
	require.NoError(t, err)
	_, err = UseTokenPlanReset(user.Id, expired.Id, true, now.Add(301*time.Second))
	require.Error(t, err, "preview expiry")
	_, err = PreviewTokenPlanReset(user.Id, rows[0].Id, now.Add(time.Hour))
	require.Error(t, err, "coupon expires exactly at its deadline")
	arrivals, err = ListPendingTokenPlanCoupons(user.Id, now.Add(time.Hour))
	require.NoError(t, err)
	assert.Empty(t, arrivals, "an expired coupon is no longer announced")
	require.NoError(t, VoidTokenPlanCouponBatch(batch.Id))
	_, err = PreviewTokenPlanReset(user.Id, rows[1].Id, now)
	require.Error(t, err, "voided coupon")
	// Voiding an already used coupon's batch does not reverse an active cycle.
	require.NoError(t, VoidTokenPlanCouponBatch(coupons[0].BatchId))
	var wallet User
	require.NoError(t, db.First(&wallet, user.Id).Error)
	assert.Equal(t, user.Quota, wallet.Quota)
	assert.Equal(t, user.UsedQuota, wallet.UsedQuota)
	credential, err := ReadTokenPlanCredential(user.Id)
	require.NoError(t, err)
	assert.Equal(t, account.MaskedKey, MaskTokenKey(credential))
	grant.RequestId = common.GetUUID()
	grant.Audience = "all"
	grant.UserIds = nil
	grant.PerUser = 1
	grant.Multiplier = 3
	ids, err := TokenPlanCouponRecipients(db, grant)
	require.NoError(t, err)
	grant.AudienceDigest = TokenPlanCouponAudienceDigest(ids)
	all, err := CreateTokenPlanCouponBatch(admin.Id, grant, now)
	require.NoError(t, err)
	var snapshot []int
	require.NoError(t, common.UnmarshalJsonStr(all.Recipients, &snapshot))
	assert.NotContains(t, snapshot, admin.Id)
	assert.Contains(t, snapshot, lv0.Id)
	late := User{Username: "coupon-after-snapshot", AffCode: "coupon-after-snapshot", Role: common.RoleCommonUser, Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(&late).Error)
	for all.Status == "issuing" {
		all, err = ContinueTokenPlanCouponBatch(all.Id)
		require.NoError(t, err)
	}
	_, n, err := ListTokenPlanCoupons(late.Id, 0, 0, 10, now)
	require.NoError(t, err)
	assert.Zero(t, n)
	atBoundary := now.Add(7 * 24 * time.Hour)
	status, err = GetTokenPlanStatus(user.Id, atBoundary)
	require.NoError(t, err)
	assert.Equal(t, 1, status.Multiplier)
	assert.EqualValues(t, common.QuotaPerUnit, status.TotalQuota)
	assert.Equal(t, atBoundary.Unix()+tokenPlanCycleSeconds, status.ResetsAt)
	assert.False(t, status.CouponCycle, "normal renewal expires the coupon material")
	_, err = tokenPlanCycleQuota(6, 999)
	require.Error(t, err)
}

// This fixture is exercised on every fresh/upgrade database in the existing
// lifecycle matrix. It checks read-only snapshots and ledger-based history.
func exerciseTokenPlanStatistics(t *testing.T, db *gorm.DB, now time.Time) {
	t.Helper()
	ctx := context.Background()
	thresholds := operation_setting.GetUsageLevelThresholds()
	users := []User{
		{Username: "stats-calendar", AffCode: "stats-calendar", Status: common.UserStatusEnabled, UsedQuota: thresholds[2], LevelQuota: thresholds[2]},
		{Username: "stats-coupon", AffCode: "stats-coupon", Status: common.UserStatusDisabled, UsedQuota: thresholds[3], LevelQuota: thresholds[3]},
		{Username: "stats-expired", AffCode: "stats-expired", Status: common.UserStatusEnabled, UsedQuota: thresholds[1], LevelQuota: thresholds[1]},
		{Username: "stats-new", AffCode: "stats-new", Status: common.UserStatusEnabled},
	}
	require.NoError(t, db.Create(&users).Error)
	calendar := TokenPlanWeekStart(now).Unix()
	weeks := []TokenPlanWeek{
		// Legacy calendar rows may have no explicit cycle_start/cycle_end.
		{UserId: users[0].Id, WeekStart: calendar, UsedQuota: 42, ReservedQuota: 9},
		{UserId: users[1].Id, WeekStart: -90001, CycleStart: now.Add(-time.Hour).Unix(), CycleEnd: now.Add(7*24*time.Hour - time.Hour).Unix(), Multiplier: 3, UsedQuota: 70, ReservedQuota: 11},
		{UserId: users[2].Id, WeekStart: -90002, CycleStart: now.Add(-8 * 24 * time.Hour).Unix(), CycleEnd: now.Add(-24 * time.Hour).Unix(), Multiplier: 10, UsedQuota: 999},
	}
	require.NoError(t, db.Create(&weeks).Error)
	accounts := []TokenPlanAccount{
		{UserId: users[0].Id, TokenId: 90001, KeyCiphertext: "must-not-leak", MaskedKey: "must-not-leak", CurrentWeekId: weeks[0].Id, WalletFallback: true},
		{UserId: users[1].Id, TokenId: 90002, KeyCiphertext: "must-not-leak", MaskedKey: "must-not-leak", CurrentWeekId: weeks[1].Id, CycleAnchor: weeks[1].CycleStart},
		{UserId: users[2].Id, TokenId: 90003, KeyCiphertext: "must-not-leak", MaskedKey: "must-not-leak", CurrentWeekId: weeks[2].Id, CycleAnchor: weeks[2].CycleStart},
	}
	require.NoError(t, db.Create(&accounts).Error)
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	facts := []TokenPlanReservation{
		{UserId: users[0].Id, WeekId: weeks[0].Id, Settled: true, SettledAt: start.Unix() - 1, ActualQuota: 15, FreeUsed: 10, WalletUsed: 5},
		{UserId: users[0].Id, WeekId: weeks[0].Id, Settled: true, SettledAt: start.Unix(), ActualQuota: 37, FreeUsed: 30, WalletUsed: 7},
		{UserId: users[0].Id, WeekId: weeks[0].Id, FreeReserved: 9, WalletReserved: 100, ReservedQuota: 109},
		{UserId: users[1].Id, WeekId: weeks[1].Id, Settled: true, SettledAt: start.Unix() + 86400, ActualQuota: 70, FreeUsed: 70},
		{UserId: users[0].Id, WeekId: weeks[0].Id, Settled: true, ActualQuota: 5, FreeUsed: 2, WalletUsed: 3},
		{UserId: users[2].Id, WeekId: weeks[2].Id, Settled: true, SettledAt: start.Unix() + 43200, ActualQuota: 17, WalletUsed: 17},
	}
	require.NoError(t, db.Create(&facts).Error)
	var beforeWeeks int64
	require.NoError(t, db.Model(&TokenPlanWeek{}).Count(&beforeWeeks).Error)
	rows, count, err := ListTokenPlanUsers(ctx, "stats-", 0, 0, 100, now)
	require.NoError(t, err)
	require.Len(t, rows, 4)
	assert.EqualValues(t, 4, count)
	indexed := make(map[int]TokenPlanUserUsage)
	for _, row := range rows {
		indexed[row.UserId] = row
	}
	assert.EqualValues(t, 42, indexed[users[0].Id].UsedQuota)
	assert.EqualValues(t, 9, indexed[users[0].Id].ReservedQuota)
	assert.EqualValues(t, 15, indexed[users[0].Id].WalletUsedQuota)
	assert.EqualValues(t, calendar, indexed[users[0].Id].WeekStart)
	assert.EqualValues(t, calendar+tokenPlanCycleSeconds, indexed[users[0].Id].ResetsAt)
	assert.EqualValues(t, common.QuotaPerUnit-42, indexed[users[0].Id].RemainingQuota)
	assert.Equal(t, 3, indexed[users[1].Id].Multiplier)
	assert.True(t, indexed[users[1].Id].CouponCycle)
	assert.EqualValues(t, common.QuotaPerUnit*6, indexed[users[1].Id].TotalQuota)
	expired := indexed[users[2].Id]
	assert.Equal(t, 1, expired.Multiplier)
	assert.Zero(t, expired.UsedQuota)
	assert.Zero(t, expired.WalletUsedQuota, "late settlement of an old cycle must not enter the current cycle")
	lateTrend, err := GetTokenPlanUsageTrend(ctx, start, start.AddDate(0, 0, 1), users[2].Id)
	require.NoError(t, err)
	assert.EqualValues(t, 17, lateTrend.Total.WalletUsed)
	assert.True(t, expired.PersonalCycle)
	assert.False(t, expired.CouponCycle)
	assert.Equal(t, weeks[2].CycleEnd, expired.WeekStart)
	assert.False(t, indexed[users[3].Id].Activated)
	assert.Zero(t, indexed[users[3].Id].TotalQuota)
	for _, at := range []time.Time{time.Unix(weeks[1].CycleEnd, 0), now.Add(22 * 24 * time.Hour)} {
		later, _, err := ListTokenPlanUsers(ctx, "stats-coupon", 0, 0, 1, at)
		require.NoError(t, err)
		require.Len(t, later, 1)
		assert.Equal(t, 1, later[0].Multiplier)
		assert.Zero(t, later[0].UsedQuota)
	}
	page, _, err := ListTokenPlanUsers(ctx, "stats-", 0, 1, 1, now)
	require.NoError(t, err)
	require.Len(t, page, 1)
	assert.Equal(t, users[2].Id, page[0].UserId)
	byId, count, err := ListTokenPlanUsers(ctx, strconv.Itoa(users[1].Id), 0, 0, 100, now)
	require.NoError(t, err)
	assert.EqualValues(t, 1, count)
	require.Len(t, byId, 1)
	all, total, err := ListTokenPlanUsers(ctx, "", 0, 0, 100, now)
	require.NoError(t, err)
	require.EqualValues(t, len(all), total)
	// A minimum level drops accounts that never consumed quota, and the total
	// counts only the rows the filter admits.
	filtered, filteredTotal, err := ListTokenPlanUsers(ctx, "stats-", 1, 0, 100, now)
	require.NoError(t, err)
	require.Len(t, filtered, 3)
	assert.EqualValues(t, 3, filteredTotal)
	for _, row := range filtered {
		assert.NotEqual(t, users[3].Id, row.UserId, "a zero-usage account is below LV1")
		assert.NotZero(t, row.Level)
	}
	overview, err := GetTokenPlanOverview(ctx, now)
	require.NoError(t, err)
	expected := TokenPlanOverview{Users: total, AsOf: now.Unix()}
	for _, row := range all {
		if row.Activated {
			expected.ActivatedUsers++
		}
		expected.TotalQuota += row.TotalQuota
		expected.UsedQuota += row.UsedQuota
		expected.ReservedQuota += row.ReservedQuota
		expected.RemainingQuota += row.RemainingQuota
		expected.WalletUsedQuota += row.WalletUsedQuota
	}
	assert.Equal(t, expected, *overview)
	trend, err := GetTokenPlanUsageTrend(ctx, start.AddDate(0, 0, -1), start.AddDate(0, 0, 3), users[0].Id)
	require.NoError(t, err)
	require.Len(t, trend.Days, 4)
	assert.Equal(t, start.AddDate(0, 0, -1).Format(time.DateOnly), trend.Days[0].Date)
	require.NotNil(t, trend.Days[0].FreeUsed)
	assert.EqualValues(t, 10, *trend.Days[0].FreeUsed)
	assert.EqualValues(t, 30, *trend.Days[1].FreeUsed)
	assert.Nil(t, trend.Days[2].FreeUsed, "no dated facts must not be displayed as zero consumption")
	assert.Equal(t, TokenPlanUsageTotals{Requests: 2, FreeUsed: 40, WalletUsed: 12}, trend.Total)
	assert.Equal(t, TokenPlanUsageTotals{Requests: 1, FreeUsed: 2, WalletUsed: 3}, trend.Undated)
	// An adjustment of an older cycle must not appear in the new cycle. Its
	// net daily fact remains on the original settlement date.
	_, err = SettleTokenPlanRequest(users[0].Id, facts[1].Id, 0)
	require.NoError(t, err)
	trend, err = GetTokenPlanUsageTrend(ctx, start, start.AddDate(0, 0, 1), users[0].Id)
	require.NoError(t, err)
	require.NotNil(t, trend.Days[0].FreeUsed)
	assert.Zero(t, *trend.Days[0].FreeUsed)
	assert.Zero(t, trend.Total.FreeUsed)
	var afterWeeks int64
	require.NoError(t, db.Model(&TokenPlanWeek{}).Count(&afterWeeks).Error)
	assert.Equal(t, beforeWeeks, afterWeeks, "statistics must not materialize expired or missing ledgers")
	var saved TokenPlanAccount
	require.NoError(t, db.First(&saved, accounts[2].Id).Error)
	assert.Equal(t, weeks[2].Id, saved.CurrentWeekId)
	refundedLegacy, err := SettleTokenPlanRequest(users[0].Id, facts[4].Id, 0)
	require.NoError(t, err)
	assert.Zero(t, refundedLegacy.SettledAt, "correcting legacy usage must not invent a settlement date")
	data, err := common.Marshal(rows)
	require.NoError(t, err)
	for _, secret := range []string{"must-not-leak", "token_id", "masked_key", "key_ciphertext"} {
		assert.NotContains(t, string(data), secret)
	}
	require.NoError(t, db.Delete(&users[3]).Error)
	_, count, err = ListTokenPlanUsers(ctx, "stats-new", 0, 0, 100, now)
	require.NoError(t, err)
	assert.Zero(t, count)
}

// Single-switch settings fixtures: leaving a field nil must keep its stored
// value, which is what these patches assert.
func walletFallback(enabled bool) TokenPlanSettings {
	return TokenPlanSettings{WalletFallback: &enabled}
}

func autoCoupons(enabled bool) TokenPlanSettings {
	return TokenPlanSettings{AutoResetCoupon: &enabled}
}

// consumeTokenPlanReservation settles a reservation at its reserved amount so
// the cycle actually reaches its ceiling instead of merely holding a place.
func consumeTokenPlanReservation(t *testing.T, userId int, reservation *TokenPlanReservation) {
	t.Helper()
	_, err := SettleTokenPlanRequest(userId, reservation.Id, reservation.ReservedQuota)
	require.NoError(t, err)
}

// Runs against every fresh/upgrade database in the existing lifecycle matrix.
func exerciseTokenPlanAutoCoupons(t *testing.T, db *gorm.DB, now time.Time) {
	thresholds := operation_setting.GetUsageLevelThresholds()
	user := User{Username: "auto-user", AffCode: "auto-user", Status: common.UserStatusEnabled, Quota: 1000, UsedQuota: thresholds[2], LevelQuota: thresholds[2]}
	lv0 := User{Username: "auto-lv0", AffCode: "auto-lv0", Status: common.UserStatusEnabled}
	bare := User{Username: "auto-bare", AffCode: "auto-bare", Status: common.UserStatusEnabled, Quota: 1000, UsedQuota: thresholds[2], LevelQuota: thresholds[2]}
	require.NoError(t, db.Create(&user).Error)
	require.NoError(t, db.Create(&lv0).Error)
	require.NoError(t, db.Create(&bare).Error)
	account, err := EnsureTokenPlanAccount(user.Id)
	require.NoError(t, err)
	lv0Account, err := EnsureTokenPlanAccount(lv0.Id)
	require.NoError(t, err)
	bareAccount, err := EnsureTokenPlanAccount(bare.Id)
	require.NoError(t, err)
	// An earlier expiry wins even with a higher multiplier; equal expiries
	// prefer the lower multiplier.
	coupons := []TokenPlanResetCoupon{
		{BatchId: 9101, UserId: user.Id, Ordinal: 0, Multiplier: 1, ExpiresAt: now.Unix() + 1800, Status: "available"},
		{BatchId: 9102, UserId: user.Id, Ordinal: 0, Multiplier: 10, ExpiresAt: now.Unix() + 600, Status: "available"},
		{BatchId: 9103, UserId: user.Id, Ordinal: 0, Multiplier: 3, ExpiresAt: now.Unix() + 600, Status: "available"},
		{BatchId: 9104, UserId: lv0.Id, Ordinal: 0, Multiplier: 3, ExpiresAt: now.Unix() + 3600, Status: "available"},
	}
	require.NoError(t, db.Create(&coupons).Error)
	status, err := GetTokenPlanStatus(user.Id, now)
	require.NoError(t, err)
	assert.False(t, status.AutoResetCoupon, "automatic coupon use is opt-in")
	total := status.TotalQuota
	// Disabled by default: an exhausted cycle refuses instead of spending.
	full, err := ReserveTokenPlanRequest(user.Id, account.TokenId, total, now)
	require.NoError(t, err)
	consumeTokenPlanReservation(t, user.Id, full)
	_, err = ReserveTokenPlanRequest(user.Id, account.TokenId, 1, now)
	assert.ErrorIs(t, err, ErrTokenPlanExhausted)
	listed, _, err := ListTokenPlanCoupons(user.Id, 0, 0, 10, now)
	require.NoError(t, err)
	for _, coupon := range listed {
		assert.Equal(t, "available", coupon.Status)
	}
	// Reserved capacity is not consumption: a cycle that is only fully held
	// refuses the request instead of spending a coupon.
	reservedUser := User{Username: "auto-reserved", AffCode: "auto-reserved", Status: common.UserStatusEnabled, UsedQuota: thresholds[2], LevelQuota: thresholds[2]}
	require.NoError(t, db.Create(&reservedUser).Error)
	reservedAccount, err := EnsureTokenPlanAccount(reservedUser.Id)
	require.NoError(t, err)
	require.NoError(t, UpdateTokenPlanSettings(reservedUser.Id, autoCoupons(true)))
	require.NoError(t, db.Create(&TokenPlanResetCoupon{BatchId: 9301, UserId: reservedUser.Id, Ordinal: 0, Multiplier: 3, ExpiresAt: now.Unix() + 3600, Status: "available"}).Error)
	require.NoError(t, db.Create(&TokenPlanWeek{UserId: reservedUser.Id, WeekStart: TokenPlanWeekStart(now).Unix(), UsedQuota: total - 100, ReservedQuota: 100}).Error)
	_, err = ReserveTokenPlanRequest(reservedUser.Id, reservedAccount.TokenId, 1, now)
	assert.ErrorIs(t, err, ErrTokenPlanExhausted)
	heldCoupon := TokenPlanResetCoupon{}
	require.NoError(t, db.Where("user_id = ?", reservedUser.Id).First(&heldCoupon).Error)
	assert.Equal(t, "available", heldCoupon.Status, "a pending hold must not spend a coupon")
	require.NoError(t, UpdateTokenPlanSettings(user.Id, autoCoupons(true)))
	// Saving one switch must not clear the other.
	status, err = GetTokenPlanStatus(user.Id, now)
	require.NoError(t, err)
	assert.True(t, status.AutoResetCoupon)
	assert.False(t, status.WalletFallback)
	// The next request spends the earliest-expiring, lowest-tier coupon and
	// continues in the new personal cycle.
	first, err := ReserveTokenPlanRequest(user.Id, account.TokenId, 10, now)
	require.NoError(t, err)
	assert.NotEqual(t, full.WeekId, first.WeekId)
	require.NoError(t, db.First(&coupons[2], coupons[2].Id).Error)
	assert.Equal(t, "used", coupons[2].Status)
	assert.Equal(t, now.Unix(), coupons[2].UsedAt)
	assert.Equal(t, first.WeekId, coupons[2].WeekId)
	status, err = GetTokenPlanStatus(user.Id, now)
	require.NoError(t, err)
	assert.True(t, status.CouponCycle)
	assert.Equal(t, 3, status.Multiplier)
	assert.EqualValues(t, 3*total, status.TotalQuota)
	var oldWeek TokenPlanWeek
	require.NoError(t, db.First(&oldWeek, full.WeekId).Error)
	assert.EqualValues(t, total, oldWeek.UsedQuota, "the old cycle keeps its consumption")
	operation := TokenPlanResetOperation{}
	require.NoError(t, db.Where("coupon_id = ?", coupons[2].Id).First(&operation).Error)
	assert.True(t, operation.Auto)
	assert.Equal(t, "succeeded", operation.Status)
	assert.Equal(t, first.WeekId, operation.WeekId)
	_, err = SettleTokenPlanRequest(user.Id, first.Id, 0)
	require.NoError(t, err)
	// The next empty cycle takes the remaining earliest coupon.
	full, err = ReserveTokenPlanRequest(user.Id, account.TokenId, 3*total, now)
	require.NoError(t, err)
	consumeTokenPlanReservation(t, user.Id, full)
	second, err := ReserveTokenPlanRequest(user.Id, account.TokenId, 1, now)
	require.NoError(t, err)
	require.NoError(t, db.First(&coupons[1], coupons[1].Id).Error)
	assert.Equal(t, "used", coupons[1].Status)
	status, err = GetTokenPlanStatus(user.Id, now)
	require.NoError(t, err)
	assert.Equal(t, 10, status.Multiplier)
	assert.EqualValues(t, 10*total, status.TotalQuota)
	_, err = SettleTokenPlanRequest(user.Id, second.Id, 0)
	require.NoError(t, err)
	full, err = ReserveTokenPlanRequest(user.Id, account.TokenId, 10*total, now)
	require.NoError(t, err)
	consumeTokenPlanReservation(t, user.Id, full)
	third, err := ReserveTokenPlanRequest(user.Id, account.TokenId, 1, now)
	require.NoError(t, err)
	require.NoError(t, db.First(&coupons[0], coupons[0].Id).Error)
	assert.Equal(t, "used", coupons[0].Status)
	_, err = SettleTokenPlanRequest(user.Id, third.Id, 0)
	require.NoError(t, err)
	// A natural calendar rollover has quota of its own, so no coupon is spent.
	fresh := TokenPlanResetCoupon{BatchId: 9105, UserId: user.Id, Ordinal: 0, Multiplier: 5, ExpiresAt: now.Unix() + 30*24*3600, Status: "available"}
	require.NoError(t, db.Create(&fresh).Error)
	later := now.Add(7 * 24 * time.Hour)
	rolled, err := ReserveTokenPlanRequest(user.Id, account.TokenId, 1, later)
	require.NoError(t, err)
	require.NoError(t, db.First(&fresh, fresh.Id).Error)
	assert.Equal(t, "available", fresh.Status)
	rolledStatus, err := GetTokenPlanStatus(user.Id, later)
	require.NoError(t, err)
	assert.Equal(t, 1, rolledStatus.Multiplier)
	assert.False(t, rolledStatus.CouponCycle)
	_, err = SettleTokenPlanRequest(user.Id, rolled.Id, 0)
	require.NoError(t, err)
	// An admission the fresh cycle cannot hold is refused without spending it.
	full, err = ReserveTokenPlanRequest(user.Id, account.TokenId, total, later)
	require.NoError(t, err)
	consumeTokenPlanReservation(t, user.Id, full)
	_, err = ReserveTokenPlanRequest(user.Id, account.TokenId, 100*total, later)
	assert.ErrorIs(t, err, ErrTokenPlanExhausted)
	require.NoError(t, db.First(&fresh, fresh.Id).Error)
	assert.Equal(t, "available", fresh.Status, "a rolled back admission keeps its coupon")
	// Coupons are spent before the balance even when continuation is enabled.
	require.NoError(t, UpdateTokenPlanSettings(user.Id, TokenPlanSettings{WalletFallback: common.GetPointer(true)}))
	paid, err := ReserveTokenPlanRequest(user.Id, account.TokenId, 1, later)
	require.NoError(t, err)
	assert.Zero(t, paid.WalletReserved)
	require.NoError(t, db.First(&fresh, fresh.Id).Error)
	assert.Equal(t, "used", fresh.Status)
	balance, err := GetUserQuota(user.Id, false)
	require.NoError(t, err)
	assert.Equal(t, 1000, balance)
	// LV0 has no allowance to reset, so its coupon stays unspent.
	require.NoError(t, UpdateTokenPlanSettings(lv0.Id, autoCoupons(true)))
	_, err = ReserveTokenPlanRequest(lv0.Id, lv0Account.TokenId, 1, now)
	assert.ErrorIs(t, err, ErrTokenPlanExhausted)
	lv0Coupons, _, err := ListTokenPlanCoupons(lv0.Id, 0, 0, 10, now)
	require.NoError(t, err)
	require.Len(t, lv0Coupons, 1)
	assert.Equal(t, "available", lv0Coupons[0].Status)
	// Without a coupon the opt-in falls back to continuation or refusal.
	require.NoError(t, UpdateTokenPlanSettings(bare.Id, autoCoupons(true)))
	full, err = ReserveTokenPlanRequest(bare.Id, bareAccount.TokenId, total, now)
	require.NoError(t, err)
	consumeTokenPlanReservation(t, bare.Id, full)
	_, err = ReserveTokenPlanRequest(bare.Id, bareAccount.TokenId, 1, now)
	assert.ErrorIs(t, err, ErrTokenPlanExhausted)
	require.NoError(t, UpdateTokenPlanSettings(bare.Id, walletFallback(true)))
	continued, err := ReserveTokenPlanRequest(bare.Id, bareAccount.TokenId, 1, now)
	require.NoError(t, err)
	assert.EqualValues(t, 1, continued.WalletReserved)
	// Concurrent requests spend one coupon and share its new cycle.
	racer := User{Username: "auto-racer", AffCode: "auto-racer", Status: common.UserStatusEnabled, UsedQuota: thresholds[2], LevelQuota: thresholds[2]}
	require.NoError(t, db.Create(&racer).Error)
	racerAccount, err := EnsureTokenPlanAccount(racer.Id)
	require.NoError(t, err)
	require.NoError(t, UpdateTokenPlanSettings(racer.Id, autoCoupons(true)))
	require.NoError(t, db.Create(&TokenPlanResetCoupon{BatchId: 9201, UserId: racer.Id, Ordinal: 0, Multiplier: 1, ExpiresAt: now.Unix() + 3600, Status: "available"}).Error)
	require.NoError(t, db.Create(&TokenPlanWeek{UserId: racer.Id, WeekStart: TokenPlanWeekStart(now).Unix(), UsedQuota: total}).Error)
	results := make(chan *TokenPlanReservation, 2)
	failures := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Go(func() {
			reservation, err := ReserveTokenPlanRequest(racer.Id, racerAccount.TokenId, total/2, now)
			if err != nil {
				failures <- err
				return
			}
			results <- reservation
		})
	}
	wg.Wait()
	close(results)
	close(failures)
	assert.Len(t, results, 2)
	assert.Empty(t, failures)
	var usedCoupons, racerWeeks int64
	require.NoError(t, db.Model(&TokenPlanResetCoupon{}).Where("user_id = ? AND status = ?", racer.Id, "used").Count(&usedCoupons).Error)
	assert.EqualValues(t, 1, usedCoupons, "one exhaustion must not spend two coupons")
	require.NoError(t, db.Model(&TokenPlanWeek{}).Where("user_id = ?", racer.Id).Count(&racerWeeks).Error)
	assert.EqualValues(t, 2, racerWeeks, "one calendar bucket plus one coupon cycle")
}
