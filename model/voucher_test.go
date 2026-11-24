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

// voucherTestUser reads back the wallet and both level ledgers of one account.
func voucherTestUser(t *testing.T, userId int) User {
	t.Helper()
	var user User
	require.NoError(t, DB.Select("id", "quota", "used_quota", "level_quota", "bonus_quota").First(&user, userId).Error)
	return user
}

// TestVoucherLifecycle covers the accounting contract of a voucher: granting is
// idempotent, opening credits the wallet once and records the money as a gift
// that buys no usage level, a lapsed voucher pays nothing, and the arrival
// notice stops once it has been acknowledged.
func TestVoucherLifecycle(t *testing.T) {
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
			prefix := fmt.Sprintf("vc_%s_", engine)
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
			previousRate := operation_setting.USDExchangeRate
			DB, LOG_DB = db, db
			common.SetDatabaseTypes(dbType, dbType)
			initCol()
			common.RedisEnabled, common.BatchUpdateEnabled = false, false
			// ¥1 must freeze into a round amount for the assertions below.
			operation_setting.USDExchangeRate = 1
			t.Cleanup(func() {
				_ = db.Migrator().DropTable(&Voucher{}, &VoucherBatch{}, &GiftConsumptionDaily{}, &Log{}, &User{})
				_ = sqlDB.Close()
				DB, LOG_DB = previousDB, previousLogDB
				common.SetDatabaseTypes(previousMain, previousLog)
				initCol()
				common.RedisEnabled, common.BatchUpdateEnabled = previousRedis, previousBatch
				operation_setting.USDExchangeRate = previousRate
			})
			require.NoError(t, db.Migrator().DropTable(&Voucher{}, &VoucherBatch{}, &GiftConsumptionDaily{}, &Log{}, &User{}))
			require.NoError(t, db.AutoMigrate(&User{}, &Voucher{}, &VoucherBatch{}, &GiftConsumptionDaily{}, &Log{}))
			// A second startup must not fight the schema it just created.
			require.NoError(t, db.AutoMigrate(&User{}, &Voucher{}, &VoucherBatch{}, &GiftConsumptionDaily{}, &Log{}))

			now := time.Now()
			admin := User{Username: "voucher-admin", AffCode: "voucher-admin", Password: "unused", Role: common.RoleAdminUser, Status: common.UserStatusEnabled, Group: "default"}
			alice := User{Username: "voucher-alice", AffCode: "voucher-alice", Password: "unused", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default"}
			bob := User{Username: "voucher-bob", AffCode: "voucher-bob", Password: "unused", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default"}
			require.NoError(t, db.Create(&admin).Error)
			require.NoError(t, db.Create(&alice).Error)
			require.NoError(t, db.Create(&bob).Error)

			faceValue, err := VoucherFaceValueFromYuan(5)
			require.NoError(t, err)
			assert.EqualValues(t, 2_500_000, faceValue)

			grant := VoucherGrant{RequestId: "voucher-test-request-0001", UserIds: []int{alice.Id, bob.Id}, FaceValueYuan: 5, ValidityDays: 30, Reason: "October thanks"}
			preview, err := PreviewVoucherGrant(grant, now)
			require.NoError(t, err)
			assert.EqualValues(t, 2, preview["recipients"])
			assert.EqualValues(t, 5_000_000, preview["total_face_value"])

			batch, err := CreateVoucherBatch(admin.Id, grant, now)
			require.NoError(t, err)
			assert.EqualValues(t, 2_500_000, batch.FaceValue)
			assert.EqualValues(t, 2, batch.RecipientCount)
			// Resubmitting the same request must not hand out a second voucher.
			repeated, err := CreateVoucherBatch(admin.Id, grant, now)
			require.NoError(t, err)
			assert.Equal(t, batch.Id, repeated.Id)
			var granted int64
			require.NoError(t, db.Model(&Voucher{}).Where("batch_id = ?", batch.Id).Count(&granted).Error)
			assert.EqualValues(t, 2, granted)

			var aliceVoucher Voucher
			require.NoError(t, db.Where("user_id = ?", alice.Id).First(&aliceVoucher).Error)
			assert.Equal(t, VoucherStatusUnopened, aliceVoucher.Status)

			opened, err := OpenVouchers(alice.Id, []int64{aliceVoucher.Id}, now)
			require.NoError(t, err)
			assert.Equal(t, []int64{aliceVoucher.Id}, opened.Opened)
			assert.EqualValues(t, 2_500_000, opened.OpenedQuota)
			assert.EqualValues(t, 2_500_000, opened.Balance)
			// The opened money is a gift: the wallet and the gift ledger grow
			// together, while level_quota and used_quota stay untouched, so the
			// voucher cannot buy a usage level.
			after := voucherTestUser(t, alice.Id)
			assert.EqualValues(t, 2_500_000, after.Quota)
			assert.EqualValues(t, 2_500_000, after.BonusQuota)
			assert.Zero(t, after.LevelQuota)
			assert.Zero(t, after.UsedQuota)
			assert.Zero(t, CalculateUsageLevel(after.LevelQuota, operation_setting.GetUsageLevelThresholds()).Level)

			// Opening the same voucher again credits nothing.
			replay, err := OpenVouchers(alice.Id, []int64{aliceVoucher.Id}, now)
			require.NoError(t, err)
			assert.Equal(t, []int64{aliceVoucher.Id}, replay.Skipped)
			assert.Zero(t, replay.OpenedQuota)
			assert.EqualValues(t, 2_500_000, voucherTestUser(t, alice.Id).Quota)

			// Somebody else's voucher is not openable, and a batch is bounded.
			_, err = OpenVouchers(bob.Id, []int64{aliceVoucher.Id}, now)
			require.ErrorIs(t, err, ErrVoucherNotFound)
			tooMany := make([]int64, MaxVouchersPerOpen+1)
			for i := range tooMany {
				tooMany[i] = int64(i + 1)
			}
			_, err = OpenVouchers(alice.Id, tooMany, now)
			require.ErrorIs(t, err, ErrVoucherOpenLimit)

			// The finance report reads the opening as a gift, not as a payment.
			adds, err := ListManualQuotaAdds(0, now.Unix()+60, nil)
			require.NoError(t, err)
			require.Len(t, adds, 1)
			assert.Equal(t, QuotaAddReasonVoucher, adds[0].Reason)
			assert.EqualValues(t, 2_500_000, adds[0].Quota)
			assert.False(t, IsPaidQuotaAddReason(QuotaAddReasonVoucher))

			// The arrival notice lists what is still unopened and unacknowledged.
			var bobVoucher Voucher
			require.NoError(t, db.Where("user_id = ?", bob.Id).First(&bobVoucher).Error)
			pending, err := ListPendingVouchers(bob.Id, now)
			require.NoError(t, err)
			require.Len(t, pending, 1)
			assert.Equal(t, bobVoucher.Id, pending[0].Id)
			// The notice says why the money arrived: the grant's own reason.
			assert.Equal(t, "October thanks", pending[0].Reason)
			// A voucher from a path with no grant behind it explains nothing,
			// so the notice falls back to naming the voucher itself.
			noGrant := Voucher{UserId: bob.Id, FaceValue: faceValue, Status: VoucherStatusUnopened, ExpiresAt: now.Add(48 * time.Hour).Unix(), Source: VoucherSourceReferral, CreatedAt: now.Unix()}
			require.NoError(t, db.Create(&noGrant).Error)
			withNoGrant, err := ListPendingVouchers(bob.Id, now)
			require.NoError(t, err)
			require.Len(t, withNoGrant, 2)
			for _, voucher := range withNoGrant {
				if voucher.Id == noGrant.Id {
					assert.Empty(t, voucher.Reason)
					continue
				}
				assert.Equal(t, "October thanks", voucher.Reason)
			}
			require.NoError(t, db.Delete(&noGrant).Error)
			// A sealed voucher cannot be marked as seen. The notice is the only
			// place that opens one, so acknowledging it here would strand the
			// money outside every screen until it lapsed.
			acknowledged, err := AcknowledgeVouchers(bob.Id, []int64{bobVoucher.Id}, now)
			require.NoError(t, err)
			assert.Zero(t, acknowledged)
			pending, err = ListPendingVouchers(bob.Id, now)
			require.NoError(t, err)
			require.Len(t, pending, 1, "the sealed voucher stays in the notice")
			var acknowledgedVoucher Voucher
			require.NoError(t, db.First(&acknowledgedVoucher, bobVoucher.Id).Error)
			assert.Equal(t, VoucherStatusUnopened, acknowledgedVoucher.Status)
			assert.Zero(t, acknowledgedVoucher.AcknowledgedAt)

			// Once opened it can be marked as seen, and repeating that changes
			// nothing.
			reopened, err := OpenVouchers(bob.Id, []int64{bobVoucher.Id}, now)
			require.NoError(t, err)
			require.Len(t, reopened.Opened, 1)
			acknowledged, err = AcknowledgeVouchers(bob.Id, []int64{bobVoucher.Id}, now)
			require.NoError(t, err)
			assert.EqualValues(t, 1, acknowledged)
			acknowledged, err = AcknowledgeVouchers(bob.Id, []int64{bobVoucher.Id}, now)
			require.NoError(t, err)
			assert.Zero(t, acknowledged)
			pending, err = ListPendingVouchers(bob.Id, now)
			require.NoError(t, err)
			assert.Empty(t, pending)

			// A voucher that lapsed between two sweeps is lapsed on opening
			// instead of being paid out.
			// Bob's balance already carries the voucher opened just above, so the
			// contract here is that a lapsed voucher changes nothing.
			balanceBefore := voucherTestUser(t, bob.Id).Quota
			late := Voucher{UserId: bob.Id, FaceValue: 500_000, Status: VoucherStatusUnopened, ExpiresAt: now.Add(-time.Minute).Unix(), Source: VoucherSourceAdmin, CreatedAt: now.Unix()}
			require.NoError(t, db.Create(&late).Error)
			lapsed, err := OpenVouchers(bob.Id, []int64{late.Id}, now)
			require.NoError(t, err)
			assert.Equal(t, []int64{late.Id}, lapsed.Skipped)
			assert.Zero(t, lapsed.OpenedQuota)
			var lapsedVoucher Voucher
			require.NoError(t, db.First(&lapsedVoucher, late.Id).Error)
			assert.Equal(t, VoucherStatusExpired, lapsedVoucher.Status)
			assert.Equal(t, balanceBefore, voucherTestUser(t, bob.Id).Quota,
				"a lapsed voucher credits nothing")

			// The sweep lapses unopened vouchers only, and repeating it is a no-op.
			expired, err := ExpireVouchers(now)
			require.NoError(t, err)
			assert.Zero(t, expired)
			expired, err = ExpireVouchers(now)
			require.NoError(t, err)
			assert.Zero(t, expired)
			// An opened voucher keeps its status past its deadline.
			require.NoError(t, db.Model(&Voucher{}).Where("id = ?", aliceVoucher.Id).UpdateColumn("expires_at", now.Add(-time.Hour).Unix()).Error)
			expired, err = ExpireVouchers(now)
			require.NoError(t, err)
			assert.Zero(t, expired)

			// Granting everyone needs the confirmed recipient snapshot, and it
			// reaches the ordinary accounts only.
			allGrant := VoucherGrant{RequestId: "voucher-test-request-all-1", Audience: "all", FaceValueYuan: 1, ValidityDays: 7, Reason: "everyone"}
			_, err = CreateVoucherBatch(admin.Id, allGrant, now)
			require.Error(t, err, "granting everyone without a confirmed audience must be refused")
			previewAll, err := PreviewVoucherGrant(allGrant, now)
			require.NoError(t, err)
			assert.EqualValues(t, 2, previewAll["recipients"])
			allGrant.AudienceDigest = previewAll["audience_digest"].(string)
			allBatch, err := CreateVoucherBatch(admin.Id, allGrant, now)
			require.NoError(t, err)
			assert.EqualValues(t, 2, allBatch.RecipientCount)
			mismatched := allGrant
			mismatched.RequestId = "voucher-test-request-all-2"
			mismatched.AudienceDigest = VoucherAudienceDigest([]int{alice.Id})
			_, err = CreateVoucherBatch(admin.Id, mismatched, now)
			require.Error(t, err, "a stale audience snapshot must be refused")

			// The acceptance rule from the design: open a voucher, spend all of
			// it, and the level must not move. Gifted balance is spent first, so
			// the charge lands on bonus_quota instead of level_quota.
			spender := User{Username: "voucher-spender", AffCode: "voucher-spender", Password: "unused", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default"}
			require.NoError(t, db.Create(&spender).Error)
			spendVoucher := Voucher{UserId: spender.Id, FaceValue: 2_500_000, Status: VoucherStatusUnopened,
				ExpiresAt: now.Add(time.Hour).Unix(), Source: VoucherSourceAdmin, CreatedAt: now.Unix()}
			require.NoError(t, db.Create(&spendVoucher).Error)
			_, err = OpenVouchers(spender.Id, []int64{spendVoucher.Id}, now)
			require.NoError(t, err)
			require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
				return applyUserQuotaLedger(tx, spender.Id, -2_500_000, 2_500_000, 1)
			}))
			spent := voucherTestUser(t, spender.Id)
			assert.Zero(t, spent.Quota)
			assert.EqualValues(t, 2_500_000, spent.UsedQuota, "the statistics counter still sees the spend")
			assert.Zero(t, spent.BonusQuota, "the gifted balance is used up first")
			assert.Zero(t, spent.LevelQuota, "gift money must never buy level progress")
			assert.Zero(t, CalculateUsageLevel(spent.LevelQuota, operation_setting.GetUsageLevelThresholds()).Level,
				"the account stays at LV0 after spending a whole voucher")

			// Two simultaneous opens must credit the same voucher exactly once.
			concurrent := Voucher{UserId: spender.Id, FaceValue: 500_000, Status: VoucherStatusUnopened,
				ExpiresAt: now.Add(time.Hour).Unix(), Source: VoucherSourceAdmin, CreatedAt: now.Unix()}
			require.NoError(t, db.Create(&concurrent).Error)
			start := make(chan struct{})
			type opening struct {
				result *VoucherOpenResult
				err    error
			}
			openings := make(chan opening, 2)
			for range 2 {
				go func() {
					<-start
					result, err := OpenVouchers(spender.Id, []int64{concurrent.Id}, now)
					openings <- opening{result, err}
				}()
			}
			close(start)
			var credited int64
			for range 2 {
				opened := <-openings
				require.NoError(t, opened.err)
				credited += opened.result.OpenedQuota
			}
			assert.EqualValues(t, 500_000, credited)
			assert.EqualValues(t, 500_000, voucherTestUser(t, spender.Id).Quota)

			// A credit beyond the wallet limit rolls the whole opening back,
			// including both voucher states and the gift ledger.
			require.NoError(t, db.Model(&User{}).Where("id = ?", spender.Id).Updates(map[string]any{
				"quota": common.MaxWalletQuota - 1, "bonus_quota": 0,
			}).Error)
			bounded := []Voucher{
				{UserId: spender.Id, FaceValue: 1, Status: VoucherStatusUnopened, ExpiresAt: now.Add(time.Hour).Unix(), Source: VoucherSourceAdmin, CreatedAt: now.Unix()},
				{UserId: spender.Id, FaceValue: 1, Status: VoucherStatusUnopened, ExpiresAt: now.Add(time.Hour).Unix(), Source: VoucherSourceAdmin, CreatedAt: now.Unix()},
			}
			require.NoError(t, db.Create(&bounded).Error)
			_, err = OpenVouchers(spender.Id, []int64{bounded[0].Id, bounded[1].Id}, now)
			require.Error(t, err)
			assert.EqualValues(t, common.MaxWalletQuota-1, voucherTestUser(t, spender.Id).Quota)
			assert.Zero(t, voucherTestUser(t, spender.Id).BonusQuota)
			require.NoError(t, db.Where("id IN ?", []int64{bounded[0].Id, bounded[1].Id}).Find(&bounded).Error)
			for _, voucher := range bounded {
				assert.Equal(t, VoucherStatusUnopened, voucher.Status)
				assert.Zero(t, voucher.OpenedAt)
			}
		})
	}
}
