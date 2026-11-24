package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// legacyMigrationTables lists everything the conversion touches.
func legacyMigrationTables() []any {
	return []any{&User{}, &Voucher{}, &VoucherBatch{}, &TokenPlanAccount{}, &TokenPlanWeek{},
		&TokenPlanResetCoupon{}, &TokenPlanCouponBatch{}}
}

func setupLegacyMigrationDB(t *testing.T, engine string) {
	t.Helper()
	setupReferralDB(t, engine)
	// setupReferralDB only cleans the referral tables, and MySQL/PostgreSQL keep
	// their rows between runs, so the voucher tables need their own reset.
	require.NoError(t, DB.Migrator().DropTable(legacyMigrationTables()...))
	require.NoError(t, DB.AutoMigrate(legacyMigrationTables()...))
	t.Cleanup(func() { _ = DB.Migrator().DropTable(legacyMigrationTables()...) })
	previousUnit := common.QuotaPerUnit
	previousRate := operation_setting.USDExchangeRate
	common.QuotaPerUnit = 500000
	// Production runs 1:1, so ¥1 is one unit of money here too and the
	// expectations below can be read as money.
	operation_setting.USDExchangeRate = 1
	t.Cleanup(func() {
		common.QuotaPerUnit = previousUnit
		operation_setting.USDExchangeRate = previousRate
	})
}

func createLegacyUser(t *testing.T, username string, levelQuota int) *User {
	t.Helper()
	user := &User{Username: username, Email: username + "@example.test", AffCode: username + "aff",
		Status: common.UserStatusEnabled, Role: common.RoleCommonUser, LevelQuota: levelQuota}
	require.NoError(t, DB.Create(user).Error)
	return user
}

// TestLegacyCouponsBecomeVouchersWithTheirOwnDeadline covers the product rule:
// a still-openable reset coupon turns into a voucher of the same value that
// keeps the coupon's deadline, and one that already lapsed is not converted.
func TestLegacyCouponsBecomeVouchersWithTheirOwnDeadline(t *testing.T) {
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(engine, func(t *testing.T) {
			testLegacyCouponsBecomeVouchers(t, engine)
		})
	}
}

func testLegacyCouponsBecomeVouchers(t *testing.T, engine string) {
	setupLegacyMigrationDB(t, engine)
	now := time.Unix(1793000000, 0)
	user := createLegacyUser(t, "couponowner", 0)

	live := int64(1794000000)
	for _, coupon := range []TokenPlanResetCoupon{
		{UserId: user.Id, BatchId: 1, Ordinal: 1, Multiplier: 1, ExpiresAt: live, Status: "available"},
		{UserId: user.Id, BatchId: 1, Ordinal: 2, Multiplier: 3, ExpiresAt: live, Status: "available"},
		{UserId: user.Id, BatchId: 1, Ordinal: 3, Multiplier: 10, ExpiresAt: live, Status: "available"},
		{UserId: user.Id, BatchId: 1, Ordinal: 4, Multiplier: 5, ExpiresAt: now.Unix() - 1, Status: "available"},
		{UserId: user.Id, BatchId: 1, Ordinal: 5, Multiplier: 10, ExpiresAt: live, Status: "used"},
	} {
		coupon := coupon
		require.NoError(t, DB.Create(&coupon).Error)
	}

	report, err := MigrateLegacyCouponsToVouchers(now, false)
	require.NoError(t, err)
	assert.Equal(t, 3, report.Converted, "×1, ×3 and ×10 become vouchers")
	assert.Equal(t, 1, report.Lapsed, "the coupon that already expired is not converted")

	var vouchers []Voucher
	require.NoError(t, DB.Order("face_value").Find(&vouchers).Error)
	require.Len(t, vouchers, 3)
	// ¥1, ¥3 and ¥10 at 500000 quota per unit.
	assert.Equal(t, []int64{500000, 1500000, 5000000}, []int64{
		vouchers[0].FaceValue, vouchers[1].FaceValue, vouchers[2].FaceValue})
	for _, voucher := range vouchers {
		assert.Equal(t, VoucherStatusUnopened, voucher.Status)
		assert.Equal(t, VoucherSourceLegacyCoupon, voucher.Source)
		assert.Equal(t, live, voucher.ExpiresAt, "the coupon's own deadline is kept")
	}

	var lapsed TokenPlanResetCoupon
	require.NoError(t, DB.Where("ordinal = ?", 4).First(&lapsed).Error)
	assert.Equal(t, "expired", lapsed.Status)
	var used TokenPlanResetCoupon
	require.NoError(t, DB.Where("ordinal = ?", 5).First(&used).Error)
	assert.Equal(t, "used", used.Status, "an already spent coupon is left alone")

	// A second pass finds no available coupon at all, because the first pass
	// retired every one it converted.
	again, err := MigrateLegacyCouponsToVouchers(now, false)
	require.NoError(t, err)
	assert.Zero(t, again.Converted)
	assert.Zero(t, again.Skipped)
	var count int64
	require.NoError(t, DB.Model(&Voucher{}).Count(&count).Error)
	assert.EqualValues(t, 3, count, "no voucher is duplicated")
}

// TestLegacyWeeklyQuotaBecomesOneVoucherPerAccount covers the second half: the
// unused allowance of the current week becomes one 30-day voucher, and an
// account with nothing left gets none.
func TestLegacyWeeklyQuotaBecomesOneVoucherPerAccount(t *testing.T) {
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(engine, func(t *testing.T) {
			testLegacyWeeklyQuotaBecomesOneVoucher(t, engine)
		})
	}
}

func testLegacyWeeklyQuotaBecomesOneVoucher(t *testing.T, engine string) {
	setupLegacyMigrationDB(t, engine)
	now := time.Unix(1793000000, 0)
	weekStart := TokenPlanWeekStart(now)

	// LV1 has a ¥0.5 base, i.e. 250000 quota.
	// LevelQuota 1 puts the account on LV1, whose weekly base is ¥0.5.
	spent := createLegacyUser(t, "spent", 1)
	untouched := createLegacyUser(t, "untouched", 1)
	empty := createLegacyUser(t, "empty", 1)
	for _, week := range []TokenPlanWeek{
		{UserId: spent.Id, WeekStart: weekStart.Unix(), UsedQuota: 100000, Multiplier: 1},
		{UserId: untouched.Id, WeekStart: weekStart.Unix(), UsedQuota: 0, Multiplier: 1},
		{UserId: empty.Id, WeekStart: weekStart.Unix(), UsedQuota: 250000, Multiplier: 1},
	} {
		week := week
		require.NoError(t, DB.Create(&week).Error)
		require.NoError(t, DB.Create(&TokenPlanAccount{UserId: week.UserId, TokenId: week.UserId}).Error)
	}

	report, err := MigrateLegacyWeeklyQuota(now, false)
	require.NoError(t, err)
	assert.Equal(t, 2, report.Converted, "two accounts still have allowance left")
	assert.Equal(t, 1, report.Skipped, "the account that spent it all gets nothing")

	var vouchers []Voucher
	require.NoError(t, DB.Order("user_id").Find(&vouchers).Error)
	require.Len(t, vouchers, 2)
	// Remaining is 250000-100000 and 250000-0.
	assert.Equal(t, []int64{150000, 250000}, []int64{vouchers[0].FaceValue, vouchers[1].FaceValue})
	for _, voucher := range vouchers {
		assert.Equal(t, VoucherSourceLegacyQuota, voucher.Source)
		assert.Equal(t, now.AddDate(0, 0, legacyQuotaValidityDays).Unix(), voucher.ExpiresAt)
	}

	again, err := MigrateLegacyWeeklyQuota(now, false)
	require.NoError(t, err)
	assert.Zero(t, again.Converted, "the batches already exist, so nothing is reissued")
	assert.Equal(t, 3, again.Skipped)
}

// TestLegacyCouponValueTable pins the product decision, including the ×1 case
// that used to be worth nothing as a multiplier.
func TestLegacyCouponValueTable(t *testing.T) {
	for multiplier, want := range map[int]float64{1: 1, 3: 3, 5: 5, 10: 10} {
		got, err := LegacyCouponFaceValueYuan(multiplier)
		require.NoError(t, err)
		assert.Equal(t, want, got, "×%d", multiplier)
	}
	_, err := LegacyCouponFaceValueYuan(7)
	assert.ErrorIs(t, err, ErrLegacyCouponUnmapped)
}

// TestLegacyMigrationDryRunWritesNothing keeps the preview honest: it must
// report the same totals a real run would convert while leaving every row
// untouched, so an operator can size the cost before committing.
func TestLegacyMigrationDryRunWritesNothing(t *testing.T) {
	setupLegacyMigrationDB(t, "sqlite")
	now := time.Unix(1793000000, 0)
	user := createLegacyUser(t, "dryrunner", 1)
	weekStart := TokenPlanWeekStart(now)

	live := int64(1794000000)
	require.NoError(t, DB.Create(&TokenPlanResetCoupon{UserId: user.Id, BatchId: 1, Ordinal: 1,
		Multiplier: 3, ExpiresAt: live, Status: "available"}).Error)
	require.NoError(t, DB.Create(&TokenPlanResetCoupon{UserId: user.Id, BatchId: 1, Ordinal: 2,
		Multiplier: 5, ExpiresAt: now.Unix() - 1, Status: "available"}).Error)
	require.NoError(t, DB.Create(&TokenPlanWeek{UserId: user.Id, WeekStart: weekStart.Unix(),
		UsedQuota: 100000, Multiplier: 1}).Error)
	require.NoError(t, DB.Create(&TokenPlanAccount{UserId: user.Id, TokenId: user.Id}).Error)

	coupons, err := MigrateLegacyCouponsToVouchers(now, true)
	require.NoError(t, err)
	assert.Equal(t, 1, coupons.Converted)
	assert.Equal(t, 1, coupons.Lapsed)
	quota, err := MigrateLegacyWeeklyQuota(now, true)
	require.NoError(t, err)
	assert.Equal(t, 1, quota.Converted)

	var vouchers int64
	require.NoError(t, DB.Model(&Voucher{}).Count(&vouchers).Error)
	assert.Zero(t, vouchers, "a dry run writes no voucher")
	var batches int64
	require.NoError(t, DB.Model(&VoucherBatch{}).Count(&batches).Error)
	assert.Zero(t, batches, "a dry run writes no batch")
	var stillAvailable TokenPlanResetCoupon
	require.NoError(t, DB.Where("ordinal = ?", 2).First(&stillAvailable).Error)
	assert.Equal(t, "available", stillAvailable.Status, "a dry run does not lapse anything")

	// The real run then reports exactly what the preview promised.
	real, err := MigrateLegacyCouponsToVouchers(now, false)
	require.NoError(t, err)
	assert.Equal(t, coupons.Converted, real.Converted)
	assert.Equal(t, coupons.TotalQuota, real.TotalQuota)
}

// TestLegacyWeeklyQuotaFollowsTheActiveCycle covers the trap the Monday lookup
// fell into: a coupon reset writes a negative week key, and a personal cycle
// follows its anchor, so looking the ledger up by "this week's Monday" either
// misses the account entirely or converts a stale pre-reset row.
func TestLegacyWeeklyQuotaFollowsTheActiveCycle(t *testing.T) {
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(engine, func(t *testing.T) {
			testLegacyWeeklyQuotaFollowsTheActiveCycle(t, engine)
		})
	}
}

func testLegacyWeeklyQuotaFollowsTheActiveCycle(t *testing.T, engine string) {
	setupLegacyMigrationDB(t, engine)
	now := time.Unix(1793000000, 0)

	// A coupon cycle: the ledger is keyed by the coupon, not by a Monday, and
	// the stale Monday row from before the reset still exists with a large
	// untouched balance.
	couponUser := createLegacyUser(t, "couponcycle", 1)
	couponWeek := TokenPlanWeek{UserId: couponUser.Id, WeekStart: -77, CycleStart: now.Unix() - 100,
		CycleEnd: now.Unix() + 1000, Multiplier: 10, UsedQuota: 100000}
	require.NoError(t, DB.Create(&couponWeek).Error)
	stale := TokenPlanWeek{UserId: couponUser.Id, WeekStart: TokenPlanWeekStart(now).Unix(),
		CycleStart: TokenPlanWeekStart(now).Unix(), CycleEnd: now.Unix() - 1, Multiplier: 1}
	require.NoError(t, DB.Create(&stale).Error)
	require.NoError(t, DB.Create(&TokenPlanAccount{UserId: couponUser.Id, TokenId: 1,
		CycleAnchor: 1, CurrentWeekId: couponWeek.Id}).Error)

	// A personal cycle that rolled over: the anchor is set but the new ledger
	// has not been created, so nothing is outstanding.
	anchor := now.Unix() - tokenPlanCycleSeconds - 100
	rolledUser := createLegacyUser(t, "rolledover", 1)
	oldWeek := TokenPlanWeek{UserId: rolledUser.Id, WeekStart: anchor,
		CycleStart: anchor, CycleEnd: anchor + tokenPlanCycleSeconds, Multiplier: 1, UsedQuota: 0}
	require.NoError(t, DB.Create(&oldWeek).Error)
	require.NoError(t, DB.Create(&TokenPlanAccount{UserId: rolledUser.Id, TokenId: 2,
		CycleAnchor: anchor, CurrentWeekId: oldWeek.Id}).Error)

	report, err := MigrateLegacyWeeklyQuota(now, false)
	require.NoError(t, err)
	assert.Equal(t, 1, report.Converted, "only the coupon cycle has allowance left")
	// A cycle that already rolled over converts nothing: its allowance lapsed
	// with the old cycle and the migration does not resurrect it.
	assert.Equal(t, 1, report.Skipped, "the rolled-over account converts nothing")

	var vouchers []Voucher
	require.NoError(t, DB.Find(&vouchers).Error)
	require.Len(t, vouchers, 1)
	assert.Equal(t, couponUser.Id, vouchers[0].UserId)
	// LV1 base is ¥0.5 = 250000, the coupon cycle is ×10, so 2500000 total and
	// 100000 already spent.
	assert.EqualValues(t, 2_400_000, vouchers[0].FaceValue,
		"the coupon cycle's own multiplier and spend decide the amount")
}

// TestLegacyCouponIsRetiredWithItsVoucher closes the double-spend window: the
// reset path still honours any available coupon, so converting one without
// retiring it would hand out the same value twice.
func TestLegacyCouponIsRetiredWithItsVoucher(t *testing.T) {
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(engine, func(t *testing.T) {
			testLegacyCouponIsRetiredWithItsVoucher(t, engine)
		})
	}
}

func testLegacyCouponIsRetiredWithItsVoucher(t *testing.T, engine string) {
	setupLegacyMigrationDB(t, engine)
	now := time.Unix(1793000000, 0)
	user := createLegacyUser(t, "retiree", 1)

	coupon := TokenPlanResetCoupon{UserId: user.Id, BatchId: 1, Ordinal: 1, Multiplier: 10,
		ExpiresAt: now.Unix() + 86400, Status: "available"}
	require.NoError(t, DB.Create(&coupon).Error)

	report, err := MigrateLegacyCouponsToVouchers(now, false)
	require.NoError(t, err)
	assert.Equal(t, 1, report.Converted)

	var retired TokenPlanResetCoupon
	require.NoError(t, DB.First(&retired, coupon.Id).Error)
	assert.Equal(t, "converted", retired.Status,
		"the coupon must not stay available after its voucher exists")

	// The second pass sees no available coupon and writes nothing.
	again, err := MigrateLegacyCouponsToVouchers(now, false)
	require.NoError(t, err)
	assert.Zero(t, again.Converted)
}
