package operation_setting

import (
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

const (
	expenseLedgerMaxMonths   = 240
	expenseLedgerMaxItems    = 50
	expenseLedgerMaxNameLen  = 60
	expenseLedgerMaxNoteLen  = 300
	expenseLedgerMaxItemCost = 1e12
)

var expenseMonthPattern = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

// ExpenseItem is one line of what the site paid in a month, as the
// administrator entered it.
type ExpenseItem struct {
	Name   string  `json:"name"`
	Amount float64 `json:"amount"`
	Note   string  `json:"note,omitempty"`
}

// ExpenseMonth holds the lines of one calendar month, "2026-10".
type ExpenseMonth struct {
	Month string        `json:"month"`
	Items []ExpenseItem `json:"items"`
}

// ExpenseLedgerSetting is the published list of the site's expenses.
// DB key: expense_ledger.months
type ExpenseLedgerSetting struct {
	Months []ExpenseMonth `json:"months"`
}

var expenseLedgerSetting = ExpenseLedgerSetting{Months: []ExpenseMonth{}}

func init() {
	config.GlobalConfig.Register("expense_ledger", &expenseLedgerSetting)
}

// GetExpenseLedgerMonths returns a copy of the published months, newest first.
func GetExpenseLedgerMonths() []ExpenseMonth {
	stored := expenseLedgerSetting.Months
	months := make([]ExpenseMonth, 0, len(stored))
	for _, month := range stored {
		items := make([]ExpenseItem, len(month.Items))
		copy(items, month.Items)
		months = append(months, ExpenseMonth{Month: month.Month, Items: items})
	}
	sort.SliceStable(months, func(i, j int) bool { return months[i].Month > months[j].Month })
	return months
}

// CheckExpenseLedgerMonths validates the value saved as expense_ledger.months.
func CheckExpenseLedgerMonths(jsonStr string) error {
	var months []ExpenseMonth
	if err := common.Unmarshal([]byte(jsonStr), &months); err != nil {
		return fmt.Errorf("expense ledger must be a JSON list of months: %w", err)
	}
	if len(months) > expenseLedgerMaxMonths {
		return fmt.Errorf("expense ledger holds at most %d months", expenseLedgerMaxMonths)
	}
	seen := make(map[string]struct{}, len(months))
	for _, month := range months {
		if !expenseMonthPattern.MatchString(month.Month) {
			return fmt.Errorf("expense ledger month %q must look like 2026-10", month.Month)
		}
		if _, ok := seen[month.Month]; ok {
			return fmt.Errorf("expense ledger month %s is listed twice", month.Month)
		}
		seen[month.Month] = struct{}{}
		if len(month.Items) > expenseLedgerMaxItems {
			return fmt.Errorf("expense ledger month %s holds at most %d lines", month.Month, expenseLedgerMaxItems)
		}
		for _, item := range month.Items {
			name := strings.TrimSpace(item.Name)
			if name == "" || name != item.Name || utf8.RuneCountInString(name) > expenseLedgerMaxNameLen {
				return fmt.Errorf("expense ledger month %s: a line needs a name of at most %d characters", month.Month, expenseLedgerMaxNameLen)
			}
			if math.IsNaN(item.Amount) || item.Amount < 0 || item.Amount > expenseLedgerMaxItemCost {
				return fmt.Errorf("expense ledger month %s: the amount of %q is out of range", month.Month, name)
			}
			if utf8.RuneCountInString(item.Note) > expenseLedgerMaxNoteLen {
				return fmt.Errorf("expense ledger month %s: the note of %q is longer than %d characters", month.Month, name, expenseLedgerMaxNoteLen)
			}
		}
	}
	return nil
}
