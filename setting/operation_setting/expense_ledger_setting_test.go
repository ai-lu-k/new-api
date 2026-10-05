package operation_setting

import (
	"testing"

	"github.com/QuantumNous/new-api/setting/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCheckExpenseLedgerMonths(t *testing.T) {
	valid := `[{"month":"2026-10","items":[{"name":"Upstream","amount":1234.5,"note":"invoice 12"},{"name":"Server","amount":0}]},{"month":"2026-09","items":[]}]`
	require.NoError(t, CheckExpenseLedgerMonths(valid))
	require.NoError(t, CheckExpenseLedgerMonths(`[]`))

	for name, value := range map[string]string{
		"not a list":      `{"month":"2026-10"}`,
		"bad month":       `[{"month":"2026-13","items":[]}]`,
		"month as a date": `[{"month":"2026-10-01","items":[]}]`,
		"repeated month":  `[{"month":"2026-10","items":[]},{"month":"2026-10","items":[]}]`,
		"empty name":      `[{"month":"2026-10","items":[{"name":"","amount":1}]}]`,
		"padded name":     `[{"month":"2026-10","items":[{"name":" Server","amount":1}]}]`,
		"negative amount": `[{"month":"2026-10","items":[{"name":"Server","amount":-1}]}]`,
		"amount as text":  `[{"month":"2026-10","items":[{"name":"Server","amount":"1"}]}]`,
		"computed share":  `[{"month":"2026-10","items":[{"name":"Server","amount":1,"spread":{"total":12,"months":12,"index":1}}]}]`,
	} {
		assert.Error(t, CheckExpenseLedgerMonths(value), name)
	}
}

func TestExpenseLedgerMonthsLoadNewestFirst(t *testing.T) {
	original := expenseLedgerSetting.Months
	t.Cleanup(func() { expenseLedgerSetting.Months = original })

	require.NoError(t, config.UpdateConfigFromMap(&expenseLedgerSetting, map[string]string{
		"months": `[{"month":"2026-09","items":[{"name":"Server","amount":300}]},{"month":"2026-10","items":[{"name":"Upstream","amount":1200.5,"note":"n"}]}]`,
	}))
	months := GetExpenseLedgerMonths()
	require.Len(t, months, 2)
	assert.Equal(t, "2026-10", months[0].Month)
	assert.Equal(t, ExpenseItem{Name: "Upstream", Amount: 1200.5, Note: "n"}, months[0].Items[0])

	months[0].Items[0].Name = "changed"
	assert.Equal(t, "Upstream", GetExpenseLedgerMonths()[0].Items[0].Name)
}

func TestCheckPrepaidExpenses(t *testing.T) {
	require.NoError(t, CheckPrepaidExpenses(`[{"name":"Server","amount":1200,"start":"2026-10","months":12,"note":"yearly"}]`))
	require.NoError(t, CheckPrepaidExpenses(`[]`))

	for name, value := range map[string]string{
		"not a list":      `{"name":"Server"}`,
		"no name":         `[{"name":"","amount":1200,"start":"2026-10","months":12}]`,
		"bad start":       `[{"name":"Server","amount":1200,"start":"2026","months":12}]`,
		"one month":       `[{"name":"Server","amount":1200,"start":"2026-10","months":1}]`,
		"too many months": `[{"name":"Server","amount":1200,"start":"2026-10","months":121}]`,
		"negative amount": `[{"name":"Server","amount":-1,"start":"2026-10","months":12}]`,
	} {
		assert.Error(t, CheckPrepaidExpenses(value), name)
	}
}

func TestPublishExpenseMonthsSpreadsPrepaidExpenses(t *testing.T) {
	entered := []ExpenseMonth{
		{Month: "2026-10", Items: []ExpenseItem{{Name: "Upstream", Amount: 500}}},
	}
	prepaid := []PrepaidExpense{
		{Name: "Domain", Amount: 100, Start: "2026-09", Months: 3, Note: "three months"},
		{Name: "Server", Amount: 1200, Start: "2026-11", Months: 12},
	}

	months := publishExpenseMonths(entered, prepaid, "2026-11")
	require.Len(t, months, 3)
	assert.Equal(t, []string{"2026-11", "2026-10", "2026-09"}, []string{months[0].Month, months[1].Month, months[2].Month})

	// 100 over three months: 33.33, 33.33 and the remainder 33.34.
	september, october, november := months[2], months[1], months[0]
	assert.Equal(t, []ExpenseItem{{Name: "Domain", Amount: 33.33, Note: "three months", Spread: &ExpenseSpread{Total: 100, Months: 3, Index: 1}}}, september.Items)
	require.Len(t, october.Items, 2)
	assert.Equal(t, ExpenseItem{Name: "Upstream", Amount: 500}, october.Items[0])
	assert.Equal(t, 33.33, october.Items[1].Amount)
	require.Len(t, november.Items, 2)
	assert.Equal(t, ExpenseItem{Name: "Domain", Amount: 33.34, Note: "three months", Spread: &ExpenseSpread{Total: 100, Months: 3, Index: 3}}, november.Items[0])
	assert.Equal(t, ExpenseItem{Name: "Server", Amount: 100, Spread: &ExpenseSpread{Total: 1200, Months: 12, Index: 1}}, november.Items[1])

	// A month that has not begun is not published; the entered ones are untouched.
	assert.Len(t, publishExpenseMonths(entered, prepaid, "2026-10"), 2)
	assert.Len(t, entered[0].Items, 1)
}

func TestCheckModelPromotionDeadlines(t *testing.T) {
	require.NoError(t, CheckModelPromotionDeadlines(`{"deepseek-v4.1-flash-x0.001":1791388740}`))
	require.NoError(t, CheckModelPromotionDeadlines(`{}`))
	assert.Error(t, CheckModelPromotionDeadlines(`[1791388740]`))
	assert.Error(t, CheckModelPromotionDeadlines(`{"":1791388740}`))
	assert.Error(t, CheckModelPromotionDeadlines(`{"model":0}`))
	assert.Error(t, CheckModelPromotionDeadlines(`{"model":"soon"}`))

	original := modelPromotionSetting.Deadlines
	t.Cleanup(func() { modelPromotionSetting.Deadlines = original })
	require.NoError(t, config.UpdateConfigFromMap(&modelPromotionSetting, map[string]string{
		"deadlines": `{"deepseek-v4.1-flash-x0.001":1791388740}`,
	}))
	assert.EqualValues(t, 1791388740, GetModelPromotionDeadline("deepseek-v4.1-flash-x0.001"))
	assert.Zero(t, GetModelPromotionDeadline("deepseek-v4.1-flash-x0.5"))
}
