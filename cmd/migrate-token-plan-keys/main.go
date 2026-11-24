// Convert the stored Token Plan credentials into ordinary API keys.
//
// Run it once after deploying the release that reads plaintext token keys, then
// re-run it if the first attempt was interrupted: converted rows are skipped.
//
//	SQL_DSN=... CRYPTO_SECRET=... go run ./cmd/migrate-token-plan-keys
package main

import (
	"fmt"
	"log"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/joho/godotenv"
)

func main() {
	// Same inputs the server reads: SQL_DSN picks the database, CRYPTO_SECRET
	// decrypts the stored credentials.
	if err := godotenv.Load(".env"); err != nil {
		common.SysLog("no .env file found, using the process environment")
	}
	common.InitEnv()
	common.IsMasterNode = false
	if err := model.InitDB(); err != nil {
		log.Fatalf("failed to initialize database: %v", err)
	}
	model.InitOptionMap()
	var pending int64
	if err := model.DB.Model(&model.TokenPlanReservation{}).Where("settled = ?", false).Count(&pending).Error; err != nil {
		log.Fatal("cannot verify outstanding Token Plan reservations")
	}
	if pending != 0 {
		log.Fatalf("settle %d outstanding Token Plan reservations before key migration", pending)
	}
	coupons, err := model.MigrateLegacyCouponsToVouchers(time.Now(), true)
	if err != nil || coupons.Converted+coupons.Lapsed+coupons.Failed != 0 {
		log.Fatal("run and verify coupon migration before key migration")
	}
	quota, err := model.MigrateLegacyWeeklyQuota(time.Now(), true)
	if err != nil || quota.Converted+quota.Failed != 0 {
		log.Fatal("run and verify quota migration before key migration")
	}

	report, err := model.MigrateTokenPlanKeysToOrdinaryKeys()
	if err != nil {
		log.Fatalf("token plan key migration failed: %v", err)
	}
	common.SysLog(fmt.Sprintf("token plan key migration: migrated=%d skipped=%d failed=%d",
		report.Migrated, report.Skipped, report.Failed))
	if report.Failed > 0 {
		log.Fatalf("%d token plan keys could not be converted; see the log above", report.Failed)
	}
}
