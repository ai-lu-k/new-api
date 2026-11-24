package model

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// pageViewTestDB opens one real database per dialect and points the package
// global at it, because the page-view helpers are written for the live DB.
func pageViewTestDB(t *testing.T, dialect string) *gorm.DB {
	t.Helper()
	var driver gorm.Dialector
	switch dialect {
	case "sqlite":
		driver = sqlite.Open(filepath.Join(t.TempDir(), "page-view.db"))
	case "mysql":
		dsn := os.Getenv("TEST_MYSQL_DSN")
		if dsn == "" {
			t.Skip("TEST_MYSQL_DSN is not configured")
		}
		driver = mysql.Open(dsn)
	case "postgres":
		dsn := os.Getenv("TEST_POSTGRES_DSN")
		if dsn == "" {
			t.Skip("TEST_POSTGRES_DSN is not configured")
		}
		driver = postgres.Open(dsn)
	default:
		t.Fatalf("unknown dialect %q", dialect)
	}
	db, err := gorm.Open(driver, &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })

	previous := DB
	DB = db
	t.Cleanup(func() { DB = previous })

	require.NoError(t, db.Migrator().DropTable(&PageViewDaily{}))
	require.NoError(t, db.AutoMigrate(&PageViewDaily{}))
	// Migrations run on every start, so a second pass must be a no-op.
	require.NoError(t, db.AutoMigrate(&PageViewDaily{}))
	t.Cleanup(func() { require.NoError(t, db.Migrator().DropTable(&PageViewDaily{})) })

	pageViewPrune.Lock()
	pageViewPrune.day = ""
	pageViewPrune.Unlock()
	return db
}

func TestPageViewRecordingAndRanking(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			db := pageViewTestDB(t, dialect)
			now := time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)

			// The same page opened twice on one day is one row, not two.
			require.NoError(t, RecordPageView("/pricing", now))
			require.NoError(t, RecordPageView("/pricing", now))
			require.NoError(t, RecordPageView("/keys", now))
			require.NoError(t, RecordPageView("/keys", now))
			require.NoError(t, RecordPageView("/keys", now))
			require.NoError(t, RecordPageView("/wallet", now))

			var rows []PageViewDaily
			require.NoError(t, db.Order("page").Find(&rows).Error)
			require.Len(t, rows, 3)
			assert.Equal(t, PageViewDaily{Id: rows[0].Id, Page: "/keys", ViewDay: "2026-10-21", Views: 3}, rows[0])
			assert.Equal(t, "/pricing", rows[1].Page)
			assert.Equal(t, int64(2), rows[1].Views)
			assert.Equal(t, "/wallet", rows[2].Page)
			assert.Equal(t, int64(1), rows[2].Views)

			// The window is the seven days ending today, so a visit eight days
			// back is outside it and a visit seven days back still counts.
			require.NoError(t, RecordPageView("/wallet", now.AddDate(0, 0, -6)))
			require.NoError(t, RecordPageView("/pricing", now.AddDate(0, 0, -7)))

			totals, err := PopularPageViews(now, 10)
			require.NoError(t, err)
			assert.Equal(t, []PageViewTotal{
				{Page: "/keys", Views: 3},
				{Page: "/pricing", Views: 2},
				{Page: "/wallet", Views: 2},
			}, totals)

			// Equal counts keep a stable order instead of drifting between calls.
			repeated, err := PopularPageViews(now, 10)
			require.NoError(t, err)
			assert.Equal(t, totals, repeated)

			limited, err := PopularPageViews(now, 2)
			require.NoError(t, err)
			assert.Equal(t, []PageViewTotal{{Page: "/keys", Views: 3}, {Page: "/pricing", Views: 2}}, limited)
		})
	}
}

func TestPageViewRetentionDropsExpiredDays(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			db := pageViewTestDB(t, dialect)
			now := time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)

			require.NoError(t, db.Create(&PageViewDaily{Page: "/pricing", ViewDay: "2026-09-01", Views: 9}).Error)
			require.NoError(t, db.Create(&PageViewDaily{Page: "/keys", ViewDay: "2026-10-20", Views: 1}).Error)

			require.NoError(t, RecordPageView("/wallet", now))

			var rows []PageViewDaily
			require.NoError(t, db.Order("view_day").Find(&rows).Error)
			require.Len(t, rows, 2)
			assert.Equal(t, "/keys", rows[0].Page)
			assert.Equal(t, "/wallet", rows[1].Page)
		})
	}
}

func TestIsValidPageViewKey(t *testing.T) {
	for _, valid := range []string{"/", "/pricing", "/usage-logs/common", "/system-settings/site"} {
		assert.True(t, IsValidPageViewKey(valid), valid)
	}
	for _, invalid := range []string{"", "pricing", "/pricing?tab=2", "/chat/abc#top", "/用户", "/a b"} {
		assert.False(t, IsValidPageViewKey(invalid), invalid)
	}
}
