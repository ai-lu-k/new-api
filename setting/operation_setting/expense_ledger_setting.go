package operation_setting

import (
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"
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
	expenseLedgerMaxPrepaid  = 200
	// A prepaid expense covers at least two months; a single month is an
	// ordinary line of that month.
	expensePrepaidMinMonths = 2
	expensePrepaidMaxMonths = 120
)

var expenseMonthPattern = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

// ExpenseItem is one line of what the site paid in a month, as the
// administrator entered it.
type ExpenseItem struct {
	Name   string  `json:"name"`
	Amount float64 `json:"amount"`
	Note   string  `json:"note,omitempty"`
	// Spread is set on a line that is one month's share of a prepaid expense.
	// It is computed when the ledger is read and never stored.
	Spread *ExpenseSpread `json:"spread,omitempty"`
}

// ExpenseSpread says which share of a prepaid expense a line is.
type ExpenseSpread struct {
	Total  float64 `json:"total"`
	Months int     `json:"months"`
	Index  int     `json:"index"` // 1-based
}

// PrepaidExpense is paid once and covers several months, such as a server
// rented by the year. Each covered month shows an equal share of it.
type PrepaidExpense struct {
	Name   string  `json:"name"`
	Amount float64 `json:"amount"` // the whole payment
	Start  string  `json:"start"`  // first covered month, "2026-10"
	Months int     `json:"months"` // number of covered months
	Note   string  `json:"note,omitempty"`
}

// ExpenseMonth holds the lines of one calendar month, "2026-10".
type ExpenseMonth struct {
	Month string        `json:"month"`
	Items []ExpenseItem `json:"items"`
}

// ExpenseLedgerSetting is the published list of the site's expenses.
// DB keys: expense_ledger.months, expense_ledger.prepaid
type ExpenseLedgerSetting struct {
	Months  []ExpenseMonth   `json:"months"`
	Prepaid []PrepaidExpense `json:"prepaid"`
}

var expenseLedgerSetting = ExpenseLedgerSetting{
	Months:  []ExpenseMonth{},
	Prepaid: []PrepaidExpense{},
}

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

// GetPrepaidExpenses returns a copy of the prepaid expenses as entered.
func GetPrepaidExpenses() []PrepaidExpense {
	stored := expenseLedgerSetting.Prepaid
	prepaid := make([]PrepaidExpense, len(stored))
	copy(prepaid, stored)
	return prepaid
}

// GetPublishedExpenseMonths returns what the public page shows: the entered
// months plus each prepaid expense's share in the months it covers, newest
// first. Months after now are left out, so a share appears when its month
// begins.
func GetPublishedExpenseMonths(now time.Time) []ExpenseMonth {
	return publishExpenseMonths(GetExpenseLedgerMonths(), GetPrepaidExpenses(), now.Format("2006-01"))
}

func publishExpenseMonths(entered []ExpenseMonth, prepaid []PrepaidExpense, currentMonth string) []ExpenseMonth {
	byMonth := make(map[string]*ExpenseMonth, len(entered))
	for _, month := range entered {
		month := month
		byMonth[month.Month] = &month
	}
	for _, expense := range prepaid {
		start, err := time.Parse("2006-01", expense.Start)
		if err != nil || expense.Months < 1 {
			continue
		}
		share := math.Round(expense.Amount/float64(expense.Months)*100) / 100
		for i := 0; i < expense.Months; i++ {
			key := start.AddDate(0, i, 0).Format("2006-01")
			if key > currentMonth {
				break
			}
			amount := share
			if i == expense.Months-1 {
				// The last share takes the rounding remainder, so that the
				// shares add up to the payment.
				amount = math.Round((expense.Amount-share*float64(expense.Months-1))*100) / 100
			}
			month, ok := byMonth[key]
			if !ok {
				month = &ExpenseMonth{Month: key, Items: []ExpenseItem{}}
				byMonth[key] = month
			}
			month.Items = append(month.Items, ExpenseItem{
				Name:   expense.Name,
				Amount: amount,
				Note:   expense.Note,
				Spread: &ExpenseSpread{Total: expense.Amount, Months: expense.Months, Index: i + 1},
			})
		}
	}
	months := make([]ExpenseMonth, 0, len(byMonth))
	for _, month := range byMonth {
		months = append(months, *month)
	}
	sort.Slice(months, func(i, j int) bool { return months[i].Month > months[j].Month })
	return months
}

func checkExpenseLine(where, name string, amount float64, note string) error {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" || trimmed != name || utf8.RuneCountInString(trimmed) > expenseLedgerMaxNameLen {
		return fmt.Errorf("%s: a line needs a name of at most %d characters", where, expenseLedgerMaxNameLen)
	}
	if math.IsNaN(amount) || amount < 0 || amount > expenseLedgerMaxItemCost {
		return fmt.Errorf("%s: the amount of %q is out of range", where, trimmed)
	}
	if utf8.RuneCountInString(note) > expenseLedgerMaxNoteLen {
		return fmt.Errorf("%s: the note of %q is longer than %d characters", where, trimmed, expenseLedgerMaxNoteLen)
	}
	return nil
}

// CheckPrepaidExpenses validates the value saved as expense_ledger.prepaid.
func CheckPrepaidExpenses(jsonStr string) error {
	var prepaid []PrepaidExpense
	if err := common.Unmarshal([]byte(jsonStr), &prepaid); err != nil {
		return fmt.Errorf("prepaid expenses must be a JSON list: %w", err)
	}
	if len(prepaid) > expenseLedgerMaxPrepaid {
		return fmt.Errorf("at most %d prepaid expenses can be listed", expenseLedgerMaxPrepaid)
	}
	for _, expense := range prepaid {
		if err := checkExpenseLine("prepaid expense", expense.Name, expense.Amount, expense.Note); err != nil {
			return err
		}
		if !expenseMonthPattern.MatchString(expense.Start) {
			return fmt.Errorf("prepaid expense %q: the first month %q must look like 2026-10", expense.Name, expense.Start)
		}
		if expense.Months < expensePrepaidMinMonths || expense.Months > expensePrepaidMaxMonths {
			return fmt.Errorf("prepaid expense %q must cover %d to %d months", expense.Name, expensePrepaidMinMonths, expensePrepaidMaxMonths)
		}
	}
	return nil
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
			if item.Spread != nil {
				return fmt.Errorf("expense ledger month %s: %q is a share of a prepaid expense and is not saved with the month", month.Month, item.Name)
			}
			if err := checkExpenseLine("expense ledger month "+month.Month, item.Name, item.Amount, item.Note); err != nil {
				return err
			}
		}
	}
	return nil
}
