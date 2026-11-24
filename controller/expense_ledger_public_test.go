package controller

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/QuantumNous/new-api/setting/operation_setting"
)

func TestPublicExpenseLedgerHidesNotes(t *testing.T) {
	months := []operation_setting.ExpenseMonth{{
		Month: "2026-10",
		Items: []operation_setting.ExpenseItem{
			{Name: "Upstream", Amount: 20, Note: "upstream invoice", Date: "2026-10-17"},
			{Name: "Domain", Amount: 5.00, Spread: &operation_setting.ExpenseSpread{Total: 60.00, Months: 12, Index: 1}},
		},
	}}
	prepaid := []operation_setting.PrepaidExpense{
		{Name: "Domain", Amount: 60.00, Start: "2026-10", Months: 12, Note: "invoice reference"},
	}

	public := publicExpenseMonths(months)
	require.Len(t, public, 1)
	require.Len(t, public[0].Items, 2)
	assert.Equal(t, "Upstream", public[0].Items[0].Name)
	assert.Equal(t, "2026-10-17", public[0].Items[0].Date)
	assert.Empty(t, public[0].Items[0].Note)
	assert.Empty(t, public[0].Items[1].Note)
	assert.Equal(t, "upstream invoice", months[0].Items[0].Note, "the stored ledger keeps its notes")

	publicPrepaid := publicPrepaidExpenses(prepaid)
	require.Len(t, publicPrepaid, 1)
	assert.Empty(t, publicPrepaid[0].Note)
	assert.Equal(t, "invoice reference", prepaid[0].Note)
}

func TestPublicExpenseLedgerAddsAutomaticTopUps(t *testing.T) {
	months := []operation_setting.ExpenseMonth{{
		Month: "2026-09",
		Items: []operation_setting.ExpenseItem{{Name: "Server", Amount: 300}},
	}}

	merged := withUpstreamTopUps(months, map[string]float64{
		"2026-10": 151,
		"2026-09": 20.5,
	})

	require.Len(t, merged, 2)
	assert.Equal(t, "2026-10", merged[0].Month)
	require.Len(t, merged[0].Items, 1)
	assert.Equal(t, "Upstream top-ups", merged[0].Items[0].Name)
	assert.Equal(t, 151.0, merged[0].Items[0].Amount)
	assert.True(t, merged[0].Items[0].Automatic)
	require.Len(t, merged[1].Items, 2)
	assert.Equal(t, "Server", merged[1].Items[0].Name)
	assert.Equal(t, 20.5, merged[1].Items[1].Amount)
	assert.Equal(t, 1, len(months[0].Items), "the published copy is not modified")
}
