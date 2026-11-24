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
import { toIntlLocale } from '@/i18n/languages'

import type { FinanceMonth, FinanceTotals } from './types'

export function totalTopUp(month: FinanceTotals): number {
  return month.online_topup + month.manual_topup
}

export function totalGift(month: FinanceTotals): number {
  return (
    month.gift_manual +
    month.gift_checkin +
    month.gift_redemption +
    month.gift_event
  )
}

/** Money received minus money spent. Gifts are not money and stay out. */
export function monthBalance(month: FinanceTotals): number {
  return totalTopUp(month) - month.expenses
}

const EMPTY_TOTALS: FinanceTotals = {
  online_topup: 0,
  manual_topup: 0,
  gift_manual: 0,
  gift_checkin: 0,
  gift_redemption: 0,
  gift_event: 0,
  expenses: 0,
}

/** The months of one calendar year added up. */
export function yearTotals(
  months: FinanceMonth[],
  year: string
): FinanceTotals {
  const totals = { ...EMPTY_TOTALS }
  for (const month of months) {
    if (!month.month.startsWith(`${year}-`)) continue
    for (const key of Object.keys(totals) as (keyof FinanceTotals)[]) {
      totals[key] += month[key]
    }
  }
  return totals
}

/** Money in the account's own currency, named rather than guessed. */
export function formatCurrencyAmount(
  amount: number,
  currency: string,
  language: string
): string {
  return new Intl.NumberFormat(toIntlLocale(language), {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(amount)
}

/**
 * Upstream accounts are billed in USD, so their amounts keep the dollar sign
 * instead of the site's display currency.
 */
export function formatUsdAmount(amount: number, language: string): string {
  return new Intl.NumberFormat(toIntlLocale(language), {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
  }).format(amount)
}

/**
 * A small unit price keeps up to four decimals: a per-call price of 0.0133
 * must read $0.0133 rather than being rounded to a cent.
 */
