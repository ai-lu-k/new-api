// Convert what the Token Plan era left behind into vouchers.
//
// Two sources become vouchers: reset coupons nobody spent, and this week's
// unused free allowance. Run it once, on the release that stops issuing weekly
// allowance; re-running it is free because every batch it writes names its
// source in request_id.
//
//	SQL_DSN=... go run ./cmd/migrate-legacy-vouchers -dry-run   # totals only
//	SQL_DSN=... go run ./cmd/migrate-legacy-vouchers            # write
//
// The dry run and the real run share one code path, so the preview cannot
// disagree with what the write does.
package main

import (
	"flag"
	"fmt"
	"log"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/joho/godotenv"
)

func main() {
	dryRun := flag.Bool("dry-run", false, "report what would be converted without writing")
	flag.Parse()

	if err := godotenv.Load(".env"); err != nil {
		common.SysLog("no .env file found, using the process environment")
	}
	common.InitEnv()
	// Deploy/start the target release first. Even dry-run must not run schema
	// migrations or unrelated startup backfills against an operational DB.
	common.IsMasterNode = false
	if err := model.InitDB(); err != nil {
		log.Fatalf("failed to initialize database: %v", err)
	}
	// Conversion must use the site's stored quota unit, exchange rate and level
	// thresholds, exactly as the running gateway does.
	model.InitOptionMap()
	var pending int64
	if err := model.DB.Model(&model.TokenPlanReservation{}).Where("settled = ?", false).Count(&pending).Error; err != nil {
		log.Fatal("cannot verify outstanding Token Plan reservations")
	}
	if pending != 0 {
		log.Fatalf("settle %d outstanding Token Plan reservations before conversion", pending)
	}

	now := time.Now()
	coupons, err := model.MigrateLegacyCouponsToVouchers(now, *dryRun)
	if err != nil {
		log.Fatalf("coupon conversion failed: %v", err)
	}
	if coupons.Failed > 0 {
		log.Fatalf("%d coupons failed; do not continue with quota or key migration", coupons.Failed)
	}
	quota, err := model.MigrateLegacyWeeklyQuota(now, *dryRun)
	if err != nil {
		log.Fatalf("weekly quota conversion failed: %v", err)
	}

	verb := "converted"
	if *dryRun {
		verb = "would convert"
	}
	common.SysLog(fmt.Sprintf("coupons: %s=%d skipped=%d lapsed=%d failed=%d worth=%s",
		verb, coupons.Converted, coupons.Skipped, coupons.Lapsed, coupons.Failed,
		logger.FormatQuota(int(coupons.TotalQuota))))
	common.SysLog(fmt.Sprintf("weekly quota: %s=%d skipped=%d failed=%d worth=%s",
		verb, quota.Converted, quota.Skipped, quota.Failed,
		logger.FormatQuota(int(quota.TotalQuota))))
	common.SysLog(fmt.Sprintf("total: %s", logger.FormatQuota(int(coupons.TotalQuota+quota.TotalQuota))))

	if coupons.Failed+quota.Failed > 0 {
		log.Fatalf("%d rows could not be converted; see the log above", coupons.Failed+quota.Failed)
	}
}
