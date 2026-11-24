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
import { beforeEach, expect, it } from 'vitest'

import { formatCurrencyFromUSD, formatQuotaWithCurrency } from '@/lib/currency'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

const QUOTA_PER_UNIT = DEFAULT_CURRENCY_CONFIG.quotaPerUnit

beforeEach(() => {
  window.localStorage.clear()
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG },
  })
})

it('pads a large amount to two decimals so a column of figures lines up', () => {
  expect(formatCurrencyFromUSD(235.1, { locale: 'en-US' })).toBe('$235.10')
  expect(formatCurrencyFromUSD(188.79, { locale: 'en-US' })).toBe('$188.79')
})

it('keeps a small amount at its configured precision instead of padding it', () => {
  expect(formatCurrencyFromUSD(0.003774, { locale: 'en-US' })).toBe('$0.0038')
})

it('does not add decimals to token counts', () => {
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG, quotaDisplayType: 'TOKENS' },
  })

  expect(formatQuotaWithCurrency(5 * QUOTA_PER_UNIT)).toBe('2500k')
})
