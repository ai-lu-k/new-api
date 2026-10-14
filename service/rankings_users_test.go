package service

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type rankingFixtureUser struct {
	Id           int
	Username     string
	DisplayName  string
	UsedQuota    int
	RequestCount int
	Role         int
	Status       int
	DeletedAt    gorm.DeletedAt
}

func (rankingFixtureUser) TableName() string { return "users" }

func TestUserLevelRankingsDatabase(t *testing.T) {
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(engine, func(t *testing.T) {
			var driver gorm.Dialector
			switch engine {
			case "sqlite":
				driver = sqlite.Open(":memory:")
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
			}
			db, err := gorm.Open(driver, &gorm.Config{})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })
			require.NoError(t, db.Migrator().DropTable(&rankingFixtureUser{}))
			require.NoError(t, db.AutoMigrate(&rankingFixtureUser{}))
			t.Cleanup(func() { require.NoError(t, db.Migrator().DropTable(&rankingFixtureUser{})) })
			previous := model.DB
			model.DB = db
			t.Cleanup(func() { model.DB = previous })
			common.OptionMapRWMutex.Lock()
			oldThresholds, hadThresholds := common.OptionMap["usage_level.thresholds"]
			if common.OptionMap == nil {
				common.OptionMap = map[string]string{}
			}
			delete(common.OptionMap, "usage_level.thresholds")
			common.OptionMapRWMutex.Unlock()
			t.Cleanup(func() {
				common.OptionMapRWMutex.Lock()
				defer common.OptionMapRWMutex.Unlock()
				if hadThresholds {
					common.OptionMap["usage_level.thresholds"] = oldThresholds
				} else {
					delete(common.OptionMap, "usage_level.thresholds")
				}
			})
			empty, err := GetUserLevelRankingsSnapshot(0)
			require.NoError(t, err)
			assert.Empty(t, empty.Users)
			assert.Len(t, empty.Levels, 7)
			assert.Nil(t, empty.Me)
			var rows []rankingFixtureUser
			for index := range 51 {
				id := index + 1
				rows = append(rows, rankingFixtureUser{Id: id, Username: fmt.Sprintf("private-account-%02d", id), DisplayName: fmt.Sprintf("Display name %02d", id), UsedQuota: 10, RequestCount: id, Role: common.RoleCommonUser, Status: common.UserStatusEnabled})
			}
			rows = append(rows,
				rankingFixtureUser{Id: 52, Username: "operator", UsedQuota: 1000, Role: common.RoleAdminUser, Status: common.UserStatusEnabled},
				rankingFixtureUser{Id: 53, Username: "disabled", UsedQuota: 1000, Role: common.RoleCommonUser, Status: common.UserStatusDisabled},
				rankingFixtureUser{Id: 54, Username: "deleted", UsedQuota: 1000, Role: common.RoleCommonUser, Status: common.UserStatusEnabled, DeletedAt: gorm.DeletedAt{Time: time.Unix(1, 0), Valid: true}},
				rankingFixtureUser{Id: 55, Username: "unused", Role: common.RoleCommonUser, Status: common.UserStatusEnabled},
			)
			require.NoError(t, db.Create(&rows).Error)
			result, err := GetUserLevelRankingsSnapshot(51)
			require.NoError(t, err)
			require.Len(t, result.Users, 50)
			assert.Equal(t, int64(51), result.TotalUsers)
			assert.Equal(t, int64(51), result.Levels[1].Users)
			require.NotNil(t, result.Me)
			assert.Equal(t, 51, result.Me.Rank, "equal consumption must retain the published id tie-break beyond the cut-off")
			assert.True(t, result.Me.IsMe)
			for index, row := range result.Users {
				assert.Equal(t, index+1, row.Rank)
				assert.Equal(t, index+1, row.RequestCount)
				assert.False(t, row.IsMe)
			}
			inside, err := GetUserLevelRankingsSnapshot(2)
			require.NoError(t, err)
			require.NotNil(t, inside.Me)
			assert.Equal(t, 2, inside.Me.Rank)
			assert.True(t, inside.Users[1].IsMe)
			encoded, err := common.Marshal(result)
			require.NoError(t, err)
			assert.NotContains(t, string(encoded), "private-account")
			assert.NotContains(t, string(encoded), "Display name")
			assert.NotContains(t, string(encoded), "\"id\"")
			require.NoError(t, db.Model(&rankingFixtureUser{}).Where("id = ?", 1).Update("used_quota", 5_000_000).Error)
			promoted, err := GetUserLevelRankingsSnapshot(0)
			require.NoError(t, err)
			assert.Equal(t, int64(50), promoted.Levels[1].Users)
			assert.Equal(t, int64(1), promoted.Levels[2].Users, "the exact threshold belongs to the next level")
		})
	}
}

func TestMaskRankingName(t *testing.T) {
	cases := []struct{ in, want string }{
		{"", "***"},
		{"a", "a***"},
		{"ab", "a***"},
		{"abc", "a***c"},
		{"abcd", "a***d"},
		{"abcde", "ab***de"},
		{"kano07", "ka***07"},
		{"大肥鲸", "大***鲸"},
		{"中转站用户", "中转***用户"},
	}
	for _, tc := range cases {
		if got := maskRankingName(tc.in); got != tc.want {
			t.Errorf("maskRankingName(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestPublicRankingNamePrefersDisplayNameThenMasks(t *testing.T) {
	row := model.UserUsageRow{Username: "kano07", DisplayName: "大肥鲸"}
	if got, want := publicRankingName(row), "大***鲸"; got != want {
		t.Errorf("publicRankingName(display name) = %q, want %q", got, want)
	}

	row.DisplayName = "   "
	if got, want := publicRankingName(row), "ka***07"; got != want {
		t.Errorf("publicRankingName(blank display name) = %q, want %q", got, want)
	}

	row.Username = ""
	if got, want := publicRankingName(row), "***"; got != want {
		t.Errorf("publicRankingName(no name at all) = %q, want %q", got, want)
	}
}
