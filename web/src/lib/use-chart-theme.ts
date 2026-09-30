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
 * Categorical palette for chart series. VChart's built-in themes ship their own
 * rainbow, which put the most saturated colour on the page outside the brand;
 * re-anchoring `dataScheme` here keeps every chart in the design system's own
 * hues. Ordered so the first series is Action Blue and adjacent series stay
 * distinguishable in both themes.
 */
const BRAND_CHART_PALETTE = [
  '#5e6ad2', // accent indigo
  '#26b5ce', // cyan
  '#4cb782', // green
  '#b78bfa', // violet
  '#f2994a', // amber
  '#8a8f98', // muted slate
  '#7c85e0', // light indigo
  '#3fd0e0', // bright cyan
  '#5ecf94', // light green
  '#c9a2fb', // light violet
  '#f2a65a', // light amber
  '#62666d', // dim slate
]

const BRAND_THEME_PREFIX = 'new-api-brand'

/** The subset of VChart's colour scheme this module reads and rewrites. */
type ChartColorScheme = Record<string, unknown> & { dataScheme?: unknown }

/**
 * VChart types `colorScheme.default` as a struct, an array of structs, or a
 * progressive-scheme case, so the series palette only becomes reachable after
 * a structural check. Returns null for any shape that does not carry a
 * `dataScheme`, which keeps an unrecognised theme on the stock palette.
 */
function readColorScheme(scheme: unknown): ChartColorScheme | null {
  const resolved = Array.isArray(scheme) ? scheme[0] : scheme
  if (typeof resolved !== 'object' || resolved === null) return null
  if (!('dataScheme' in resolved)) return null
  return resolved as ChartColorScheme
}

/**
 * Register a brand-palette variant of a VChart base theme and return its name.
 * Falls back to the base theme when the variant cannot be derived, so a VChart
 * theme-shape change degrades to the stock palette instead of an unstyled chart.
 */
function brandThemeName(
  ThemeManager: (typeof import('@visactor/vchart'))['ThemeManager'],
  base: 'light' | 'dark'
): string {
  const name = `${BRAND_THEME_PREFIX}-${base}`
  if (ThemeManager.themeExist(name)) {
    return name
  }
  if (!ThemeManager.themeExist(base)) {
    return base
  }

  const theme = ThemeManager.getTheme(base)
  const resolved = readColorScheme(theme?.colorScheme?.default)
  if (!resolved) {
    return base
  }

  // `readColorScheme` already narrowed the shape, so the reconstructed theme is
  // cast once here rather than threading VChart's scheme union through spreads.
  ThemeManager.registerTheme(name, {
    ...theme,
    colorScheme: {
      ...theme.colorScheme,
      default: { ...resolved, dataScheme: BRAND_CHART_PALETTE },
    },
  } as Parameters<typeof ThemeManager.registerTheme>[1])
  return name
}

/**
 * Lazy-load VChart's `ThemeManager` and switch its theme to follow the
 * resolved app theme (light / dark). Returns flags consumers can use to
 * defer chart rendering until the theme is ready.
 */
let themeManagerPromise: Promise<
  (typeof import('@visactor/vchart'))['ThemeManager']
> | null = null

export function useChartTheme() {
  const { resolvedTheme } = useTheme()
  const [themeReady, setThemeReady] = useState(false)
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
      const base = resolvedTheme === 'dark' ? 'dark' : 'light'
      ThemeManager.setCurrentTheme(brandThemeName(ThemeManager, base))
      setThemeReady(true)
    }
    updateTheme()
    return () => {
      cancelled = true
    }
  }, [resolvedTheme])

  return { resolvedTheme, themeReady }
}
