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
import { expect, it } from 'vitest'

import { getCurrencyDisplay } from '@/lib/currency'

import { formatCurrency } from '../lib/format'

it('keeps two decimals and the amount symbol used by the page balance', () => {
  const { meta } = getCurrencyDisplay()

  const value = formatCurrency(12.5)

  expect(value).toContain('12.50')
  if (meta.kind === 'tokens') {
    expect(value).not.toContain('$')
  } else {
    expect(value.startsWith(meta.symbol)).toBe(true)
  }
})

it('shows a dash for an amount that is not a number', () => {
  expect(formatCurrency('nope')).toBe('-')
})
