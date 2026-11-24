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
import { getCurrencyDisplay } from '@/lib/currency'

/** Balance below this many display units is drawn in the accent color. */
export const LOW_BALANCE = 5

/** A balance nobody could read is a dash, not a zero. */
export const MISSING_BALANCE = '—'

/** The balance as the money the site displays it in, not as raw quota units. */
export function displayBalance(quota: number): number {
  const { config, meta } = getCurrencyDisplay()
  const usd = quota / config.quotaPerUnit
  if (meta.kind === 'tokens') return usd * config.usdExchangeRate
  return usd * meta.exchangeRate
}

/**
 * Whether the account is close enough to empty that the number itself should
 * say so, instead of a banner announcing it elsewhere on the page.
 */
export function isLowBalance(quota: number | null | undefined): boolean {
  return quota != null && displayBalance(quota) < LOW_BALANCE
}
