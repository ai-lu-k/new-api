package model

import (
	"os"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestTopUpCampaignWindow(t *testing.T) {
	for _, tc := range []struct {
		name   string
		now    int64
		active bool
	}{
		{"before launch", 1794236622, false},
		{"launch", 1794236623, true},
		{"November 12 last second", 1794499199, true},
		{"November 13 midnight Shanghai", 1794499200, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.active, CurrentTopUpCampaign(tc.now).Active)
		})
	}
}

func TestTopUpBonusQuota(t *testing.T) {
	for _, tc := range []struct {
		name     string
		currency string
		amount   string
		quota    int
		want     int
		invalid  bool
	}{
		{"below threshold", "CNY", "99.99", 2000, 100, false},
		{"exact threshold", "CNY", "100.00", 2000, 300, false},
		{"above threshold", "cny", "1000", 10000, 1500, false},
		{"dollar excluded", "USD", "100", 2000, 0, false},
		{"euro excluded", "EUR", "100", 2000, 0, false},
		{"missing payment currency excluded", "", "100", 2000, 0, false},
		{"fractional quota rounds down", "CNY", "100", 101, 15, false},
		{"maximum wallet amount", "CNY", "100", common.MaxWalletQuota, 1_351_079_888_211_148, false},
		{"negative payment", "CNY", "-100", 2000, 0, true},
		{"sub-cent payment", "CNY", "99.999", 2000, 0, true},
		{"invalid payment", "CNY", "NaN", 2000, 0, true},
		{"quota overflow", "CNY", "100", common.MaxWalletQuota + 1, 0, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := CalculateTopUpBonus(tc.quota, &TopUpPayment{Currency: tc.currency, Amount: tc.amount}, 1794240000)
			if tc.invalid {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.want, got)
		})
	}
}

// DSNs must identify empty disposable databases. Exercise the same entitlement
// transaction used by every online payment provider on all supported engines.
func TestTopUpBonusDatabaseCompatibility(t *testing.T) {
	for _, engine := range []struct {
		name   string
		kind   common.DatabaseType
		driver gorm.Dialector
	}{
		{"sqlite", common.DatabaseTypeSQLite, sqlite.Open(":memory:")},
		{"mysql", common.DatabaseTypeMySQL, mysql.Open(os.Getenv("TOPUP_BONUS_TEST_MYSQL_DSN"))},
		{"postgres", common.DatabaseTypePostgreSQL, postgres.Open(os.Getenv("TOPUP_BONUS_TEST_POSTGRES_DSN"))},
	} {
		t.Run(engine.name, func(t *testing.T) {
			if engine.name == "mysql" && os.Getenv("TOPUP_BONUS_TEST_MYSQL_DSN") == "" {
				t.Skip("TOPUP_BONUS_TEST_MYSQL_DSN not configured")
			}
			if engine.name == "postgres" && os.Getenv("TOPUP_BONUS_TEST_POSTGRES_DSN") == "" {
				t.Skip("TOPUP_BONUS_TEST_POSTGRES_DSN not configured")
			}
			for _, upgrade := range []bool{false, true} {
				name := "fresh"
				if upgrade {
					name = "upgrade"
				}
				t.Run(name, func(t *testing.T) {
					db, err := gorm.Open(engine.driver, &gorm.Config{})
					require.NoError(t, err)
					var version string
					versionQuery := "SELECT VERSION()"
					if engine.name == "sqlite" {
						versionQuery = "SELECT sqlite_version()"
					}
					require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
					t.Logf("database %s %s", engine.name, version)
					sqlDB, err := db.DB()
					require.NoError(t, err)
					defer sqlDB.Close()
					if engine.name == "sqlite" {
						sqlDB.SetMaxOpenConns(1)
					}
					for _, table := range []any{&TopUp{}, &Redemption{}, &User{}, &Log{}} {
						require.False(t, db.Migrator().HasTable(table), "disposable databases only")
					}
					defer func() { require.NoError(t, db.Migrator().DropTable(&TopUp{}, &Redemption{}, &User{}, &Log{})) }()
					savedDB, savedLog := DB, LOG_DB
					savedMainType, savedLogType := common.MainDatabaseType(), common.LogDatabaseType()
					DB, LOG_DB = db, db
					common.SetDatabaseTypes(engine.kind, engine.kind)
					initCol()
					defer func() {
						DB, LOG_DB = savedDB, savedLog
						common.SetDatabaseTypes(savedMainType, savedLogType)
						initCol()
					}()
					require.NoError(t, db.AutoMigrate(&User{}, &Redemption{}, &Log{}))
					user := &User{Username: "double11", Status: common.UserStatusEnabled, Quota: 10}
					require.NoError(t, db.Create(user).Error)
					if upgrade {
						// This fixture is the top_ups schema from v1.0.0-rc.49.
						require.NoError(t, db.AutoMigrate(&legacyEpayTopUp{}))
						require.NoError(t, db.Create(&legacyEpayTopUp{UserId: user.Id, Amount: 1, Money: 99.99, TradeNo: "legacy", PaymentProvider: PaymentProviderEpay, PaymentMethod: "alipay", Status: common.TopUpStatusPending}).Error)
					}
					for range 2 {
						require.NoError(t, db.AutoMigrate(&TopUp{}, &Redemption{}))
					}
					if upgrade {
						old := GetTopUpByTradeNo("legacy")
						require.NotNil(t, old)
						assert.Equal(t, 99.99, old.Money)
						assert.Zero(t, old.BonusQuota)
						assert.Zero(t, old.BonusRedemptionId)
						assert.Equal(t, common.TopUpStatusPending, old.Status)
						duplicate := *old
						duplicate.Id = 0
						assert.Error(t, db.Create(&duplicate).Error, "order uniqueness survives migration")
					}
					assert.True(t, db.Migrator().HasIndex(&TopUp{}, "idx_top_ups_user_id"))

					order := &TopUp{UserId: user.Id, Amount: 1, Money: 100, TradeNo: "reward", PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusPending, CreateTime: common.GetTimestamp()}
					require.NoError(t, db.Create(order).Error)
					// Two deliveries represent competing webhook workers. Exactly
					// one commits purchased balance and one reusable voucher.
					var wg sync.WaitGroup
					results := make(chan error, 2)
					for range 2 {
						wg.Go(func() {
							results <- db.Transaction(func(tx *gorm.DB) error {
								var loaded TopUp
								if err := lockForUpdate(tx).First(&loaded, order.Id).Error; err != nil {
									return err
								}
								return settleOnlineTopUp(tx, &loaded, 1000, nil, &TopUpPayment{Currency: "CNY", Amount: "100"}, 1794240000)
							})
						})
					}
					wg.Wait()
					close(results)
					succeeded := 0
					for err := range results {
						if err == nil {
							succeeded++
						} else {
							assert.ErrorIs(t, err, ErrTopUpStatusInvalid)
						}
					}
					assert.Equal(t, 1, succeeded)
					assert.Equal(t, 1010, getUserQuotaForPaymentGuardTest(t, user.Id))
					paid := GetTopUpByTradeNo("reward")
					require.NotNil(t, paid)
					require.Positive(t, paid.BonusRedemptionId)
					require.NoError(t, LoadTopUpBonuses([]*TopUp{paid}))
					require.NotNil(t, paid.BonusRedemption)
					assert.Equal(t, 150, paid.BonusRedemption.Quota)
					assert.Zero(t, paid.BonusRedemption.ExpiredTime)
					quota, err := Redeem(paid.BonusRedemption.Key, user.Id)
					require.NoError(t, err)
					assert.Equal(t, 150, quota)
					_, err = Redeem(paid.BonusRedemption.Key, user.Id)
					require.Error(t, err)
					assert.Equal(t, 1160, getUserQuotaForPaymentGuardTest(t, user.Id))
					var count int64
					require.NoError(t, db.Model(&Redemption{}).Count(&count).Error)
					assert.EqualValues(t, 1, count)

					// A failed wallet credit rolls back voucher creation and the
					// payment transition; the webhook remains retryable.
					require.NoError(t, db.Model(&User{}).Where("id = ?", user.Id).Update("quota", common.MaxWalletQuota).Error)
					failed := &TopUp{UserId: user.Id, TradeNo: "overflow", Status: common.TopUpStatusPending, BonusQuota: 50}
					require.NoError(t, db.Create(failed).Error)
					err = db.Transaction(func(tx *gorm.DB) error {
						return settleOnlineTopUp(tx, failed, 1000, nil, &TopUpPayment{Currency: "CNY", Amount: "100"}, 1794240000)
					})
					require.ErrorIs(t, err, ErrTopUpQuotaLimitExceeded)
					require.NoError(t, db.Model(&Redemption{}).Count(&count).Error)
					assert.EqualValues(t, 1, count)
					rolledBack := GetTopUpByTradeNo("overflow")
					require.NotNil(t, rolledBack)
					assert.Equal(t, common.TopUpStatusPending, rolledBack.Status)
					assert.Zero(t, rolledBack.BonusRedemptionId)
					require.NoError(t, db.Model(&User{}).Where("id = ?", user.Id).Update("quota", 0).Error)

					for _, tc := range []struct {
						name        string
						payment     *TopUpPayment
						completedAt int64
					}{
						{"foreign currency", &TopUpPayment{Currency: "USD", Amount: "100"}, 1794240000},
						{"paid after activity", &TopUpPayment{Currency: "CNY", Amount: "100"}, 1794499200},
					} {
						row := &TopUp{UserId: user.Id, TradeNo: tc.name, Status: common.TopUpStatusPending}
						require.NoError(t, db.Create(row).Error)
						require.NoError(t, db.Transaction(func(tx *gorm.DB) error { return settleOnlineTopUp(tx, row, 1000, nil, tc.payment, tc.completedAt) }))
						assert.Zero(t, GetTopUpByTradeNo(tc.name).BonusRedemptionId)
					}
					manual := &TopUp{UserId: user.Id, Amount: 1, TradeNo: "manual", Status: common.TopUpStatusPending, BonusQuota: 50}
					require.NoError(t, db.Create(manual).Error)
					require.NoError(t, ManualCompleteTopUp(manual.TradeNo, "127.0.0.1"))
					assert.Zero(t, GetTopUpByTradeNo("manual").BonusRedemptionId)
				})
			}
		})
	}
}
