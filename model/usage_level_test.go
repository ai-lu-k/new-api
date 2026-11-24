package model

import (
	"fmt"
	"os"
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

// Every level-ledger behaviour must hold on all three supported engines, so the
// fixtures below run against a real instance of each (MySQL and PostgreSQL are
// skipped when no DSN is configured).
var usageLevelEngines = []string{"sqlite", "mysql", "postgres"}

func openUsageLevelTestDB(t *testing.T, engine string, prefix string) *gorm.DB {
	t.Helper()
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
	default:
		t.Fatalf("unknown engine %q", engine)
	}
	db, err := gorm.Open(driver, &gorm.Config{
		NamingStrategy: schema.NamingStrategy{TablePrefix: prefix},
		Logger:         logger.Default.LogMode(logger.Silent),
	})
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
	models := []any{&User{}, &Checkin{}, &Redemption{}, &CampaignAward{}, &RegistrationReward{}, &TokenPlanReservation{}, &GiftConsumptionDaily{}, &Log{}, &Option{}}
	t.Cleanup(func() {
		_ = db.Migrator().DropTable(models...)
		_ = sqlDB.Close()
		DB, LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		initCol()
		common.RedisEnabled, common.BatchUpdateEnabled = previousRedis, previousBatch
	})
	require.NoError(t, db.Migrator().DropTable(models...))
	require.NoError(t, db.AutoMigrate(models...))
	return db
}

// loadGiftConsumedToday reads the single daily gift-spend row a settlement
// writes, so a missing upsert fails the test instead of quietly reporting zero.
func loadGiftConsumedToday(t *testing.T, db *gorm.DB) int64 {
	t.Helper()
	var rows []GiftConsumptionDaily
	require.NoError(t, db.Find(&rows).Error)
	require.Len(t, rows, 1, "one row per user and Asia/Shanghai day")
	assert.Equal(t, time.Now().In(financeDayLocation).Format("2006-01-02"), rows[0].DayKey)
	return rows[0].Quota
}

func loadUsageLedgers(t *testing.T, db *gorm.DB, id int) User {
	t.Helper()
	var user User
	require.NoError(t, db.Select("id", "quota", "used_quota", "level_quota", "bonus_quota", "request_count").First(&user, id).Error)
	return user
}

// TestUsageLevelGiftLedger covers the spend order and the refund rule that the
// two new columns exist for: gifted balance is spent first, only the remainder
// reaches the level ledger, and a refund gives back paid consumption only.
func TestUsageLevelGiftLedger(t *testing.T) {
	for i, engine := range usageLevelEngines {
		t.Run(engine, func(t *testing.T) {
			db := openUsageLevelTestDB(t, engine, fmt.Sprintf("ul_gift_%d_", i))
			user := User{Username: "gift-ledger", Status: common.UserStatusEnabled}
			require.NoError(t, db.Create(&user).Error)

			// A check-in, code, prize or reward arrives: the wallet grows and the
			// money is marked as gift, so the level stays where it was.
			require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
				return CreditGiftQuota(tx, user.Id, 1000)
			}))
			ledgers := loadUsageLedgers(t, db, user.Id)
			assert.Equal(t, 1000, ledgers.Quota)
			assert.Equal(t, 1000, ledgers.BonusQuota)
			assert.Zero(t, ledgers.LevelQuota)

			// Gift balance is spent first.
			updateUserUsedQuotaAndRequestCount(user.Id, 400, 1)
			ledgers = loadUsageLedgers(t, db, user.Id)
			assert.Equal(t, 400, ledgers.UsedQuota)
			assert.Equal(t, 600, ledgers.BonusQuota)
			assert.Zero(t, ledgers.LevelQuota, "spending gift money must not buy level progress")
			assert.Equal(t, 1, ledgers.RequestCount)
			assert.EqualValues(t, 400, loadGiftConsumedToday(t, db), "the gift part of the charge is recorded per day")

			// Only what exceeds the gift balance counts toward the level.
			updateUserUsedQuotaAndRequestCount(user.Id, 700, 1)
			ledgers = loadUsageLedgers(t, db, user.Id)
			assert.Equal(t, 1100, ledgers.UsedQuota)
			assert.Zero(t, ledgers.BonusQuota)
			assert.Equal(t, 100, ledgers.LevelQuota)
			assert.EqualValues(t, 1000, loadGiftConsumedToday(t, db), "the same day keeps adding up in one row")

			// A refund only lowers the statistics counter: the level never falls
			// and the gift side is not restored either.
			updateUserUsedQuotaAndRequestCount(user.Id, -30, 0)
			ledgers = loadUsageLedgers(t, db, user.Id)
			assert.Equal(t, 1070, ledgers.UsedQuota)
			assert.Zero(t, ledgers.BonusQuota)
			assert.Equal(t, 100, ledgers.LevelQuota, "a refund must never lower the level")

			// A later gift stays gift, and a later refund still leaves both
			// ledgers alone.
			require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
				return CreditGiftQuota(tx, user.Id, 40)
			}))
			updateUserUsedQuotaAndRequestCount(user.Id, -10, 0)
			ledgers = loadUsageLedgers(t, db, user.Id)
			assert.Equal(t, 40, ledgers.BonusQuota, "a refund must not turn into gift balance")
			assert.Equal(t, 100, ledgers.LevelQuota)

			// Even a refund larger than everything charged leaves the level
			// untouched.
			updateUserUsedQuotaAndRequestCount(user.Id, -500, 0)
			ledgers = loadUsageLedgers(t, db, user.Id)
			assert.Equal(t, 560, ledgers.UsedQuota)
			assert.Equal(t, 40, ledgers.BonusQuota)
			assert.Equal(t, 100, ledgers.LevelQuota)
			assert.EqualValues(t, 1000, loadGiftConsumedToday(t, db), "a refund never edits the gift ledger")
		})
	}
}

// TestUsageLevelBatchFlushKeepsLedgers protects the deferred update queue: the
// queued delta must reach used_quota and the level ledgers in one flush.
func TestUsageLevelBatchFlushKeepsLedgers(t *testing.T) {
	db := openUsageLevelTestDB(t, "sqlite", "ul_batch_")
	user := User{Username: "batch-ledger", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(&user).Error)
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		return CreditGiftQuota(tx, user.Id, 100)
	}))

	common.BatchUpdateEnabled = true
	t.Cleanup(func() { common.BatchUpdateEnabled = false })
	UpdateUserUsedQuotaAndRequestCount(user.Id, 250)
	assert.Zero(t, loadUsageLedgers(t, db, user.Id).LevelQuota, "a queued charge is not applied yet")

	batchUpdate()
	ledgers := loadUsageLedgers(t, db, user.Id)
	assert.Equal(t, 250, ledgers.UsedQuota)
	assert.Zero(t, ledgers.BonusQuota)
	assert.Equal(t, 150, ledgers.LevelQuota)
	assert.Equal(t, 1, ledgers.RequestCount)
}

// TestUsageLevelGiftExclusionMigration protects the one-time backfill: existing
// levels are preserved, the still-unspent gift balance is estimated from the
// recorded sources, and a second startup changes nothing.
func TestUsageLevelGiftExclusionMigration(t *testing.T) {
	for i, engine := range usageLevelEngines {
		t.Run(engine, func(t *testing.T) {
			db := openUsageLevelTestDB(t, engine, fmt.Sprintf("ul_migrate_%d_", i))
			now := time.Unix(1_800_000_000, 0)
			// spender: 600000 consumed, 100000 of it covered by the free plan, and
			// 50000 of check-in gifts that were already spent.
			spender := User{Username: "migrate-spender", AffCode: "migrate-spender-aff", Status: common.UserStatusEnabled, Quota: 0, UsedQuota: 600000}
			// gift-heavy: 30000 consumed after 40000 of check-in gifts and a
			// 5000 prize; 15000 of the gifts is still unspent.
			giftHeavy := User{Username: "migrate-gift", AffCode: "migrate-gift-aff", Status: common.UserStatusEnabled, Quota: 20000, UsedQuota: 30000}
			// wallet-short: gifts recorded beyond what is left in the wallet.
			walletShort := User{Username: "migrate-short", AffCode: "migrate-short-aff", Status: common.UserStatusEnabled, Quota: 5000, UsedQuota: 20000}
			// rewarded: a released registration reward that was never spent.
			rewarded := User{Username: "migrate-reward", AffCode: "migrate-reward-aff", Status: common.UserStatusEnabled, Quota: 20000, UsedQuota: 0}
			for _, user := range []*User{&spender, &giftHeavy, &walletShort, &rewarded} {
				require.NoError(t, db.Create(user).Error)
			}
			require.NoError(t, db.Create(&Checkin{UserId: spender.Id, CheckinDate: "2026-01-01", QuotaAwarded: 50000}).Error)
			require.NoError(t, db.Create(&Checkin{UserId: giftHeavy.Id, CheckinDate: "2026-01-01", QuotaAwarded: 40000}).Error)
			require.NoError(t, db.Create(&CampaignAward{ParticipantId: 1, UserId: giftHeavy.Id, Kind: "solve", ChallengeId: "c1", Quota: 5000, CreatedAt: now.Unix()}).Error)
			require.NoError(t, db.Create(&Redemption{UserId: walletShort.Id, Key: "migrate-code", Status: common.RedemptionCodeStatusUsed, Quota: 90000, UsedUserId: walletShort.Id}).Error)
			require.NoError(t, db.Create(&RegistrationReward{UserId: rewarded.Id, SignupQuota: 20000, IssuedAt: now.Unix()}).Error)
			require.NoError(t, db.Create(&TokenPlanReservation{UserId: spender.Id, WeekId: 1, FreeUsed: 100000, Settled: true, SettledAt: now.Unix()}).Error)

			require.NoError(t, MigrateUsageLevelGiftExclusion(db))
			// level_quota keeps every level: no existing account drops.
			for id, used := range map[int]int{spender.Id: 600000, giftHeavy.Id: 30000, walletShort.Id: 20000, rewarded.Id: 0} {
				ledgers := loadUsageLedgers(t, db, id)
				assert.Equal(t, used, ledgers.LevelQuota)
				assert.Equal(t, CalculateUsageLevel(used, operation_setting.GetUsageLevelThresholds()).Level,
					CalculateUsageLevel(ledgers.LevelQuota, operation_setting.GetUsageLevelThresholds()).Level)
			}
			assert.Zero(t, loadUsageLedgers(t, db, spender.Id).BonusQuota, "gifts already spent are not re-created")
			// 40000 + 5000 gifts - 30000 spent = 15000 left.
			assert.Equal(t, 15000, loadUsageLedgers(t, db, giftHeavy.Id).BonusQuota)
			// 90000 gifts - 20000 spent = 70000, but the wallet only holds 5000.
			assert.Equal(t, 5000, loadUsageLedgers(t, db, walletShort.Id).BonusQuota)
			assert.Equal(t, 20000, loadUsageLedgers(t, db, rewarded.Id).BonusQuota)

			var marker Option
			require.NoError(t, db.Where(&Option{Key: UsageLevelGiftExclusionMigrationKey}).First(&marker).Error)
			assert.Equal(t, "true", marker.Value)

			// A second startup must not re-add gifts or reseed the level.
			require.NoError(t, db.Model(&User{}).Where("id = ?", rewarded.Id).UpdateColumn("bonus_quota", 7).Error)
			require.NoError(t, db.Model(&User{}).Where("id = ?", spender.Id).UpdateColumn("level_quota", 11).Error)
			// The marker short-circuits the aggregates, so a source table that no
			// longer exists cannot break a later startup.
			require.NoError(t, db.Migrator().DropTable(&Checkin{}))
			require.NoError(t, MigrateUsageLevelGiftExclusion(db))
			assert.Equal(t, 7, loadUsageLedgers(t, db, rewarded.Id).BonusQuota)
			assert.Equal(t, 11, loadUsageLedgers(t, db, spender.Id).LevelQuota)
		})
	}
}

// TestUsageLevelManualAdjustments keeps administrator balance edits honest: a
// gift addition and an override that raises the balance hand out money without
// a payment, so neither may buy level progress.
func TestUsageLevelManualAdjustments(t *testing.T) {
	db := openUsageLevelTestDB(t, "sqlite", "ul_adjust_")
	user := User{Username: "adjust-ledger", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(&user).Error)

	_, err := AdjustUserQuota(user.Id, common.RoleRootUser, "add", 1000, QuotaAddReasonGift)
	require.NoError(t, err)
	ledgers := loadUsageLedgers(t, db, user.Id)
	assert.Equal(t, 1000, ledgers.BonusQuota, "a gift addition is not the user's own money")

	_, err = AdjustUserQuota(user.Id, common.RoleRootUser, "add", 2000, QuotaAddReasonOfflinePayment)
	require.NoError(t, err)
	assert.Equal(t, 1000, loadUsageLedgers(t, db, user.Id).BonusQuota, "a recorded payment is not a gift")

	_, err = AdjustUserQuota(user.Id, common.RoleRootUser, "override", 5000, "")
	require.NoError(t, err)
	ledgers = loadUsageLedgers(t, db, user.Id)
	assert.Equal(t, 5000, ledgers.Quota)
	assert.Equal(t, 3000, ledgers.BonusQuota, "raising the balance by override is a gift too")

	_, err = AdjustUserQuota(user.Id, common.RoleRootUser, "subtract", 1000, "")
	require.NoError(t, err)
	ledgers = loadUsageLedgers(t, db, user.Id)
	assert.Equal(t, 4000, ledgers.Quota)
	assert.Equal(t, 2000, ledgers.BonusQuota, "a deduction shrinks the gift side first")
}
