package model

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func quotaDataAt(t *testing.T, value string) int64 {
	t.Helper()
	ts, err := time.Parse(time.RFC3339, value)
	require.NoError(t, err)
	return ts.Unix()
}

func TestSummarizeDailyQuotaFoldsRowsIntoShanghaiDays(t *testing.T) {
	rows := []*QuotaData{
		// 2026-10-18 00:00 Asia/Shanghai
		{CreatedAt: quotaDataAt(t, "2026-10-17T16:00:00Z"), TokenUsed: 10, Quota: 100},
		// 2026-10-17 23:59 Asia/Shanghai
		{CreatedAt: quotaDataAt(t, "2026-10-17T15:59:00Z"), TokenUsed: 20, Quota: 200},
		// 2026-10-17 09:00 Asia/Shanghai
		{CreatedAt: quotaDataAt(t, "2026-10-17T01:00:00Z"), TokenUsed: 30, Quota: 300},
	}

	days := summarizeDailyQuota(rows)

	require.Len(t, days, 2)
	assert.Equal(t, "2026-10-17", days[0].Date)
	assert.Equal(t, 50, days[0].TokenUsed)
	assert.Equal(t, 500, days[0].Quota)
	assert.Equal(t, "2026-10-18", days[1].Date)
	assert.Equal(t, 10, days[1].TokenUsed)
	assert.Equal(t, 100, days[1].Quota)
}

func TestSummarizeDailyQuotaReturnsEmptySliceWithoutRows(t *testing.T) {
	days := summarizeDailyQuota(nil)

	assert.NotNil(t, days)
	assert.Empty(t, days)
}

func TestGetUserDailyQuotaDataScopesUserMergesModelsAndFiltersRange(t *testing.T) {
	truncateTables(t)

	hour := quotaDataAt(t, "2026-10-17T01:00:00Z")
	nextDay := quotaDataAt(t, "2026-10-17T16:00:00Z")
	rows := []*QuotaData{
		{UserID: 1, Username: "one", ModelName: "model-a", CreatedAt: hour, TokenUsed: 10, Quota: 100, Count: 1},
		{UserID: 1, Username: "one", ModelName: "model-b", CreatedAt: hour, TokenUsed: 5, Quota: 50, Count: 2},
		{UserID: 2, Username: "two", ModelName: "model-a", CreatedAt: hour, TokenUsed: 99, Quota: 999, Count: 3},
		{UserID: 1, Username: "one", ModelName: "model-a", CreatedAt: nextDay, TokenUsed: 7, Quota: 70, Count: 4},
		{UserID: 1, Username: "one", ModelName: "model-a", CreatedAt: quotaDataAt(t, "2025-01-01T00:00:00Z"), TokenUsed: 1, Quota: 1, Count: 5},
	}
	require.NoError(t, DB.Create(&rows).Error)

	days, err := GetUserDailyQuotaData(1, hour-3600, hour+3600)

	require.NoError(t, err)
	require.Len(t, days, 1)
	assert.Equal(t, "2026-10-17", days[0].Date)
	assert.Equal(t, 15, days[0].TokenUsed)
	assert.Equal(t, 150, days[0].Quota)
}
