package controller

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

var channelCapacitySweepSequence atomic.Int64

// TestChannelConcurrencyDatabaseMatrix proves the per-user channel capacity
// ledger on the three supported primary databases: schema creation and
// idempotent upgrade, unlimited channels, per-user slots on a shared channel,
// release, durable task and Midjourney counting, and the live-to-durable
// handoff.
func TestChannelConcurrencyDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case "sqlite":
				driver = sqlite.Open(filepath.Join(t.TempDir(), "channel_capacity.db"))
			case "mysql":
				dsn := os.Getenv("TEST_MYSQL_DSN")
				if dsn == "" {
					t.Skip("TEST_MYSQL_DSN not configured")
				}
				driver = mysql.Open(dsn)
			case "postgres":
				dsn := os.Getenv("TEST_POSTGRES_DSN")
				if dsn == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
				driver = postgres.Open(dsn)
			}
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "channel_capacity_test_"}})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			if dialect == "sqlite" {
				sqlDB.SetMaxOpenConns(1)
			} else {
				sqlDB.SetMaxOpenConns(4)
			}
			previousDB, previousType, previousRedis := model.DB, common.MainDatabaseType(), common.RedisEnabled
			previousMemory := common.MemoryCacheEnabled
			model.DB = db
			common.SetMainDatabaseType(common.DatabaseType(dialect))
			common.RedisEnabled = false
			common.MemoryCacheEnabled = false
			tables := []any{&model.ChannelGenerationSlot{}, &model.Channel{}, &model.Task{}, &model.Midjourney{}, &model.Option{}}
			t.Cleanup(func() {
				require.NoError(t, db.Migrator().DropTable(tables...))
				model.DB = previousDB
				common.SetMainDatabaseType(previousType)
				common.RedisEnabled = previousRedis
				common.MemoryCacheEnabled = previousMemory
				require.NoError(t, sqlDB.Close())
			})
			var version string
			query := "SELECT version()"
			if dialect == "sqlite" {
				query = "SELECT sqlite_version()"
			}
			require.NoError(t, db.Raw(query).Scan(&version).Error)
			t.Logf("database version: %s", version)

			// Upgrade path: the released schema predates the per-user column, so
			// an installed slot table without user_id must gain the column in
			// place while its rows and the channel settings survive.
			require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Task{}, &model.Midjourney{}, &model.Option{}))
			limitedSetting := `{"concurrency_limit":2}`
			existing := model.Channel{Id: 5, Key: "sk-existing", Name: "existing-pool", Group: "default", Status: common.ChannelStatusEnabled, Setting: &limitedSetting}
			require.NoError(t, db.Create(&existing).Error)
			require.NoError(t, db.Migrator().CreateTable(&legacyChannelGenerationSlot{}))
			require.NoError(t, db.Create(&legacyChannelGenerationSlot{Key: "legacy-slot", ChannelID: 5, ExpiresAt: 0}).Error)
			require.False(t, db.Migrator().HasColumn(&model.ChannelGenerationSlot{}, "user_id"), "the released table has no per-user column yet")
			require.NoError(t, db.AutoMigrate(&model.ChannelGenerationSlot{}))
			require.True(t, db.Migrator().HasColumn(&model.ChannelGenerationSlot{}, "user_id"))
			require.NoError(t, db.AutoMigrate(&model.ChannelGenerationSlot{}, &model.Channel{}), "repeated startup migration must stay idempotent")
			var legacy legacyChannelGenerationSlot
			require.NoError(t, db.Where(map[string]any{"key": "legacy-slot"}).First(&legacy).Error)
			assert.Equal(t, 5, legacy.ChannelID, "an upgraded table keeps its existing rows")
			var reloaded model.Channel
			require.NoError(t, db.First(&reloaded, 5).Error)
			require.NotNil(t, reloaded.Setting)
			assert.Equal(t, 2, reloaded.GetSetting().ConcurrencyLimit, "existing channel settings survive the upgrade")

			for _, channel := range []struct {
				id      int
				key     string
				name    string
				setting string
			}{
				{6, "sk-task", "task-pool", `{"concurrency_limit":1}`},
				{7, "sk-unlimited", "unlimited-pool", ""},
				{8, "sk-mj", "mj-pool", `{"concurrency_limit":2}`},
				{9, "sk-handoff", "handoff-pool", `{"concurrency_limit":1}`},
				{10, "sk-invalid", "invalid-pool", `{"concurrency_limit":10001}`},
				{11, "sk-total", "total-pool", `{"concurrency_limit":2}`},
				{12, "sk-user-first", "user-first-pool", `{"concurrency_limit":1}`},
			} {
				created := model.Channel{Id: channel.id, Key: channel.key, Name: channel.name, Group: "default", Status: common.ChannelStatusEnabled}
				if channel.setting != "" {
					setting := channel.setting
					created.Setting = &setting
				}
				require.NoError(t, db.Create(&created).Error)
			}

			t.Run("unlimited channels never reserve capacity", func(t *testing.T) {
				for range 5 {
					ctx, lease, err := model.StartChannelGeneration(context.Background(), 7, 1, 0, 0)
					require.NoError(t, err)
					require.Nil(t, lease)
					require.NotNil(t, ctx)
				}
				// Legacy account-wide options must not gate a channel.
				require.NoError(t, db.Create(&model.Option{Key: "GenerationConcurrencyEnabled", Value: "true"}).Error)
				require.NoError(t, db.Create(&model.Option{Key: "GenerationConcurrencyDefault", Value: "1"}).Error)
				_, lease, err := model.StartChannelGeneration(context.Background(), 7, 1, 0, 0)
				require.NoError(t, err)
				require.Nil(t, lease)
				var slots int64
				require.NoError(t, db.Model(&model.ChannelGenerationSlot{}).Where("channel_id = ?", 7).Count(&slots).Error)
				assert.Zero(t, slots, "an unlimited channel reserves no slots")
			})

			t.Run("sweeping expired slots keeps the live reservation", func(t *testing.T) {
				channelID := 1000000 + int(channelCapacitySweepSequence.Add(1))
				require.NoError(t, db.Create(&model.Channel{
					Id: channelID, Key: "sk-sweep-fixture", Name: "sweep-fixture", Group: "default", Status: common.ChannelStatusEnabled,
				}).Error)
				require.NoError(t, db.Create(&model.ChannelGenerationSlot{
					Key: "expired-fixture", ChannelID: channelID, UserId: 1, ExpiresAt: 1,
				}).Error)
				_, lease, err := model.StartChannelGeneration(t.Context(), channelID, 1, 0, 1)
				require.NoError(t, err)
				require.NotNil(t, lease)
				defer lease.Release()
				require.EventuallyWithT(t, func(c *assert.CollectT) {
					var slots []model.ChannelGenerationSlot
					if assert.NoError(c, db.Where("channel_id = ?", channelID).Find(&slots).Error) &&
						assert.Len(c, slots, 1) {
						assert.NotEqual(c, "expired-fixture", slots[0].Key)
					}
				}, 5*time.Second, 10*time.Millisecond)
				_, _, err = model.StartChannelGeneration(t.Context(), channelID, 2, 0, 1)
				assert.ErrorIs(t, err, model.ErrChannelGenerationConcurrency)
			})

			t.Run("capacity is per user and released per user", func(t *testing.T) {
				_, first, err := model.StartChannelGeneration(context.Background(), 5, 1, 2, 0)
				require.NoError(t, err)
				require.NotNil(t, first)
				_, second, err := model.StartChannelGeneration(context.Background(), 5, 1, 2, 0)
				require.NoError(t, err)
				require.NotNil(t, second)

				_, _, err = model.StartChannelGeneration(context.Background(), 5, 1, 2, 0)
				require.ErrorIs(t, err, model.ErrChannelGenerationConcurrency)
				var rejection *model.ChannelGenerationConcurrencyError
				require.ErrorAs(t, err, &rejection)
				assert.Equal(t, 2, rejection.InUse)
				assert.Equal(t, 2, rejection.Limit)
				assert.Equal(t, 1, rejection.UserId)

				// Another account has its own slots on the same channel.
				_, neighbour, err := model.StartChannelGeneration(context.Background(), 5, 2, 2, 0)
				require.NoError(t, err, "one user's generations never consume another user's slots")
				require.NotNil(t, neighbour)

				// A different channel keeps its own accounting.
				_, other, err := model.StartChannelGeneration(context.Background(), 6, 1, 1, 0)
				require.NoError(t, err)
				require.NotNil(t, other)

				first.Release()
				_, next, err := model.StartChannelGeneration(context.Background(), 5, 1, 2, 0)
				require.NoError(t, err, "a release must free this user's slot again")
				next.Release()
				second.Release()
				neighbour.Release()
				other.Release()
			})

			t.Run("channel total caps every account together", func(t *testing.T) {
				_, first, err := model.StartChannelGeneration(context.Background(), 11, 1, 2, 2)
				require.NoError(t, err)
				_, second, err := model.StartChannelGeneration(context.Background(), 11, 2, 2, 2)
				require.NoError(t, err, "another account still fits the channel total")

				_, _, err = model.StartChannelGeneration(context.Background(), 11, 3, 2, 2)
				require.ErrorIs(t, err, model.ErrChannelGenerationConcurrency)
				var rejection *model.ChannelGenerationConcurrencyError
				require.ErrorAs(t, err, &rejection)
				assert.True(t, rejection.ChannelTotal, "the rejection names the channel-wide cap")
				assert.Equal(t, 2, rejection.InUse)
				assert.Equal(t, 2, rejection.Limit)

				first.Release()
				_, third, err := model.StartChannelGeneration(context.Background(), 11, 3, 2, 2)
				require.NoError(t, err, "a release frees channel capacity for any account")
				second.Release()
				third.Release()
			})

			t.Run("concurrent admissions across channels stay independent", func(t *testing.T) {
				// Two channels admitting at the same time only share the slot
				// table. MySQL used to answer their INSERTs with a 1213 deadlock,
				// which admission surfaced as a 503 that had nothing to do with
				// capacity, so every attempt here must succeed and stay accounted.
				const usersPerChannel = 6
				channels := []int{13, 14}
				for _, channelID := range channels {
					setting := `{"concurrency_limit":8}`
					require.NoError(t, db.Create(&model.Channel{Id: channelID, Key: "sk-concurrent", Name: "concurrent-pool", Group: "default", Status: common.ChannelStatusEnabled, Setting: &setting}).Error)
				}
				var wg sync.WaitGroup
				failures := make(chan error, len(channels)*usersPerChannel)
				for _, channelID := range channels {
					for userID := 1; userID <= usersPerChannel; userID++ {
						wg.Add(1)
						go func() {
							defer wg.Done()
							_, lease, err := model.StartChannelGeneration(context.Background(), channelID, userID, 2, 0)
							if err != nil {
								failures <- err
								return
							}
							lease.Release()
						}()
					}
				}
				wg.Wait()
				close(failures)
				for err := range failures {
					assert.NoError(t, err, "a concurrent admission must not fail on lock contention")
				}
				for _, channelID := range channels {
					var slots int64
					require.NoError(t, db.Model(&model.ChannelGenerationSlot{}).Where("channel_id = ?", channelID).Count(&slots).Error)
					assert.Zero(t, slots, "every admitted generation released its slot")
				}
			})

			t.Run("a user's own limit reports before the channel total", func(t *testing.T) {
				_, lease, err := model.StartChannelGeneration(context.Background(), 12, 1, 1, 5)
				require.NoError(t, err)
				_, _, err = model.StartChannelGeneration(context.Background(), 12, 1, 1, 5)
				require.ErrorIs(t, err, model.ErrChannelGenerationConcurrency)
				var rejection *model.ChannelGenerationConcurrencyError
				require.ErrorAs(t, err, &rejection)
				assert.False(t, rejection.ChannelTotal, "the caller's own limit fires first")
				lease.Release()
			})

			t.Run("non-terminal tasks keep counting for their owner", func(t *testing.T) {
				task := model.Task{TaskID: "capacity-task", UserId: 1, ChannelId: 6, Status: model.TaskStatusInProgress}
				require.NoError(t, db.Create(&task).Error)
				_, _, err := model.StartChannelGeneration(context.Background(), 6, 1, 1, 0)
				require.ErrorIs(t, err, model.ErrChannelGenerationConcurrency, "a durable non-terminal task occupies its owner's slot")

				_, neighbour, err := model.StartChannelGeneration(context.Background(), 6, 2, 1, 0)
				require.NoError(t, err, "another user's task does not count against this user")
				neighbour.Release()

				require.NoError(t, db.Model(&model.Task{}).Where("id = ?", task.ID).Update("status", model.TaskStatusSuccess).Error)
				_, lease, err := model.StartChannelGeneration(context.Background(), 6, 1, 1, 0)
				require.NoError(t, err, "a terminal task stops counting")
				lease.Release()
			})

			t.Run("midjourney jobs count once per job for their owner", func(t *testing.T) {
				for _, job := range []model.Midjourney{
					{UserId: 1, ChannelId: 8, Code: 1, MjId: "mj-a", Progress: "0%"},
					{UserId: 1, ChannelId: 8, Code: 1, MjId: "mj-a", Progress: "0%"},
				} {
					require.NoError(t, db.Create(&job).Error)
				}
				_, lease, err := model.StartChannelGeneration(context.Background(), 8, 1, 2, 0)
				require.NoError(t, err, "repeat references to one job count once")
				lease.Release()
				require.NoError(t, db.Create(&model.Midjourney{UserId: 1, ChannelId: 8, Code: 1, MjId: "mj-b", Progress: "0%"}).Error)
				_, _, err = model.StartChannelGeneration(context.Background(), 8, 1, 2, 0)
				require.ErrorIs(t, err, model.ErrChannelGenerationConcurrency)

				_, neighbour, err := model.StartChannelGeneration(context.Background(), 8, 2, 2, 0)
				require.NoError(t, err, "another user's midjourney jobs do not count against this user")
				neighbour.Release()
			})

			t.Run("task persistence replaces the live lease", func(t *testing.T) {
				ctx, lease, err := model.StartChannelGeneration(context.Background(), 9, 1, 1, 0)
				require.NoError(t, err)
				require.NotNil(t, lease)
				task := &model.Task{TaskID: "capacity-handoff", UserId: 1, ChannelId: 9, Status: model.TaskStatusInProgress}
				require.NoError(t, task.InsertWithContext(ctx))
				var slots int64
				require.NoError(t, db.Model(&model.ChannelGenerationSlot{}).Where("channel_id = ?", 9).Count(&slots).Error)
				assert.Zero(t, slots, "the durable row replaces the live slot")
				lease.Release()
				_, _, err = model.StartChannelGeneration(context.Background(), 9, 1, 1, 0)
				require.ErrorIs(t, err, model.ErrChannelGenerationConcurrency, "the persisted task keeps holding its owner's slot")
				_, neighbour, err := model.StartChannelGeneration(context.Background(), 9, 2, 1, 0)
				require.NoError(t, err, "a persisted task never spends another account's slot")
				neighbour.Release()
				require.NoError(t, db.Model(&model.Task{}).Where("id = ?", task.ID).Update("status", model.TaskStatusSuccess).Error)
			})

			t.Run("a durable row for another account cannot replace the lease", func(t *testing.T) {
				ctx, lease, err := model.StartChannelGeneration(context.Background(), 5, 3, 2, 0)
				require.NoError(t, err)
				foreign := &model.Task{TaskID: "capacity-foreign", UserId: 4, ChannelId: 5, Status: model.TaskStatusInProgress}
				require.ErrorIs(t, foreign.InsertWithContext(ctx), model.ErrChannelGenerationLeaseLost)
				lease.Release()
			})

			t.Run("invalid limits fail closed", func(t *testing.T) {
				_, _, err := model.StartChannelGeneration(context.Background(), 10, 1, 10001, 0)
				require.Error(t, err)
			})

			t.Run("admission needs an account", func(t *testing.T) {
				_, _, err := model.StartChannelGeneration(context.Background(), 10, 0, 1, 0)
				require.Error(t, err, "an anonymous admission would share one slot bucket")
			})
		})
	}
}

// legacyChannelGenerationSlot is the released slot table shape, which predates
// the per-user column. Only the upgrade case creates it.
type legacyChannelGenerationSlot struct {
	Key       string `gorm:"type:varchar(64);primaryKey"`
	ChannelID int    `gorm:"index"`
	ExpiresAt int64  `gorm:"index"`
}

func (legacyChannelGenerationSlot) TableName() string {
	return "channel_capacity_test_channel_generation_slots"
}

// newChannelCapacityRequest builds the request state getChannel reads: the
// selected group, a forcing ChannelMeta (so every probe reselects), and the
// retry parameters for the given model.
func newChannelCapacityRequest(t *testing.T, user *model.User, modelName string) (*gin.Context, *service.RetryParam, *relaycommon.RelayInfo) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	common.SetContextKey(c, constant.ContextKeyUsingGroup, "default")
	common.SetContextKey(c, constant.ContextKeyUserGroup, user.Group)
	info := &relaycommon.RelayInfo{
		UserId:          user.Id,
		UsingGroup:      "default",
		TokenGroup:      "default",
		OriginModelName: modelName,
		ChannelMeta:     &relaycommon.ChannelMeta{}, // every probe must reselect
	}
	retry := &service.RetryParam{Ctx: c, TokenGroup: "default", ModelName: modelName, RequestPath: "/v1/chat/completions", Retry: common.GetPointer(0)}
	return c, retry, info
}

func newCapacityChannel(t *testing.T, id, priority int, models, setting string) *model.Channel {
	t.Helper()
	channel := &model.Channel{
		Id:       id,
		Key:      "sk-capacity-" + models,
		Name:     "capacity-" + models,
		Group:    "default",
		Models:   models,
		Priority: common.GetPointer[int64](int64(priority)),
		Status:   common.ChannelStatusEnabled,
	}
	if setting != "" {
		channel.Setting = &setting
	}
	require.NoError(t, model.DB.Create(channel).Error)
	require.NoError(t, channel.AddAbilities(model.DB))
	return channel
}

// TestChannelCapacityIsPerUser covers the selection contract: a user's own
// limit is reported as a 429 capacity state instead of being redirected to
// another eligible channel, while a different account still reaches the same
// channel.
func TestChannelCapacityIsPerUser(t *testing.T) {
	user, _ := setupResponsesWSRequestTest(t)
	require.NoError(t, i18n.Init())
	require.NoError(t, model.DB.AutoMigrate(&model.Channel{}, &model.Ability{}, &model.ChannelGenerationSlot{}, &model.Task{}, &model.Midjourney{}))
	limited := newCapacityChannel(t, 101, 100, "capacity-model", `{"concurrency_limit":1}`)
	newCapacityChannel(t, 102, 0, "capacity-model", "") // an unlimited alternative must not be used instead
	neighbour := &model.User{Id: user.Id + 1000, Username: "capacity-neighbour", AffCode: "capnb", Status: common.UserStatusEnabled, Group: "default", Quota: 1000, AuthVersion: 1}
	require.NoError(t, model.DB.Create(neighbour).Error)
	t.Cleanup(func() { require.NoError(t, model.DB.Unscoped().Delete(neighbour).Error) })

	_, lease, err := model.StartChannelGeneration(context.Background(), limited.Id, user.Id, 1, 0)
	require.NoError(t, err)
	defer lease.Release()

	t.Run("own limit is reported instead of another channel", func(t *testing.T) {
		c, retry, info := newChannelCapacityRequest(t, user, "capacity-model")
		channel, release, apiErr := getChannel(c, info, retry)
		assert.Nil(t, channel, "a full user limit must not be redirected to another channel")
		assert.Nil(t, release)
		require.NotNil(t, apiErr)
		assert.Equal(t, http.StatusTooManyRequests, apiErr.StatusCode)
		assert.Equal(t, types.ErrorCodeChannelConcurrencyExceeded, apiErr.GetErrorCode())
		assert.Equal(t, "1", c.Writer.Header().Get("Retry-After"))
		assert.Contains(t, apiErr.Error(), "capacity-model", "the caller is told which model is saturated")
		assert.Contains(t, apiErr.Error(), "1 of 1", "the caller sees their own usage against the limit")
	})

	t.Run("another user reaches the same channel", func(t *testing.T) {
		c, retry, info := newChannelCapacityRequest(t, neighbour, "capacity-model")
		channel, release, apiErr := getChannel(c, info, retry)
		require.Nil(t, apiErr)
		require.NotNil(t, release)
		release()
		assert.Equal(t, limited.Id, channel.Id, "per-user accounting admits a different account on the same channel")
	})
}

// publishCapacityContextChannel mirrors what the distributor publishes for the
// first attempt, so getChannel's context branch reads the state it finds in
// production.
func publishCapacityContextChannel(c *gin.Context, channel *model.Channel) {
	common.SetContextKey(c, constant.ContextKeyChannelId, channel.Id)
	common.SetContextKey(c, constant.ContextKeyChannelType, channel.Type)
	common.SetContextKey(c, constant.ContextKeyChannelName, channel.Name)
	common.SetContextKey(c, constant.ContextKeyChannelSetting, channel.GetSetting())
}

// holdChannelCapacity fills a channel's shared pool cap with another account's
// generation, so the next account is rejected by the channel-wide state rather
// than by its own limit.
func holdChannelCapacity(t *testing.T, channel *model.Channel, userID int) {
	t.Helper()
	_, lease, err := model.StartChannelGeneration(context.Background(), channel.Id, userID, 0, 1)
	require.NoError(t, err)
	t.Cleanup(lease.Release)
}

// TestChannelCapacityFallsBackToAnotherChannel covers the channel-wide cap: the
// saturated channel is excluded and the request continues on the next candidate,
// including when the first candidate came from the distributor's context. A
// pinned channel keeps its own rejection instead.
func TestChannelConcurrencyFallsBackToAnotherChannel(t *testing.T) {
	user, _ := setupResponsesWSRequestTest(t)
	require.NoError(t, i18n.Init())
	require.NoError(t, model.DB.AutoMigrate(&model.Channel{}, &model.Ability{}, &model.ChannelGenerationSlot{}, &model.Task{}, &model.Midjourney{}))
	full := newCapacityChannel(t, 201, 100, "fallback-model", `{"concurrency_total_limit":1}`)
	spare := newCapacityChannel(t, 202, 0, "fallback-model", "")
	holder := &model.User{Id: user.Id + 2000, Username: "fallback-holder", AffCode: "fbhold", Status: common.UserStatusEnabled, Group: "default", Quota: 1000, AuthVersion: 1}
	require.NoError(t, model.DB.Create(holder).Error)
	t.Cleanup(func() { require.NoError(t, model.DB.Unscoped().Delete(holder).Error) })
	holdChannelCapacity(t, full, holder.Id)

	t.Run("the distributor's channel falls through to the next candidate", func(t *testing.T) {
		c, retry, info := newChannelCapacityRequest(t, user, "fallback-model")
		info.ChannelMeta = nil // the first attempt reads the distributor's channel
		publishCapacityContextChannel(c, full)

		channel, release, apiErr := getChannel(c, info, retry)
		require.Nil(t, apiErr)
		require.NotNil(t, release)
		release()
		assert.Equal(t, spare.Id, channel.Id, "a channel-wide cap falls through to another eligible channel")
		assert.Equal(t, spare.Id, c.GetInt("channel_id"), "the replacement channel is published for the attempt")
		assert.Empty(t, c.Writer.Header().Get("Retry-After"), "a served attempt drops the capacity retry hint")
		assert.Zero(t, retry.GetRetry(), "a capacity fallback does not spend the retry budget")
	})

	t.Run("a pinned channel reports its own channel-wide cap", func(t *testing.T) {
		c, retry, info := newChannelCapacityRequest(t, user, "fallback-model")
		info.ChannelMeta = nil
		info.TaskRelayInfo = &relaycommon.TaskRelayInfo{LockedChannel: full}
		publishCapacityContextChannel(c, full)

		channel, release, apiErr := getChannel(c, info, retry)
		assert.Nil(t, channel, "a pinned channel is never bypassed")
		assert.Nil(t, release)
		require.NotNil(t, apiErr)
		assert.Equal(t, http.StatusTooManyRequests, apiErr.StatusCode)
		assert.Equal(t, types.ErrorCodeChannelConcurrencyExceeded, apiErr.GetErrorCode())
		assert.True(t, types.IsChannelCapacityFallback(apiErr), "the rejection is the channel-wide cap")
	})
}

// TestChannelCapacityFallbackReportsWhenEveryCandidateIsFull covers the end of
// the fallback: once every candidate reported its cap, the request keeps the
// channel-wide 429 instead of looking like an unroutable model.
func TestChannelConcurrencyFallbackReportsWhenEveryCandidateIsFull(t *testing.T) {
	user, _ := setupResponsesWSRequestTest(t)
	require.NoError(t, i18n.Init())
	require.NoError(t, model.DB.AutoMigrate(&model.Channel{}, &model.Ability{}, &model.ChannelGenerationSlot{}, &model.Task{}, &model.Midjourney{}))
	preferred := newCapacityChannel(t, 301, 100, "saturated-model", `{"concurrency_total_limit":1}`)
	spare := newCapacityChannel(t, 302, 0, "saturated-model", `{"concurrency_total_limit":1}`)
	for i, channel := range []*model.Channel{preferred, spare} {
		holder := &model.User{Id: user.Id + 3000 + i, Username: fmt.Sprintf("saturated-holder-%d", i), AffCode: common.GetRandomString(8), Status: common.UserStatusEnabled, Group: "default", Quota: 1000, AuthVersion: 1}
		require.NoError(t, model.DB.Create(holder).Error)
		t.Cleanup(func() { require.NoError(t, model.DB.Unscoped().Delete(holder).Error) })
		holdChannelCapacity(t, channel, holder.Id)
	}

	c, retry, info := newChannelCapacityRequest(t, user, "saturated-model")
	channel, release, apiErr := getChannel(c, info, retry)
	assert.Nil(t, channel)
	assert.Nil(t, release)
	require.NotNil(t, apiErr)
	assert.Equal(t, http.StatusTooManyRequests, apiErr.StatusCode)
	assert.Equal(t, types.ErrorCodeChannelConcurrencyExceeded, apiErr.GetErrorCode())
	assert.True(t, types.IsChannelCapacityFallback(apiErr), "the answer is still the channel-wide cap, not the caller's own limit")
	assert.Zero(t, retry.GetRetry(), "walking the candidates never spends the retry budget")

	attempted := make(map[int]struct{})
	for _, filter := range service.GetChannelConstraints(c).Filters {
		for channelID := range filter.ExcludedChannelIds {
			attempted[channelID] = struct{}{}
		}
	}
	assert.Contains(t, attempted, preferred.Id, "the preferred channel was tried")
	assert.Contains(t, attempted, spare.Id, "the fallback candidate was tried")
}
