package model

import (
	"fmt"
	"os"
	"testing"

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

func insertUsersForPaginationTest(t *testing.T, total int) {
	t.Helper()
	for id := 1; id <= total; id++ {
		user := &User{
			Id:          id,
			Username:    fmt.Sprintf("user%02d", id),
			Password:    "password123",
			DisplayName: fmt.Sprintf("User %02d", id),
			Email:       fmt.Sprintf("user%02d@example.com", id),
			Role:        common.RoleCommonUser,
			Status:      common.UserStatusEnabled,
			Group:       "default",
			AffCode:     fmt.Sprintf("aff%02d", id),
		}
		require.NoError(t, DB.Create(user).Error)
	}
}

func collectUserIDs(users []*User) []int {
	ids := make([]int, 0, len(users))
	for _, user := range users {
		ids = append(ids, user.Id)
	}
	return ids
}

func TestGetAllUsersSortsBeforePagination(t *testing.T) {
	truncateTables(t)
	insertUsersForPaginationTest(t, 42)

	pageOne, total, err := GetAllUsers(&common.PageInfo{Page: 1, PageSize: 20}, NewUserSortOptions("id", "asc"))
	require.NoError(t, err)
	assert.Equal(t, int64(42), total)
	assert.Equal(t, []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20}, collectUserIDs(pageOne))

	pageTwo, total, err := GetAllUsers(&common.PageInfo{Page: 2, PageSize: 20}, NewUserSortOptions("id", "asc"))
	require.NoError(t, err)
	assert.Equal(t, int64(42), total)
	assert.Equal(t, []int{21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40}, collectUserIDs(pageTwo))

	pageThree, total, err := GetAllUsers(&common.PageInfo{Page: 3, PageSize: 20}, NewUserSortOptions("id", "asc"))
	require.NoError(t, err)
	assert.Equal(t, int64(42), total)
	assert.Equal(t, []int{41, 42}, collectUserIDs(pageThree))
}

func TestSearchUsersSortsBeforePagination(t *testing.T) {
	truncateTables(t)
	insertUsersForPaginationTest(t, 42)

	users, total, err := SearchUsers("user", "", nil, nil, 20, 20, NewUserSortOptions("id", "asc"))
	require.NoError(t, err)
	assert.Equal(t, int64(42), total)
	assert.Equal(t, []int{21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40}, collectUserIDs(users))
}

func TestUsersSortByUsageLevel(t *testing.T) {
	truncateTables(t)
	quotas := []int{0, 12_000_000, 900, 12_000_000, 45_000}
	for i, quota := range quotas {
		require.NoError(t, DB.Create(&User{
			Id:          i + 1,
			Username:    fmt.Sprintf("level%02d", i+1),
			Password:    "password123",
			DisplayName: fmt.Sprintf("Level %02d", i+1),
			Email:       fmt.Sprintf("level%02d@example.com", i+1),
			Role:        common.RoleCommonUser,
			Status:      common.UserStatusEnabled,
			Group:       "default",
			AffCode:     fmt.Sprintf("aff%02d", i+1),
			UsedQuota:   quota,
			LevelQuota:  quota,
		}).Error)
	}

	firstPage, total, err := GetAllUsers(&common.PageInfo{Page: 1, PageSize: 3}, NewUserSortOptions("usage_level", "desc"))
	require.NoError(t, err)
	assert.Equal(t, int64(5), total)
	assert.Equal(t, []int{4, 2, 5}, collectUserIDs(firstPage))

	secondPage, _, err := GetAllUsers(&common.PageInfo{Page: 2, PageSize: 3}, NewUserSortOptions("usage_level", "desc"))
	require.NoError(t, err)
	assert.Equal(t, []int{3, 1}, collectUserIDs(secondPage))

	ascending, _, err := SearchUsers("level", "", nil, nil, 0, 3, NewUserSortOptions("usage_level", "asc"))
	require.NoError(t, err)
	assert.Equal(t, []int{1, 3, 5}, collectUserIDs(ascending))
}

// The gift columns are read from the balance ledgers, so the list sorts them in
// Go. These accounts cover the three cases the columns must tell apart: a
// wallet still holding gift quota, an account the plan covered entirely, and
// one that spent nothing of either.
func TestUsersSortByLifetimeFundingUsage(t *testing.T) {
	truncateTables(t)
	seedUsageLevelLedgers(t)
	accounts := []struct {
		username   string
		quota      int
		usedQuota  int
		levelQuota int
		bonusQuota int
	}{
		// 500000 quota is one dollar. The check-in gave two dollars, one and a
		// half of it was consumed, so half a dollar of gift is still in the
		// wallet: that ledger, not a top-up record, says how much of the
		// balance was never earned.
		{username: "gift-paid", quota: 500_000, usedQuota: 1_500_000, bonusQuota: 500_000},
		{username: "plan-covered", usedQuota: 0},
		{username: "paid-only", usedQuota: 400_000, levelQuota: 400_000},
	}
	for i, account := range accounts {
		require.NoError(t, DB.Create(&User{
			Id:          i + 1,
			Username:    account.username,
			Password:    "password123",
			DisplayName: account.username,
			Email:       account.username + "@example.com",
			Role:        common.RoleCommonUser,
			Status:      common.UserStatusEnabled,
			Group:       "default",
			AffCode:     account.username + "-aff",
			Quota:       account.quota,
			UsedQuota:   account.usedQuota,
			LevelQuota:  account.levelQuota,
			BonusQuota:  account.bonusQuota,
		}).Error)
	}
	require.NoError(t, DB.Create(&Checkin{UserId: 1, CheckinDate: "2026-10-01", QuotaAwarded: 2_000_000}).Error)
	for _, reservation := range []TokenPlanReservation{
		{UserId: 1, WeekId: 1, FreeUsed: 400_000, Settled: true, SettledAt: 100},
		{UserId: 1, WeekId: 2, FreeUsed: 100_000, Settled: true, SettledAt: 200},
		// An unsettled reservation is a promise, not consumption.
		{UserId: 2, WeekId: 1, FreeUsed: 900_000, Settled: false},
		{UserId: 2, WeekId: 1, FreeUsed: 300_000, Settled: true, SettledAt: 100},
	} {
		require.NoError(t, DB.Create(&reservation).Error)
	}

	sources, err := UserUsageSources([]int{1, 2, 3})
	require.NoError(t, err)
	assert.Equal(t, UserUsageSource{GiftUsed: 1_500_000, TokenPlanUsed: 500_000, GiftPlanUsed: 2_000_000, GiftKnown: true, GiftQuota: 2_000_000, GiftRemaining: 500_000}, sources[1])
	assert.Equal(t, UserUsageSource{GiftUsed: 0, TokenPlanUsed: 300_000, GiftPlanUsed: 300_000, GiftKnown: true}, sources[2])
	assert.Equal(t, UserUsageSource{GiftUsed: 0, GiftPlanUsed: 0, GiftKnown: true}, sources[3])

	// Descending gift usage: the two accounts that spent no gift quota tie at
	// zero, and a tie falls back to id descending.
	descending, _, err := GetAllUsers(&common.PageInfo{Page: 1, PageSize: 2}, NewUserSortOptions("gift_used", "desc"))
	require.NoError(t, err)
	assert.Equal(t, []int{1, 3}, collectUserIDs(descending))
	lastPage, _, err := GetAllUsers(&common.PageInfo{Page: 2, PageSize: 2}, NewUserSortOptions("gift_used", "desc"))
	require.NoError(t, err)
	assert.Equal(t, []int{2}, collectUserIDs(lastPage))

	// Ascending gift usage mirrors it, so the lone consumer comes last.
	ascending, _, err := SearchUsers("", "", nil, nil, 0, 3, NewUserSortOptions("gift_used", "asc"))
	require.NoError(t, err)
	assert.Equal(t, []int{3, 2, 1}, collectUserIDs(ascending))

	planHeavy, _, err := SearchUsers("", "", nil, nil, 0, 3, NewUserSortOptions("token_plan_used", "desc"))
	require.NoError(t, err)
	assert.Equal(t, []int{1, 2, 3}, collectUserIDs(planHeavy))
	planLight, _, err := SearchUsers("", "", nil, nil, 0, 3, NewUserSortOptions("token_plan_used", "asc"))
	require.NoError(t, err)
	assert.Equal(t, []int{3, 2, 1}, collectUserIDs(planLight))

	// The combined free total adds the two sources.
	combined, _, err := SearchUsers("", "", nil, nil, 0, 3, NewUserSortOptions("gift_plan_used", "desc"))
	require.NoError(t, err)
	assert.Equal(t, []int{1, 2, 3}, collectUserIDs(combined))
	combinedAsc, _, err := SearchUsers("", "", nil, nil, 0, 3, NewUserSortOptions("gift_plan_used", "asc"))
	require.NoError(t, err)
	assert.Equal(t, []int{3, 2, 1}, collectUserIDs(combinedAsc))
}

// Before the one-time backfill runs, level_quota is still empty, so the gap
// between the two ledgers would read as "everything was a gift". Every account
// must report an untracked gift figure instead of a wrong one.
func TestUsageSourceIsUntrackedBeforeTheLedgerBackfill(t *testing.T) {
	truncateTables(t)
	require.NoError(t, DB.AutoMigrate(&Option{}))
	t.Cleanup(func() {
		DB.Where(&Option{Key: UsageLevelGiftExclusionMigrationKey}).Delete(&Option{})
	})
	require.NoError(t, DB.Create(&User{
		Id: 1, Username: "unseeded", Password: "password123", DisplayName: "unseeded",
		Email: "unseeded@example.com", Role: common.RoleCommonUser, Group: "default",
		Status: common.UserStatusEnabled, AffCode: "unseeded-aff", UsedQuota: 300_000,
	}).Error)

	sources, err := UserUsageSources([]int{1})
	require.NoError(t, err)
	assert.False(t, sources[1].GiftKnown)
}

// seedUsageLevelLedgers marks the level ledgers as backfilled, which is the
// state every running instance reaches once at startup.
func seedUsageLevelLedgers(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&Option{}))
	require.NoError(t, DB.Create(&Option{Key: UsageLevelGiftExclusionMigrationKey, Value: "true"}).Error)
	t.Cleanup(func() {
		DB.Where(&Option{Key: UsageLevelGiftExclusionMigrationKey}).Delete(&Option{})
	})
}

// fundingTestDatabase opens a database for one engine and points the package at
// it. The funding sort aggregates several tables plus the log table, so it has
// to be proven on each supported engine rather than inferred from one.
func fundingTestDatabase(t *testing.T, engine string) {
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
		NamingStrategy: schema.NamingStrategy{TablePrefix: "funding_" + engine + "_"},
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
	DB, LOG_DB = db, db
	common.SetDatabaseTypes(dbType, dbType)
	initCol()
	t.Cleanup(func() {
		_ = db.Migrator().DropTable(&User{}, &TopUp{}, &Checkin{}, &Redemption{}, &CampaignAward{}, &Log{}, &TokenPlanReservation{}, &Option{})
		_ = sqlDB.Close()
		DB, LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		initCol()
	})
	require.NoError(t, db.Migrator().DropTable(&User{}, &TopUp{}, &Checkin{}, &Redemption{}, &CampaignAward{}, &Log{}, &TokenPlanReservation{}, &Option{}))
	require.NoError(t, db.AutoMigrate(&User{}, &TopUp{}, &Checkin{}, &Redemption{}, &CampaignAward{}, &Log{}, &TokenPlanReservation{}, &Option{}))
}

// TestUsersSortByLifetimeFundingUsageOnEveryEngine proves the multi-table
// aggregate and the derived paging work on SQLite, MySQL and PostgreSQL, and
// that a second startup leaves the schema alone.
func TestUsersSortByLifetimeFundingUsageOnEveryEngine(t *testing.T) {
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(engine, func(t *testing.T) {
			fundingTestDatabase(t, engine)
			// Running the migration again must be a no-op on an existing schema.
			require.NoError(t, DB.AutoMigrate(&User{}, &TopUp{}, &Checkin{}, &Redemption{}, &CampaignAward{}, &Log{}, &TokenPlanReservation{}, &Option{}))
			require.NoError(t, DB.Create(&Option{Key: UsageLevelGiftExclusionMigrationKey, Value: "true"}).Error)

			for i, account := range []struct {
				username   string
				quota      int
				usedQuota  int
				levelQuota int
				bonusQuota int
			}{
				{username: "gift-paid", quota: 500_000, usedQuota: 1_500_000, bonusQuota: 500_000},
				{username: "plan-covered", usedQuota: 0, levelQuota: 0},
				{username: "paid-only", usedQuota: 400_000, levelQuota: 400_000},
			} {
				require.NoError(t, DB.Create(&User{
					Id: i + 1, Username: account.username, Password: "password123",
					DisplayName: account.username, Email: account.username + "@example.com",
					Role: common.RoleCommonUser, Status: common.UserStatusEnabled,
					Group: "default", AffCode: account.username + "-aff",
					Quota: account.quota, UsedQuota: account.usedQuota,
					LevelQuota: account.levelQuota, BonusQuota: account.bonusQuota,
				}).Error)
			}
			require.NoError(t, DB.Create(&Checkin{UserId: 1, CheckinDate: "2026-10-01", QuotaAwarded: 2_000_000}).Error)
			// The plan covered 500000 of the first account's and all of the
			// second account's consumption, so only the first spent gift quota.
			for _, reservation := range []TokenPlanReservation{
				{UserId: 1, WeekId: 1, FreeUsed: 500_000, Settled: true, SettledAt: 100},
				{UserId: 2, WeekId: 1, FreeUsed: 300_000, Settled: true, SettledAt: 100},
			} {
				require.NoError(t, DB.Create(&reservation).Error)
			}

			sources, err := UserUsageSources([]int{1, 2, 3})
			require.NoError(t, err)
			assert.Equal(t, UserUsageSource{GiftUsed: 1_500_000, TokenPlanUsed: 500_000, GiftPlanUsed: 2_000_000, GiftKnown: true, GiftQuota: 2_000_000, GiftRemaining: 500_000}, sources[1])
			assert.Equal(t, UserUsageSource{GiftUsed: 0, TokenPlanUsed: 300_000, GiftPlanUsed: 300_000, GiftKnown: true}, sources[2])
			assert.Equal(t, UserUsageSource{GiftUsed: 0, GiftPlanUsed: 0, GiftKnown: true}, sources[3])

			descending, total, err := GetAllUsers(&common.PageInfo{Page: 1, PageSize: 2}, NewUserSortOptions("gift_used", "desc"))
			require.NoError(t, err)
			assert.Equal(t, int64(3), total)
			// The two accounts that spent no gift quota tie at zero, and a tie
			// falls back to id descending.
			assert.Equal(t, []int{1, 3}, collectUserIDs(descending))

			searched, total, err := SearchUsers("", "default", nil, nil, 0, 3, NewUserSortOptions("token_plan_used", "desc"))
			require.NoError(t, err)
			assert.Equal(t, int64(3), total)
			assert.Equal(t, []int{1, 2, 3}, collectUserIDs(searched))
		})
	}
}
