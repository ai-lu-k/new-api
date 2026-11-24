package service

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
)

func TestNextUpstreamRefreshAtIsNineInShanghai(t *testing.T) {
	shanghai := time.FixedZone("Asia/Shanghai", 8*3600)

	before := time.Date(2026, 11, 6, 8, 30, 0, 0, shanghai)
	assert.Equal(t, "2026-11-06T09:00:00+08:00", nextUpstreamRefreshAt(before).Format(time.RFC3339))

	// Exactly nine already counts as today's run being due.
	due := time.Date(2026, 11, 6, 9, 0, 0, 0, shanghai)
	assert.Equal(t, "2026-11-07T09:00:00+08:00", nextUpstreamRefreshAt(due).Format(time.RFC3339))

	// A UTC clock still resolves to the site's own morning: 00:30 UTC is
	// 08:30 in Shanghai.
	utc := time.Date(2026, 11, 6, 0, 30, 0, 0, time.UTC)
	assert.Equal(t, "2026-11-06T09:00:00+08:00", nextUpstreamRefreshAt(utc).Format(time.RFC3339))
}

func TestUpstreamReserveGapUsesThreeDaysOfTheSevenDayAverage(t *testing.T) {
	balance := 10.0
	account := model.UpstreamAccount{
		UsageStatus:   model.UpstreamUsageStatusOK,
		Usage7d:       70,
		RemoteBalance: &balance,
	}
	// 70 / 7 * 3 = 30, and the wallet holds 10.
	assert.Equal(t, 20.0, upstreamReserveGap(account))

	covered := 50.0
	account.RemoteBalance = &covered
	assert.Equal(t, 0.0, upstreamReserveGap(account))

	// A failed report or a wallet that was never read is a reading problem,
	// not a shortfall.
	account.UsageStatus = model.UpstreamUsageStatusError
	account.RemoteBalance = nil
	assert.Equal(t, 0.0, upstreamReserveGap(account))
}
