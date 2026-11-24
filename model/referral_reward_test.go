package model

import (
	"fmt"
	"os"
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

// referralTables lists every table the referral reward path touches.
func referralTables() []any {
	return []any{&User{}, &Token{}, &ReferralReward{}, &Option{}, &RegistrationReward{}, &RegistrationRewardLock{}, &Log{}, &Voucher{}, &VoucherBatch{}}
}

// setupReferralDB runs the reward path against real SQLite, MySQL and
// PostgreSQL instances so migration and unique-index behavior is verified on
// all three supported engines.
func setupReferralDB(t *testing.T, engine string) *gorm.DB {
	t.Helper()
	var driver gorm.Dialector
	dbType := common.DatabaseTypeSQLite
	switch engine {
	case "sqlite":
		driver = sqlite.Open(":memory:")
	case "mysql":
		dsn := os.Getenv("TEST_MYSQL_DSN")
		if dsn == "" {
			t.Skip("TEST_MYSQL_DSN is not configured")
		}
		driver, dbType = mysql.Open(dsn), common.DatabaseTypeMySQL
	case "postgres":
		dsn := os.Getenv("TEST_POSTGRES_DSN")
		if dsn == "" {
			t.Skip("TEST_POSTGRES_DSN is not configured")
		}
		driver, dbType = postgres.Open(dsn), common.DatabaseTypePostgreSQL
	default:
		t.Fatalf("unknown engine %q", engine)
	}
	prefix := fmt.Sprintf("ref_%s_", engine)
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
		_ = db.Migrator().DropTable(referralTables()...)
		_ = sqlDB.Close()
		DB, LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		initCol()
		common.RedisEnabled, common.BatchUpdateEnabled = previousRedis, previousBatch
	})
	require.NoError(t, db.Migrator().DropTable(referralTables()...))
	// Two startups must stay idempotent on a fresh schema.
	require.NoError(t, db.AutoMigrate(referralTables()...))
	require.NoError(t, db.AutoMigrate(referralTables()...))
	return db
}

func createReferralUser(t *testing.T, username, email string, status int) *User {
	t.Helper()
	user := &User{Username: username, Email: email, AffCode: username + "aff", Status: status, Role: common.RoleCommonUser}
	require.NoError(t, DB.Create(user).Error)
	return user
}

func inviterRewardYuan(t *testing.T, inviterId int) []int {
	t.Helper()
	var rewards []ReferralReward
	require.NoError(t, DB.Where("inviter_id = ? AND inviter_voucher_id > 0", inviterId).Order("id").Find(&rewards).Error)
	yuan := make([]int, 0, len(rewards))
	for _, reward := range rewards {
		yuan = append(yuan, reward.InviterMultiplier)
	}
	return yuan
}

func referralVoucherCount(t *testing.T) int64 {
	t.Helper()
	var count int64
	require.NoError(t, DB.Model(&Voucher{}).Where("source = ?", VoucherSourceReferral).Count(&count).Error)
	return count
}

func referralFaceValue(t *testing.T, yuan int) int64 {
	t.Helper()
	value, err := VoucherFaceValueFromYuan(float64(yuan))
	require.NoError(t, err)
	return int64(value)
}

func referralVoucher(t *testing.T, id int64) Voucher {
	t.Helper()
	var voucher Voucher
	require.NoError(t, DB.First(&voucher, id).Error)
	return voucher
}

// TestReferralRewardLadderAndIdempotency covers the confirmed product rules:
// 1/3/5 yuan for the first three rewarded invitations, 1 yuan afterwards, 3
// yuan for every invitee, one voucher per side and 30 days of validity.
func TestReferralRewardLadderAndIdempotency(t *testing.T) {
	now := time.Unix(1792200000, 0)
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(engine, func(t *testing.T) {
			setupReferralDB(t, engine)
			previousVerification := common.EmailVerificationEnabled
			common.EmailVerificationEnabled = true
			t.Cleanup(func() { common.EmailVerificationEnabled = previousVerification })

			inviter := createReferralUser(t, "inviter", "inviter@example.test", common.UserStatusEnabled)
			for i := 1; i <= 4; i++ {
				invitee := createReferralUser(t, fmt.Sprintf("invitee%d", i), fmt.Sprintf("invitee%d@example.test", i), common.UserStatusEnabled)
				require.NoError(t, CreateReferralReward(DB, inviter.Id, invitee.Id, now))
				// A duplicate registration callback must not create a second reward.
				require.NoError(t, CreateReferralReward(DB, inviter.Id, invitee.Id, now))
				reward, err := IssueReferralReward(invitee.Id, now)
				require.NoError(t, err)
				require.Equal(t, ReferralRewardIssued, reward.Status)
				require.Equal(t, ReferralInviteeRewardYuan, reward.InviteeMultiplier)

				inviteeBatch := VoucherBatch{}
				require.NoError(t, DB.First(&inviteeBatch, reward.InviteeBatchId).Error)
				assert.Equal(t, float64(ReferralInviteeRewardYuan), inviteeBatch.FaceValueYuan)
				assert.Equal(t, referralVoucherValidityDays, inviteeBatch.ValidityDays)
				inviteeVoucher := referralVoucher(t, reward.InviteeVoucherId)
				assert.Equal(t, VoucherSourceReferral, inviteeVoucher.Source)
				assert.Equal(t, VoucherStatusUnopened, inviteeVoucher.Status)
				assert.Equal(t, inviteeBatch.FaceValue, inviteeVoucher.FaceValue)
				assert.Equal(t, now.AddDate(0, 0, referralVoucherValidityDays).Unix(), inviteeVoucher.ExpiresAt)
			}

			var rewardCount int64
			require.NoError(t, DB.Model(&ReferralReward{}).Count(&rewardCount).Error)
			assert.EqualValues(t, 4, rewardCount, "one reward row per invitee")
			assert.Equal(t, []int{1, 3, 5, 1}, inviterRewardYuan(t, inviter.Id))

			var inviterUser User
			require.NoError(t, DB.Select("aff_count").First(&inviterUser, inviter.Id).Error)
			assert.Equal(t, 4, inviterUser.AffCount, "the invite count follows recorded rewards")

			// A replay must not create vouchers or push the expiry forward.
			var before []Voucher
			require.NoError(t, DB.Order("id").Find(&before).Error)
			firstReward := &ReferralReward{}
			require.NoError(t, DB.Order("id").First(firstReward).Error)
			replayed, err := IssueReferralReward(firstReward.InviteeId, now.Add(72*time.Hour))
			require.NoError(t, err)
			assert.Equal(t, firstReward.InviteeVoucherId, replayed.InviteeVoucherId)
			var after []Voucher
			require.NoError(t, DB.Order("id").Find(&after).Error)
			assert.Equal(t, before, after, "replays keep every voucher untouched")
			var unchangedTokenPlan User
			require.NoError(t, DB.Select("aff_count").First(&unchangedTokenPlan, inviter.Id).Error)
			assert.Equal(t, 4, unchangedTokenPlan.AffCount, "replays do not advance the ladder")
		})
	}
}

// TestReferralRewardEmailGateAndDisabledInviter covers the pending and partial
// paths: an unverified invitee waits, a disabled inviter loses only its own
// voucher and does not consume a ladder step.
func TestReferralRewardEmailGateAndDisabledInviter(t *testing.T) {
	now := time.Unix(1792200000, 0)
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(engine, func(t *testing.T) {
			setupReferralDB(t, engine)
			previousVerification := common.EmailVerificationEnabled
			common.EmailVerificationEnabled = true
			t.Cleanup(func() { common.EmailVerificationEnabled = previousVerification })

			inviter := createReferralUser(t, "inviter", "inviter@example.test", common.UserStatusEnabled)
			invitee := createReferralUser(t, "pending", "", common.UserStatusEnabled)
			require.NoError(t, CreateReferralReward(DB, inviter.Id, invitee.Id, now))

			reward, err := IssueReferralReward(invitee.Id, now)
			require.NoError(t, err)
			assert.Equal(t, ReferralRewardPending, reward.Status)
			assert.Equal(t, referralPendingEmailUnverified, reward.PendingReason)
			assert.Zero(t, referralVoucherCount(t), "no voucher before the address is verified")

			require.NoError(t, DB.Model(&User{}).Where("id = ?", invitee.Id).Update("email", "pending@example.test").Error)
			reward, err = IssueReferralReward(invitee.Id, now)
			require.NoError(t, err)
			assert.Equal(t, ReferralRewardIssued, reward.Status)
			assert.NotZero(t, reward.InviteeVoucherId)
			assert.NotZero(t, reward.InviterVoucherId)
			assert.Equal(t, []int{1}, inviterRewardYuan(t, inviter.Id))

			require.NoError(t, DB.Model(&User{}).Where("id = ?", inviter.Id).Update("status", common.UserStatusDisabled).Error)
			blocked := createReferralUser(t, "blocked", "blocked@example.test", common.UserStatusEnabled)
			require.NoError(t, CreateReferralReward(DB, inviter.Id, blocked.Id, now))
			reward, err = IssueReferralReward(blocked.Id, now)
			require.NoError(t, err)
			assert.Equal(t, ReferralRewardIssued, reward.Status)
			assert.NotZero(t, reward.InviteeVoucherId, "the invitee keeps its own voucher")
			assert.Zero(t, reward.InviterVoucherId)
			assert.Equal(t, referralNoteInviterDisabled, reward.Note)
			assert.Equal(t, []int{1}, inviterRewardYuan(t, inviter.Id), "a disabled inviter is skipped")

			var inviterUser User
			require.NoError(t, DB.Select("aff_count").First(&inviterUser, inviter.Id).Error)
			assert.Equal(t, 1, inviterUser.AffCount, "only rewarded invitations count")

			// A side that never received anything stays blank, while a reward
			// issued before vouchers keeps the historical marker on the side
			// that actually holds the old coupon.
			require.NoError(t, DB.Model(&ReferralReward{}).Where("invitee_id = ?", blocked.Id).Update("invitee_coupon_id", 77).Error)
			overview, err := GetUserReferralOverview(inviter.Id, 20, now)
			require.NoError(t, err)
			for _, item := range overview.Rewards {
				if item.Invitee == MaskReferralName("blocked") {
					assert.Empty(t, item.VoucherStatus, "a disabled inviter has no voucher side")
				}
			}
			rows, _, err := ListAdminReferralRewards(ReferralRewardIssued, 0, 10, now)
			require.NoError(t, err)
			for _, row := range rows {
				if row.InviteeId != blocked.Id {
					continue
				}
				assert.Equal(t, referralVoucherStatusLegacyCoupon, row.InviteeVoucherStatus)
				assert.Empty(t, row.InviterVoucherStatus)
			}
		})
	}
}

// TestReferralRewardReissueKeepsIssuedVouchers verifies the administrator retry
// path stays idempotent and never refreshes an existing voucher.
func TestReferralRewardReissueKeepsIssuedVouchers(t *testing.T) {
	now := time.Unix(1792200000, 0)
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(engine, func(t *testing.T) {
			setupReferralDB(t, engine)
			previousVerification := common.EmailVerificationEnabled
			common.EmailVerificationEnabled = true
			t.Cleanup(func() { common.EmailVerificationEnabled = previousVerification })

			inviter := createReferralUser(t, "inviter", "inviter@example.test", common.UserStatusEnabled)
			invitee := createReferralUser(t, "invitee", "invitee@example.test", common.UserStatusEnabled)
			require.NoError(t, CreateReferralReward(DB, inviter.Id, invitee.Id, now))
			reward, err := IssueReferralReward(invitee.Id, now)
			require.NoError(t, err)

			voucher := referralVoucher(t, reward.InviteeVoucherId)
			reissued, err := ReissueReferralReward(reward.Id, now.Add(48*time.Hour))
			require.NoError(t, err)
			assert.Equal(t, reward.InviteeVoucherId, reissued.InviteeVoucherId)
			assert.Equal(t, voucher.ExpiresAt, referralVoucher(t, reward.InviteeVoucherId).ExpiresAt, "reissue must not extend the validity")

			assert.EqualValues(t, 2, referralVoucherCount(t), "one voucher for each side")

			overview, err := GetUserReferralOverview(inviter.Id, 10, now)
			require.NoError(t, err)
			require.Len(t, overview.Rewards, 1)
			assert.Equal(t, "i***e", overview.Rewards[0].Invitee, "the inviter sees a masked identity")
			assert.Equal(t, []int{1, 3, 5, 1}, func() []int {
				steps := make([]int, 0, len(overview.Ladder))
				for _, step := range overview.Ladder {
					steps = append(steps, step.RewardYuan)
				}
				return steps
			}())
			assert.Equal(t, 3, overview.NextRewardYuan)
			assert.Equal(t, VoucherStatusUnopened, overview.Rewards[0].VoucherStatus)
			assert.Equal(t, int64(1), overview.AvailableVouchers)
			adminRows, total, err := ListAdminReferralRewards(ReferralRewardIssued, 0, 10, now)
			require.NoError(t, err)
			assert.EqualValues(t, 1, total)
			require.Len(t, adminRows, 1)
			assert.Equal(t, "invitee", adminRows[0].Invitee, "administrators see the full relation")
		})
	}
}

// TestReferralRewardBackfillPaysFrozenRewards protects the recovery path for
// rewards that waited only because reset coupons were retired: the startup
// retry pays their vouchers once and never duplicates them.
func TestReferralRewardBackfillPaysFrozenRewards(t *testing.T) {
	now := time.Unix(1792200000, 0)
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(engine, func(t *testing.T) {
			setupReferralDB(t, engine)
			previousVerification := common.EmailVerificationEnabled
			common.EmailVerificationEnabled = true
			t.Cleanup(func() { common.EmailVerificationEnabled = previousVerification })

			inviter := createReferralUser(t, "frozen_owner", "owner@example.test", common.UserStatusEnabled)
			invitee := createReferralUser(t, "frozen_invitee", "invitee@example.test", common.UserStatusEnabled)
			require.NoError(t, CreateReferralReward(DB, inviter.Id, invitee.Id, now))
			require.NoError(t, DB.Model(&ReferralReward{}).Where("invitee_id = ?", invitee.Id).
				Updates(map[string]any{"status": ReferralRewardPending, "pending_reason": referralPendingTokenPlanRetired}).Error)

			issued, err := RetryPendingReferralRewards(now)
			require.NoError(t, err)
			assert.Equal(t, 1, issued)

			var stored ReferralReward
			require.NoError(t, DB.Where("invitee_id = ?", invitee.Id).First(&stored).Error)
			assert.Equal(t, ReferralRewardIssued, stored.Status)
			assert.Empty(t, stored.PendingReason)
			assert.Equal(t, int64(ReferralInviteeRewardYuan), referralVoucher(t, stored.InviteeVoucherId).FaceValue/referralFaceValue(t, 1))
			assert.Equal(t, int64(1), referralVoucher(t, stored.InviterVoucherId).FaceValue/referralFaceValue(t, 1))
			assert.EqualValues(t, 2, referralVoucherCount(t))

			again, err := RetryPendingReferralRewards(now.Add(time.Hour))
			require.NoError(t, err)
			assert.Zero(t, again, "an issued reward is never paid twice")
			assert.EqualValues(t, 2, referralVoucherCount(t))
		})
	}
}

// TestRegistrationRiskVerificationAndRewards protects the full release contract
// on every supported database, including replay and an admin retry bypass.
func TestRegistrationRiskVerificationAndRewards(t *testing.T) {
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(engine, func(t *testing.T) {
			setupReferralDB(t, engine)
			require.NoError(t, DB.AutoMigrate(&AuthFlow{}))
			t.Cleanup(func() {
				DB.Where("purpose IN ?", []string{registrationVerificationPurpose, "registration_reward_proof"}).Delete(&AuthFlow{})
			})
			now := time.Now().Truncate(time.Second)
			oldSignup, oldInvitee, oldInviter := common.QuotaForNewUser, common.QuotaForInvitee, common.QuotaForInviter
			common.QuotaForNewUser, common.QuotaForInvitee, common.QuotaForInviter = 100, 25, 50
			oldPayment := *operation_setting.GetPaymentSetting()
			operation_setting.GetPaymentSetting().ComplianceConfirmed = true
			operation_setting.GetPaymentSetting().ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
			t.Cleanup(func() { *operation_setting.GetPaymentSetting() = oldPayment })
			t.Cleanup(func() {
				common.QuotaForNewUser, common.QuotaForInvitee, common.QuotaForInviter = oldSignup, oldInvitee, oldInviter
			})
			t.Setenv("REGISTRATION_REWARD_IP_THRESHOLD", "3")
			t.Setenv("REGISTRATION_REWARD_DEVICE_THRESHOLD", "2")
			inviter := createReferralUser(t, "reward-owner", "", common.UserStatusEnabled)
			for i := range 2 {
				user := &User{Username: fmt.Sprintf("low%d", i), Status: common.UserStatusEnabled, RegistrationRisk: &RegistrationRisk{IPHash: "ip", DeviceHash: fmt.Sprintf("device%d", i)}}
				require.NoError(t, DB.Transaction(func(tx *gorm.DB) error { return user.InsertWithTx(tx, 0) }))
				require.NoError(t, ReleaseRegistrationReward(user.Id, now))
				require.NoError(t, ReleaseRegistrationReward(user.Id, now))
				var stored User
				require.NoError(t, DB.First(&stored, user.Id).Error)
				assert.Equal(t, 100, stored.Quota)
			}
			risk := &RegistrationRisk{IPHash: "ip", DeviceHash: "new-device"}
			reason, err := RegistrationRiskReason(risk, now)
			require.NoError(t, err)
			assert.Contains(t, reason, "ip_velocity")
			blocked := &User{Username: "blocked-registration", Status: common.UserStatusEnabled, RegistrationRisk: risk}
			err = DB.Transaction(func(tx *gorm.DB) error { return blocked.InsertWithTx(tx, inviter.Id) })
			require.ErrorIs(t, err, ErrRegistrationVerificationRequired)
			var count int64
			require.NoError(t, DB.Model(&User{}).Where("username = ?", blocked.Username).Count(&count).Error)
			assert.Zero(t, count, "failed verification rolls back the account and initial balance")

			token, err := StartRegistrationVerification(risk, "reward@example.test", "123456", now)
			require.NoError(t, err)
			_, err = StartRegistrationVerification(risk, "other@example.test", "123456", now)
			require.Error(t, err, "mail cooldown survives repeated requests")
			_, err = CompleteRegistrationVerification(&RegistrationRisk{IPHash: "other", DeviceHash: risk.DeviceHash}, token, "123456", now)
			require.Error(t, err, "proof cannot move across IPs")
			_, err = CompleteRegistrationVerification(risk, token, "000000", now)
			require.Error(t, err)
			proof, err := CompleteRegistrationVerification(risk, token, "123456", now)
			require.NoError(t, err)
			_, err = CompleteRegistrationVerification(risk, token, "123456", now)
			require.Error(t, err, "email code is single use")
			risk.ProofToken = proof
			eligible := &User{Username: "verified-registration", Status: common.UserStatusEnabled, RegistrationRisk: risk}
			require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
				if err := eligible.InsertWithTx(tx, inviter.Id); err != nil {
					return err
				}
				return CreateReferralReward(tx, inviter.Id, eligible.Id, now)
			}))
			require.NoError(t, ReleaseRegistrationReward(eligible.Id, now))
			reward, err := IssueReferralReward(eligible.Id, now)
			require.NoError(t, err)
			assert.Equal(t, ReferralRewardIssued, reward.Status)
			require.NoError(t, ReleaseRegistrationReward(eligible.Id, now))
			_, err = ReissueReferralReward(reward.Id, now)
			require.NoError(t, err)
			var stored User
			require.NoError(t, DB.First(&stored, eligible.Id).Error)
			assert.Equal(t, 125, stored.Quota)
			var paidInviter User
			require.NoError(t, DB.First(&paidInviter, inviter.Id).Error)
			assert.Equal(t, 50, paidInviter.AffQuota)
			assert.Equal(t, 50, paidInviter.AffHistoryQuota)
			assert.Equal(t, 1, paidInviter.AffCount)
			assert.Equal(t, "reward@example.test", stored.Email)
			assert.EqualValues(t, 2, referralVoucherCount(t))
			replay := &User{Username: "proof-replay", Status: common.UserStatusEnabled, RegistrationRisk: risk}
			require.ErrorIs(t, DB.Transaction(func(tx *gorm.DB) error { return replay.InsertWithTx(tx, 0) }), ErrRegistrationVerificationRequired)

			// A manually pending entitlement is never released by an admin retry or by
			// cleaning up identifying signals; old accounts without one remain eligible.
			pending := createReferralUser(t, "pending-risk", "pending@example.test", common.UserStatusEnabled)
			require.NoError(t, DB.Create(&RegistrationReward{UserId: pending.Id, Reason: "device_reuse", IPHash: "old", DeviceHash: "old", CreatedAt: now.Add(-31 * 24 * time.Hour).Unix(), SignupQuota: 100}).Error)
			require.NoError(t, CreateReferralReward(DB, inviter.Id, pending.Id, now))
			pendingReward, err := IssueReferralReward(pending.Id, now)
			require.NoError(t, err)
			_, err = ReissueReferralReward(pendingReward.Id, now)
			require.NoError(t, err)
			require.NoError(t, ClearExpiredRegistrationSignals(now))
			require.NoError(t, ReleaseRegistrationReward(pending.Id, now))
			// First resets the reused destination ID explicitly.
			var unissued RegistrationReward
			require.NoError(t, DB.First(&unissued, pending.Id).Error)
			assert.Zero(t, unissued.IssuedAt)
			assert.Empty(t, unissued.IPHash)
			assert.Empty(t, unissued.DeviceHash)
			assert.EqualValues(t, 2, referralVoucherCount(t))
		})
	}
}

func TestRegistrationVerificationExpiryAttemptsAndSignalWindows(t *testing.T) {
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(engine, func(t *testing.T) {
			setupReferralDB(t, engine)
			require.NoError(t, DB.AutoMigrate(&AuthFlow{}))
			t.Cleanup(func() { DB.Where("purpose = ?", registrationVerificationPurpose).Delete(&AuthFlow{}) })
			now := time.Now().Truncate(time.Second)
			for i, test := range []struct {
				name     string
				attempts int
				expired  bool
			}{{"locked", 5, false}, {"expired", 0, true}} {
				risk := &RegistrationRisk{IPHash: fmt.Sprintf("attempt-ip%d", i), DeviceHash: "device"}
				token, err := StartRegistrationVerification(risk, fmt.Sprintf("attempt%d@example.test", i), "123456", now)
				require.NoError(t, err)
				for range test.attempts {
					_, err = CompleteRegistrationVerification(risk, token, "000000", now)
					require.Error(t, err)
				}
				verifyAt := now
				if test.expired {
					verifyAt = now.Add(11 * time.Minute)
				}
				_, err = CompleteRegistrationVerification(risk, token, "123456", verifyAt)
				require.Error(t, err, test.name)
			}
			require.NoError(t, DB.Create(&RegistrationReward{UserId: 1000, IPHash: "window-ip", DeviceHash: "used-device", CreatedAt: now.Add(-25 * time.Hour).Unix()}).Error)
			t.Setenv("REGISTRATION_REWARD_IP_THRESHOLD", "2")
			t.Setenv("REGISTRATION_REWARD_DEVICE_THRESHOLD", "2")
			reason, err := RegistrationRiskReason(&RegistrationRisk{IPHash: "window-ip", DeviceHash: "new-device"}, now)
			require.NoError(t, err)
			assert.Empty(t, reason, "IP events older than 24 hours do not trigger")
			reason, err = RegistrationRiskReason(&RegistrationRisk{IPHash: "different-ip", DeviceHash: "used-device"}, now)
			require.NoError(t, err)
			assert.Contains(t, reason, "device_reuse", "changing networks preserves the device signal")
			reason, err = RegistrationRiskReason(&RegistrationRisk{IPHash: "different-ip"}, now)
			require.NoError(t, err)
			assert.Contains(t, reason, "missing_device")
			require.NoError(t, DB.Model(&RegistrationReward{}).Where("user_id = ?", 1000).Update("created_at", now.Add(-31*24*time.Hour).Unix()).Error)
			reason, err = RegistrationRiskReason(&RegistrationRisk{IPHash: "window-ip", DeviceHash: "used-device"}, now)
			require.NoError(t, err)
			assert.Empty(t, reason, "old signals expire")
		})
	}
}

func TestRegistrationRewardConcurrentProofAndRelease(t *testing.T) {
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(engine, func(t *testing.T) {
			setupReferralDB(t, engine)
			require.NoError(t, DB.AutoMigrate(&AuthFlow{}))
			t.Cleanup(func() {
				DB.Where("purpose IN ?", []string{registrationVerificationPurpose, "registration_reward_proof"}).Delete(&AuthFlow{})
			})
			t.Setenv("REGISTRATION_REWARD_IP_THRESHOLD", "1")
			oldQuota := common.QuotaForNewUser
			common.QuotaForNewUser = 100
			t.Cleanup(func() { common.QuotaForNewUser = oldQuota })
			now := time.Now().Truncate(time.Second)
			risk := &RegistrationRisk{IPHash: "concurrent-ip", DeviceHash: "concurrent-device"}
			token, err := StartRegistrationVerification(risk, "concurrent@example.test", "123456", now)
			require.NoError(t, err)
			risk.ProofToken, err = CompleteRegistrationVerification(risk, token, "123456", now)
			require.NoError(t, err)
			results := make(chan error, 2)
			var workers sync.WaitGroup
			for i := range 2 {
				workers.Go(func() {
					user := &User{Username: fmt.Sprintf("concurrent-%d", i), Status: common.UserStatusEnabled, RegistrationRisk: risk}
					results <- DB.Transaction(func(tx *gorm.DB) error { return user.InsertWithTx(tx, 0) })
				})
			}
			workers.Wait()
			close(results)
			succeeded := 0
			for err := range results {
				if err == nil {
					succeeded++
				}
			}
			assert.Equal(t, 1, succeeded, "a registration proof authorizes one account even under concurrency")
			var reward RegistrationReward
			require.NoError(t, DB.First(&reward).Error)
			releaseErrors := make(chan error, 2)
			for range 2 {
				workers.Go(func() { releaseErrors <- ReleaseRegistrationReward(reward.UserId, now) })
			}
			workers.Wait()
			close(releaseErrors)
			for err := range releaseErrors {
				require.NoError(t, err)
			}
			var stored User
			require.NoError(t, DB.First(&stored, reward.UserId).Error)
			assert.Equal(t, 100, stored.Quota, "concurrent retries do not duplicate the wallet credit")
		})
	}
}

// A new promotion round restores the boosted ladder without replaying any
// historical voucher or changing existing attribution, balances or credentials.
func TestReferralRewardNewRound(t *testing.T) {
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(engine, func(t *testing.T) {
			db := setupReferralDB(t, engine)
			previousVerification := common.EmailVerificationEnabled
			common.EmailVerificationEnabled = true
			t.Cleanup(func() { common.EmailVerificationEnabled = previousVerification })
			now := time.Unix(1792200000, 0)
			inviter := createReferralUser(t, "round_owner", "owner@example.test", common.UserStatusEnabled)
			old := createReferralUser(t, "old_invitee", "old@example.test", common.UserStatusEnabled)
			require.NoError(t, CreateReferralReward(db, inviter.Id, old.Id, now))
			issued, err := IssueReferralReward(old.Id, now)
			require.NoError(t, err)
			// Represent an existing boosted award from the previous policy.
			issued.InviterMultiplier = 10
			require.NoError(t, db.Save(issued).Error)
			require.NoError(t, db.Model(&Voucher{}).Where("id = ?", issued.InviterVoucherId).Update("face_value", referralFaceValue(t, 10)).Error)
			before := *issued
			pending := createReferralUser(t, "old_pending", "", common.UserStatusEnabled)
			require.NoError(t, CreateReferralReward(db, inviter.Id, pending.Id, now))
			var boundary int64
			require.NoError(t, db.Model(&ReferralReward{}).Select("MAX(id)").Scan(&boundary).Error)
			require.NoError(t, db.Create(&Option{Key: ReferralLadderStartIDOption, Value: fmt.Sprint(boundary)}).Error)
			view, err := GetUserReferralOverview(inviter.Id, 20, now)
			require.NoError(t, err)
			assert.Zero(t, view.Rewarded)
			assert.Equal(t, 1, view.NextRewardYuan)
			assert.Equal(t, ReferralLadder(0), view.Ladder)
			assert.Len(t, view.Rewards, 2, "historical reward records survive")
			assert.Equal(t, inviter.AffCode, view.AffCode)
			assert.Zero(t, view.Invites, "the promotion counter restarts with the ladder")
			replayed, err := IssueReferralReward(old.Id, now.Add(time.Hour))
			require.NoError(t, err)
			assert.Equal(t, before, *replayed)
			assert.EqualValues(t, 2, referralVoucherCount(t), "reset must not reissue historical vouchers")
			assert.Equal(t, referralFaceValue(t, 10), referralVoucher(t, issued.InviterVoucherId).FaceValue, "an already issued voucher keeps its value")
			require.NoError(t, db.Model(&User{}).Where("id = ?", pending.Id).Update("email", "pending@example.test").Error)
			late, err := IssueReferralReward(pending.Id, now.Add(time.Hour))
			require.NoError(t, err)
			assert.Zero(t, late.InviterOrdinal)
			assert.Equal(t, 1, late.InviterMultiplier)
			for i, multiplier := range []int{1, 3, 5, 1} {
				invitee := createReferralUser(t, fmt.Sprintf("new_invitee%d", i), fmt.Sprintf("new%d@example.test", i), common.UserStatusEnabled)
				require.NoError(t, CreateReferralReward(db, inviter.Id, invitee.Id, now.Add(time.Hour)))
				reward, err := IssueReferralReward(invitee.Id, now.Add(time.Hour))
				require.NoError(t, err)
				assert.Equal(t, multiplier, reward.InviterMultiplier)
				assert.Equal(t, i+1, reward.InviterOrdinal)
			}
			view, err = GetUserReferralOverview(inviter.Id, 20, now.Add(time.Hour))
			require.NoError(t, err)
			assert.Equal(t, 4, view.Rewarded)
			assert.Equal(t, 1, view.NextRewardYuan)
			assert.EqualValues(t, 12, referralVoucherCount(t))
			var after User
			require.NoError(t, db.First(&after, inviter.Id).Error)
			assert.Equal(t, inviter.Quota, after.Quota)
			assert.Equal(t, inviter.UsedQuota, after.UsedQuota)
			assert.Equal(t, inviter.AffCode, after.AffCode)
			assert.Equal(t, inviter.Password, after.Password)
			assert.Equal(t, 6, after.AffCount)
			// A subsequent restart/read of the same boundary is idempotent.
			view, err = GetUserReferralOverview(inviter.Id, 20, now.Add(2*time.Hour))
			require.NoError(t, err)
			assert.Equal(t, 4, view.Rewarded)
		})
	}
}
