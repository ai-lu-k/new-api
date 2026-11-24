package service

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func writeWorkBuddyReport(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "report.json")
	require.NoError(t, os.WriteFile(path, []byte(body), 0o600))
	t.Setenv("WORKBUDDY_FINANCE_REPORT", path)
	t.Setenv("WORKBUDDY_ACCOUNT_COST_CNY", "4.25")
	return path
}

func TestReadWorkBuddyFinanceKeepsCreditsAsCredits(t *testing.T) {
	now := time.Unix(1767787200, 0)
	writeWorkBuddyReport(t, `{"version":1,"generated_at":1767787200,"first_observed_at":1767786400,
		"observed_days":7,"window_start":1767134800,"usage_7d":70.00,"usage_complete":true,
		"target_3d":30.00,"balance":100.00,"expiring_credits":12.50,
		"accounts_total":3,"accounts_enabled":3,"stale_count":0,"billing_since":1767785000,
		"purchases":[{"id":"`+hexId+`","paid_cny":4.25,"paid_at":1767785000}]}`)

	report, err := ReadWorkBuddyFinance(now)
	require.NoError(t, err)
	assert.Equal(t, 100.00, report.Balance)
	assert.Equal(t, 70.00, report.Usage7d)
	assert.Equal(t, 30.00, report.Target3d)
	assert.Equal(t, 12.50, report.ExpiringCredits)
	assert.Equal(t, 3, report.AccountsEnabled)
	assert.Len(t, report.Purchases, 1)
	assert.Equal(t, 4.25, report.Purchases[0].PaidCNY)
}

func TestReadWorkBuddyFinanceRejectsStaleOrImpossibleReports(t *testing.T) {
	now := time.Unix(1767787200, 0)
	cases := map[string]string{
		"stale": `{"version":1,"generated_at":1767736400,"first_observed_at":1767726400,
			"observed_days":7,"window_start":1767134800,"usage_7d":1,"usage_complete":true,
			"target_3d":1,"balance":10,"expiring_credits":0,"accounts_total":1,
			"accounts_enabled":1,"stale_count":0,"billing_since":1767785000,"purchases":[]}`,
		"expiring above balance": `{"version":1,"generated_at":1767787200,"first_observed_at":1767786400,
			"observed_days":7,"window_start":1767134800,"usage_7d":1,"usage_complete":true,
			"target_3d":1,"balance":10,"expiring_credits":11,"accounts_total":1,
			"accounts_enabled":1,"stale_count":0,"billing_since":1767785000,"purchases":[]}`,
		"more enabled than total": `{"version":1,"generated_at":1767787200,"first_observed_at":1767786400,
			"observed_days":7,"window_start":1767134800,"usage_7d":1,"usage_complete":true,
			"target_3d":1,"balance":10,"expiring_credits":0,"accounts_total":1,
			"accounts_enabled":2,"stale_count":0,"billing_since":1767785000,"purchases":[]}`,
		"purchase priced differently": `{"version":1,"generated_at":1767787200,"first_observed_at":1767786400,
			"observed_days":7,"window_start":1767134800,"usage_7d":1,"usage_complete":true,
			"target_3d":1,"balance":10,"expiring_credits":0,"accounts_total":1,
			"accounts_enabled":1,"stale_count":0,"billing_since":1767785000,
			"purchases":[{"id":"` + hexId + `","paid_cny":7,"paid_at":1767785000}]}`,
		"purchase before billing": `{"version":1,"generated_at":1767787200,"first_observed_at":1767786400,
			"observed_days":7,"window_start":1767134800,"usage_7d":1,"usage_complete":true,
			"target_3d":1,"balance":10,"expiring_credits":0,"accounts_total":1,
			"accounts_enabled":1,"stale_count":0,"billing_since":1767785000,
			"purchases":[{"id":"` + hexId + `","paid_cny":4.25,"paid_at":1767784000}]}`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			writeWorkBuddyReport(t, body)
			_, err := ReadWorkBuddyFinance(now)
			assert.Error(t, err)
		})
	}
}

func TestReadWorkBuddyFinanceNeedsAReport(t *testing.T) {
	t.Setenv("WORKBUDDY_FINANCE_REPORT", filepath.Join(t.TempDir(), "missing.json"))
	_, err := ReadWorkBuddyFinance(time.Now())
	assert.EqualError(t, err, "workbuddy finance report is unavailable")
}

// hexId is a purchase identity: the pool hashes the account id, so the report
// always carries a 64-character lowercase hex string.
const hexId = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
