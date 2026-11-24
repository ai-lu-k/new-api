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
import { DEFAULT_TOKEN_UNIT } from '@/features/pricing/constants'
import {
  getDynamicDisplayGroupRatio,
  getDynamicPricingSummary,
} from '@/features/pricing/lib/dynamic-price'
import type { PricingModel } from '@/features/pricing/types'

export type TokenPrices = { input: string; output: string }

/**
 * What a model costs per million tokens, printed the way the price list prints
 * it: the first two token entries a card carries, which are input then output.
 * Null when the model is absent or prices itself some other way, so the caller
 * can leave the slot out instead of printing a wrong number.
 */
export function tokenPrices(
  model: PricingModel | undefined,
  rates: { priceRate: number; usdExchangeRate: number }
): TokenPrices | null {
  if (!model) return null
  const summary = getDynamicPricingSummary(model, {
    priceRate: rates.priceRate,
    usdExchangeRate: rates.usdExchangeRate,
    tokenUnit: DEFAULT_TOKEN_UNIT,
    groupRatioMultiplier: getDynamicDisplayGroupRatio(model),
  })
  const entries = (summary?.primaryEntries ?? []).filter(
    (entry) => entry.unit === 'token'
  )
  if (entries.length < 2) return null
  const printed = (entry: (typeof entries)[number]) =>
    entry.formattedRange ?? entry.formatted
  return { input: printed(entries[0]), output: printed(entries[1]) }
}
