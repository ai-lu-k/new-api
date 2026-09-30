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
import { useEffect, useRef, useState } from 'react'

import { useTheme } from '@/context/theme-provider'

/**
 * Used until the tokens have been read, and if they are missing entirely.
 * Kept in step with the `--chart-*` values in `styles/theme.css`.
 */
const FALLBACK_CHART_COLORS = [
  '#5e6ad2',
  '#26b5ce',
  '#4cb782',
  '#b78bfa',
  '#f2994a',
]

/**
 * Reads the categorical series palette from the `--chart-*` tokens.
 *
 * Charts take their colours from the resolved spec rather than from a
 * registered VChart theme. Registering one merges the supplied palette onto a
 * built-in theme whose `dataScheme` is a progressive array, and the
 * element-wise merge does not preserve the palette, so the chart silently kept
 * the VChart default. Reading the tokens also keeps the charts tracking the
 * rest of the design system automatically.
 */
function readChartColors(): string[] {
  if (typeof document === 'undefined') return FALLBACK_CHART_COLORS
  const style = getComputedStyle(document.documentElement)
  const colors = [1, 2, 3, 4, 5]
    .map((step) => style.getPropertyValue(`--chart-${step}`).trim())
    .filter(Boolean)
  return colors.length > 0 ? colors : FALLBACK_CHART_COLORS
}

/**
 * Lazy-load VChart's `ThemeManager`, switch its theme to follow the resolved
 * app theme (light / dark), and resolve the series palette for that theme.
 *
 * `themeReady` gates rendering: a chart created before the theme is applied
 * keeps the default chart chrome. Pass `chartColors` as the spec's top-level
 * `color` so the series carry the design system's hues.
 */
let themeManagerPromise: Promise<
  (typeof import('@visactor/vchart'))['ThemeManager']
> | null = null

export function useChartTheme() {
  const { resolvedTheme } = useTheme()
  const [themeReady, setThemeReady] = useState(false)
  const [chartColors, setChartColors] = useState<string[]>(
    FALLBACK_CHART_COLORS
  )
  const themeRef = useRef<
    (typeof import('@visactor/vchart'))['ThemeManager'] | null
  >(null)

  useEffect(() => {
    let cancelled = false
    const updateTheme = async () => {
      setThemeReady(false)
      if (!themeManagerPromise) {
        themeManagerPromise = import('@visactor/vchart').then(
          (m) => m.ThemeManager
        )
      }
      const ThemeManager = await themeManagerPromise
      if (cancelled) return
      themeRef.current = ThemeManager
      ThemeManager.setCurrentTheme(resolvedTheme === 'dark' ? 'dark' : 'light')
      setChartColors(readChartColors())
      setThemeReady(true)
    }
    updateTheme()
    return () => {
      cancelled = true
    }
  }, [resolvedTheme])

  return { resolvedTheme, themeReady, chartColors }
}
