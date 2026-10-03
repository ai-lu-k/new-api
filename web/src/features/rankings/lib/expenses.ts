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
import type { ExpenseMonth } from '../types'

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
