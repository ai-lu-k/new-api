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
