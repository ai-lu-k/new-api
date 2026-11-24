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
import {
  formatBillingCurrencyFromUSD,
  getCurrencyDisplay,
} from '@/lib/currency'

import { QUOTA_TYPE_VALUES, TOKEN_UNIT_DIVISORS } from '../constants'
import type { PricingModel, TokenUnit, PriceType } from '../types'
import { getConfiguredGroupRatio, getDisplayGroupRatio } from './model-helpers'

// ----------------------------------------------------------------------------
// Price Calculation Utilities
// ----------------------------------------------------------------------------

/** Hard cap so even a vanishingly small price keeps a non-zero digit. */
const MAX_PRICE_FRACTION_DIGITS = 6

/** Money is written with at least two decimals so a column of prices lines up. */
const MONEY_FRACTION_DIGITS = 2

/** Below one cent, two decimals would read as zero, so the price keeps its own. */
const SMALLEST_MONEY_AMOUNT = 10 ** -MONEY_FRACTION_DIGITS

/** Rounding error a shown price may keep; smaller amounts tolerate more. */
const PRICE_ERROR_TOLERANCE: { min: number; tolerance: number }[] = [
  { min: 1, tolerance: 0.05 },
  { min: 0.01, tolerance: 0.1 },
  { min: 0, tolerance: 0.25 },
]

/**
 * Fraction digits for a price in the display currency: the fewest decimals
 * whose rounding error stays within the size-dependent tolerance, so prices
 * look neat without distorting the amount. Never collapses to zero.
 */
export function priceFractionDigits(displayAmount: number): number {
  const magnitude = Math.abs(displayAmount)
  if (!Number.isFinite(magnitude) || magnitude === 0) return 0
  let tolerance = 0
  for (const tier of PRICE_ERROR_TOLERANCE) {
    if (magnitude >= tier.min) {
      tolerance = tier.tolerance
      break
    }
  }
  for (let digits = 0; digits <= MAX_PRICE_FRACTION_DIGITS; digits++) {
    const scale = 10 ** digits
    const rounded = Math.round(magnitude * scale) / scale
    if (rounded > 0 && Math.abs(rounded - magnitude) / magnitude <= tolerance) {
      return digits
    }
  }
  return MAX_PRICE_FRACTION_DIGITS
}

/**
 * Display digits for a price: money keeps the two decimals every other amount
 * shows, while a sub-cent unit price (per token, or a 1K-token unit) keeps the
 * fewest digits whose error stays within tolerance instead of collapsing.
 */
export function priceDisplayFractionDigits(displayAmount: number): number {
  const digits = priceFractionDigits(displayAmount)
  if (displayAmount === 0) return MONEY_FRACTION_DIGITS
  if (Math.abs(displayAmount) < SMALLEST_MONEY_AMOUNT) return digits
  return Math.max(digits, MONEY_FRACTION_DIGITS)
}

/**
 * Format a model price with the shared display precision. The configured price
 * is not modified; only the displayed digits are rounded to a readable scale.
 */
export function formatPricingAmount(
  amountUSD: number,
  options?: { showSymbol?: boolean; tokenUnit?: TokenUnit }
): string {
  const tokenUnit = options?.tokenUnit ?? 'M'
  const divisor = TOKEN_UNIT_DIVISORS[tokenUnit]
  const { meta } = getCurrencyDisplay()
  const exchangeRate = meta.kind === 'tokens' ? 1 : meta.exchangeRate
  const digits = priceDisplayFractionDigits(
    (amountUSD / divisor) * exchangeRate
  )
  return formatBillingCurrencyFromUSD(amountUSD / divisor, {
    showSymbol: options?.showSymbol ?? true,
    digitsLarge: digits,
    digitsSmall: digits,
    abbreviate: false,
    minimumNonZero: 10 ** -digits,
  })
}

/**
 * Calculate token price in USD.
 *
 * Returns NaN when the required ratio field is missing/null so callers can
 * skip rendering that price type.
 */
function calculateTokenPrice(
  model: PricingModel,
  type: PriceType,
  ratio: number
): number {
  const base = model.model_ratio * 2 * ratio

  switch (type) {
    case 'input':
      return base
    case 'output':
      return base * model.completion_ratio
    case 'cache':
      return hasRatio(model.cache_ratio)
        ? base * Number(model.cache_ratio)
        : Number.NaN
    case 'create_cache':
      return hasRatio(model.create_cache_ratio)
        ? base * Number(model.create_cache_ratio)
        : Number.NaN
    case 'image':
      return hasRatio(model.image_ratio)
        ? base * Number(model.image_ratio)
        : Number.NaN
    case 'audio_input':
      return hasRatio(model.audio_ratio)
        ? base * Number(model.audio_ratio)
        : Number.NaN
    case 'audio_output':
      return hasRatio(model.audio_ratio) &&
        hasRatio(model.audio_completion_ratio)
        ? base *
            Number(model.audio_ratio) *
            Number(model.audio_completion_ratio)
        : Number.NaN
  }
}

function hasRatio(value: number | null | undefined): boolean {
  return value !== undefined && value !== null && Number.isFinite(Number(value))
}

/**
 * Apply recharge rate to price
 *
 * priceRate represents how much users need to recharge (in the display currency)
 * to get 1 USD credit. usdExchangeRate is the real exchange rate.
 *
 * The returned value will be formatted by formatBillingCurrencyFromUSD, which will
 * multiply by the display currency's exchange rate.
 *
 * Examples:
 *
 * 1. Display currency = USD:
 *    - Model: 1 USD
 *    - priceRate = 0.5 (recharge $0.5 to get $1 credit)
 *    - usdExchangeRate = 1
 *    - Return: 1 × 0.5 / 1 = 0.5
 *    - formatBillingCurrencyFromUSD(0.5) → $0.5 ✓
 *
 * 2. Display currency = CNY:
 *    - Model: 1 USD
 *    - priceRate = 4 (recharge ¥4 to get $1 credit)
 *    - usdExchangeRate = 7 (real rate: 1 USD = ¥7)
 *    - Return: 1 × 4 / 7 = 0.571
 *    - formatBillingCurrencyFromUSD(0.571) → 0.571 × 7 = ¥4 ✓
 *    - Normal price: ¥7, Recharge price: ¥4 (cheaper!)
 */
function applyRechargeRate(
  price: number,
  showWithRecharge: boolean,
  priceRate: number,
  usdExchangeRate: number
): number {
  if (!showWithRecharge) return price
  return (price * priceRate) / usdExchangeRate
}

/**
 * Format token-based price for display
 */
export function formatPrice(
  model: PricingModel,
  type: PriceType,
  tokenUnit: TokenUnit,
  showWithRecharge = false,
  priceRate = 1,
  usdExchangeRate = 1,
  selectedGroup?: string,
  showCurrencySymbol = true
): string {
  if (model.quota_type === QUOTA_TYPE_VALUES.REQUEST) {
    return '-'
  }

  const displayGroupRatio = getDisplayGroupRatio(model, selectedGroup)

  let priceInUSD = calculateTokenPrice(model, type, displayGroupRatio)
  priceInUSD = applyRechargeRate(
    priceInUSD,
    showWithRecharge,
    priceRate,
    usdExchangeRate
  )

  return formatPricingAmount(priceInUSD, {
    showSymbol: showCurrencySymbol,
    tokenUnit,
  })
}

/**
 * Format price for a specific group (token-based)
 */
export function formatGroupPrice(
  model: PricingModel,
  group: string,
  type: PriceType,
  tokenUnit: TokenUnit,
  showWithRecharge = false,
  priceRate = 1,
  usdExchangeRate = 1,
  groupRatio: Record<string, number>
): string {
  if (model.quota_type === QUOTA_TYPE_VALUES.REQUEST) {
    return '-'
  }

  const ratio = getConfiguredGroupRatio(groupRatio, group)
  let priceInUSD = calculateTokenPrice(model, type, ratio)

  priceInUSD = applyRechargeRate(
    priceInUSD,
    showWithRecharge,
    priceRate,
    usdExchangeRate
  )

  return formatPricingAmount(priceInUSD, { tokenUnit })
}

/**
 * Format fixed price for pay-per-request models (with specific group)
 */
export function formatFixedPrice(
  model: PricingModel,
  group: string,
  showWithRecharge = false,
  priceRate = 1,
  usdExchangeRate = 1,
  groupRatio: Record<string, number>
): string {
  if (model.quota_type !== QUOTA_TYPE_VALUES.REQUEST) {
    return '-'
  }

  const ratio = getConfiguredGroupRatio(groupRatio, group)
  let priceInUSD = (model.model_price || 0) * ratio

  priceInUSD = applyRechargeRate(
    priceInUSD,
    showWithRecharge,
    priceRate,
    usdExchangeRate
  )

  return formatPricingAmount(priceInUSD)
}

/**
 * Format fixed price for pay-per-request models (minimum price from all groups)
 */
export function formatRequestPrice(
  model: PricingModel,
  showWithRecharge = false,
  priceRate = 1,
  usdExchangeRate = 1,
  selectedGroup?: string,
  showCurrencySymbol = true
): string {
  if (model.quota_type !== QUOTA_TYPE_VALUES.REQUEST) {
    return '-'
  }

  const displayGroupRatio = getDisplayGroupRatio(model, selectedGroup)

  let priceInUSD = (model.model_price || 0) * displayGroupRatio

  priceInUSD = applyRechargeRate(
    priceInUSD,
    showWithRecharge,
    priceRate,
    usdExchangeRate
  )

  return formatPricingAmount(priceInUSD, { showSymbol: showCurrencySymbol })
}
