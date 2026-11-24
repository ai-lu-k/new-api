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
import { expect, test } from 'vitest'

import {
  authBrandPalette,
  readAuthBrandColor,
  type Rgb,
} from '../auth-brand-shader'

// The production brand blue, resolved from --primary.
const BRAND: Rgb = [0.541, 0.706, 0.976]

function luminance(color: Rgb): number {
  const linear = (channel: number) =>
    channel <= 0.04045
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4)
  return (
    0.2126 * linear(color[0]) +
    0.7152 * linear(color[1]) +
    0.0722 * linear(color[2])
  )
}

function contrastWithWhite(color: Rgb): number {
  return 1.05 / (luminance(color) + 0.05)
}

test('the panel keeps white copy readable wherever a glow lands', () => {
  const palette = authBrandPalette(BRAND)

  expect(contrastWithWhite(palette.deep)).toBeGreaterThan(7)
  expect(contrastWithWhite(palette.mid)).toBeGreaterThan(4.5)
})

test('the palette grows lighter from the base to the highlight', () => {
  const palette = authBrandPalette(BRAND)

  expect(luminance(palette.deep)).toBeLessThan(luminance(palette.mid))
  expect(luminance(palette.mid)).toBeLessThan(luminance(palette.accent))
  expect(luminance(palette.accent)).toBeLessThan(luminance(palette.light))
})

test('the panel hues follow the theme colour instead of a fixed palette', () => {
  const fromBlue = authBrandPalette(BRAND).accent
  const fromGreen = authBrandPalette([0.3, 0.75, 0.45]).accent

  expect(fromBlue[2]).toBeGreaterThan(fromBlue[1])
  expect(fromGreen[1]).toBeGreaterThan(fromGreen[2])
})

test('the theme colour falls back to the brand blue when the variable is missing', () => {
  expect(readAuthBrandColor()).toEqual(BRAND)
})
