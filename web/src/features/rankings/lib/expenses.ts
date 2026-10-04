/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { ExpenseLedgerData, ExpenseMonth } from '../types'

export const EXPENSE_LEDGER_QUERY_KEY = ['expense-ledger']

export function expenseMonthTotal(month: ExpenseMonth): number {
  return month.items.reduce((sum, item) => sum + item.amount, 0)
}

/**
 * The interface language as a tag Intl accepts: the project's own "zhCN" and
 * "zhTW" are not valid tags, and Intl throws on an invalid one.
 */
function intlLocale(language: string): string | undefined {
  if (language === 'zhCN') return 'zh-CN'
  if (language === 'zhTW') return 'zh-TW'
  try {
    return Intl.getCanonicalLocales(language)[0]
  } catch {
    return undefined
  }
}

/** "2026-10" as the reader's language writes a month, e.g. "October 2026". */
export function formatExpenseMonth(month: string, language: string): string {
  const [year, index] = month.split('-').map(Number)
  if (!year || !index) return month
  return new Intl.DateTimeFormat(intlLocale(language), {
    year: 'numeric',
    month: 'long',
  }).format(new Date(year, index - 1, 1))
}

export function formatExpenseAmount(amount: number, language: string): string {
  return new Intl.NumberFormat(intlLocale(language), {
    style: 'currency',
    currency: 'CNY',
    currencyDisplay: 'narrowSymbol',
  }).format(amount)
}

/** The month a new entry starts on: the current one, as "YYYY-MM". */
export function currentExpenseMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** The id of the <datalist> that offers expense item names. */
export const EXPENSE_NAME_LIST_ID = 'expense-item-names'

/**
 * Names to offer for an expense item: the ones already in use, most used
 * first, then the presets. Picking one keeps a recurring expense under one
 * name, which is what puts it into one series of the chart.
 */
export function expenseNameSuggestions(
  data: Pick<ExpenseLedgerData, 'entered' | 'prepaid'>,
  presets: string[]
): string[] {
  const uses = new Map<string, number>()
  const count = (name: string) => uses.set(name, (uses.get(name) ?? 0) + 1)
  for (const month of data.entered) month.items.forEach((i) => count(i.name))
  data.prepaid.forEach((expense) => count(expense.name))
  const used = [...uses].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  return [...new Set([...used, ...presets])]
}

/** The share of a prepaid expense one month shows, rounded to cents. */
export function prepaidMonthlyShare(amount: number, months: number): number {
  if (!Number.isFinite(amount) || !(months >= 1)) return 0
  return Math.round((amount / months) * 100) / 100
}

/**
 * The month "Add month" starts on: the current one, or the first month after
 * it that has nothing entered yet.
 */
export function firstFreeExpenseMonth(
  entered: ExpenseMonth[],
  now: Date = new Date()
): string {
  const taken = new Set(entered.map((m) => m.month))
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1)
  while (taken.has(currentExpenseMonth(cursor))) {
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return currentExpenseMonth(cursor)
}
