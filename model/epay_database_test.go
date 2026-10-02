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

// Exact pre-snapshot top_ups schema. This remains independent of TopUp so an
// upgrade test cannot accidentally create the new column before migration.
type legacyEpayTopUp struct {
	Id              int
	UserId          int `gorm:"index"`
	Amount          int64
	Money           float64
	TradeNo         string `gorm:"unique;type:varchar(255);index"`
	PaymentMethod   string `gorm:"type:varchar(50)"`
	PaymentProvider string `gorm:"type:varchar(50);default:''"`
	CreateTime      int64
	CompleteTime    int64
	Status          string
}

func (legacyEpayTopUp) TableName() string { return "top_ups" }

// Optional DSNs MUST point to empty, disposable databases. Run on all three
// engines before publishing a candidate; SQLite alone is the default unit run.
func TestEpayDatabaseCompatibility(t *testing.T) {
	engines := []struct {
		name string
		kind common.DatabaseType
		open func() gorm.Dialector
	}{
		{"sqlite", common.DatabaseTypeSQLite, func() gorm.Dialector { return sqlite.Open(":memory:") }},
	}
	if dsn := os.Getenv("EPAY_TEST_MYSQL_DSN"); dsn != "" {
		engines = append(engines, struct {
			name string
			kind common.DatabaseType
			open func() gorm.Dialector
		}{"mysql", common.DatabaseTypeMySQL, func() gorm.Dialector { return mysql.Open(dsn) }})
	}
	if dsn := os.Getenv("EPAY_TEST_POSTGRES_DSN"); dsn != "" {
		engines = append(engines, struct {
			name string
			kind common.DatabaseType
			open func() gorm.Dialector
		}{"postgres", common.DatabaseTypePostgreSQL, func() gorm.Dialector { return postgres.Open(dsn) }})
	}
	for _, engine := range engines {
		t.Run(engine.name, func(t *testing.T) {
			for _, upgrade := range []bool{false, true} {
				t.Run(map[bool]string{false: "fresh", true: "upgrade"}[upgrade], func(t *testing.T) {
					db, err := gorm.Open(engine.open(), &gorm.Config{})
					require.NoError(t, err)
					sqlDB, err := db.DB()
					require.NoError(t, err)
					defer sqlDB.Close()
					if engine.name == "sqlite" {
						sqlDB.SetMaxOpenConns(1)
					} else {
						sqlDB.SetMaxOpenConns(10)
					}
					savedDB, savedLogDB := DB, LOG_DB
					savedMain, savedLog := common.MainDatabaseType(), common.LogDatabaseType()
					DB, LOG_DB = db, db
					common.SetDatabaseTypes(engine.kind, engine.kind)
					initCol()
					defer func() { DB, LOG_DB = savedDB, savedLogDB; common.SetDatabaseTypes(savedMain, savedLog); initCol() }()
					for _, table := range []any{&TopUp{}, &User{}, &Log{}} {
						require.False(t, db.Migrator().HasTable(table), "disposable databases only")
					}
					defer func() { require.NoError(t, db.Migrator().DropTable(&TopUp{}, &User{}, &Log{})) }()
					require.NoError(t, db.AutoMigrate(&User{}, &Log{}))
					user := insertUserForPaymentGuardTest(t, 509, 31)
					if upgrade {
						require.NoError(t, db.AutoMigrate(&legacyEpayTopUp{}))
						require.NoError(t, db.Create(&legacyEpayTopUp{UserId: user.Id, Amount: 1, Money: 1.234, TradeNo: "LEGACY", PaymentProvider: PaymentProviderEpay, PaymentMethod: "alipay", Status: common.TopUpStatusPending}).Error)
					}
					for range 2 {
						require.NoError(t, db.AutoMigrate(&TopUp{}))
					}
					assert.True(t, db.Migrator().HasColumn(&TopUp{}, "epay_merchant_id"))
					if upgrade {
						row := GetTopUpByTradeNo("LEGACY")
						require.NotNil(t, row)
						assert.Equal(t, 1.234, row.Money)
						assert.Empty(t, row.EpayMerchantId)
						_, err := RechargeEpay(row.TradeNo, EpayNotification{Money: "1.23", MerchantId: "old", PaymentMethod: "alipay"}, "127.0.0.1")
						require.ErrorIs(t, err, ErrPaymentMerchantMismatch)
						_, err = RechargeEpay(row.TradeNo, EpayNotification{Money: "1.23", MerchantId: "old", LegacyMerchantId: "old", PaymentMethod: "alipay"}, "127.0.0.1")
						require.NoError(t, err)
					}
					row := TopUp{UserId: user.Id, Amount: 1, Money: 1.239, TradeNo: "SNAPSHOT", EpayMerchantId: "old", PaymentProvider: PaymentProviderEpay, PaymentMethod: "alipay", Status: common.TopUpStatusPending}
					require.NoError(t, db.Create(&row).Error)
					before := getUserQuotaForPaymentGuardTest(t, user.Id)
					_, err = RechargeEpay(row.TradeNo, EpayNotification{Money: "0.01", MerchantId: "old", PaymentMethod: "alipay"}, "127.0.0.1")
					require.ErrorIs(t, err, ErrPaymentAmountMismatch)
					assert.Equal(t, row, *GetTopUpByTradeNo(row.TradeNo))
					errs := make(chan error, 10)
					var wg sync.WaitGroup
					for range 10 {
						wg.Go(func() {
							_, err := RechargeEpay(row.TradeNo, EpayNotification{Money: "1.24", MerchantId: "old", LegacyMerchantId: "new", PaymentMethod: "alipay"}, "127.0.0.1")
							errs <- err
						})
					}
					wg.Wait()
					close(errs)
					for err := range errs {
						require.NoError(t, err)
					}
					assert.Equal(t, before+int(common.QuotaPerUnit), getUserQuotaForPaymentGuardTest(t, user.Id))
					duplicate := row
					duplicate.Id = 0
					assert.Error(t, db.Create(&duplicate).Error, "trade uniqueness survived migration")
					assert.True(t, db.Migrator().HasIndex(&TopUp{}, "idx_top_ups_user_id"))
				})
			}
		})
	}
}
