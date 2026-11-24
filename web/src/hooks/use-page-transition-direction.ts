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
import { useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

/**
 * Which way a page change reads.
 *
 * `forward` — going deeper in the site (the new page arrives from the right).
 * `backward` — coming back out (it arrives from the left).
 */
export type PageTransitionDirection = 'forward' | 'backward'

/**
 * Depth of a pathname. Every segment counts as one level, so
 * `/dashboard/models` (2) is deeper than `/dashboard` (1) and `/keys` (1) is
 * a sibling of everything else at the first level.
 */
export function routeDepth(pathname: string): number {
  return pathname.split('/').filter(Boolean).length
}

/**
 * Resolve the direction between two pathnames. Deeper wins; at the same depth
 * the two paths are siblings, so the alphabetical order of the pathnames
 * decides — a stable tie-break that keeps "next tab on the right" feeling
 * right without inventing history semantics.
 */
export function resolvePageTransitionDirection(
  from: string | undefined,
  to: string
): PageTransitionDirection {
  if (!from || from === to) return 'forward'

  const fromDepth = routeDepth(from)
  const toDepth = routeDepth(to)
  if (toDepth > fromDepth) return 'forward'
  if (toDepth < fromDepth) return 'backward'

  return to.localeCompare(from) > 0 ? 'forward' : 'backward'
}

/**
 * Direction of the navigation that is on screen right now.
 *
 * The previous pathname is remembered across navigations, so a component can
 * pick the entering side for the motion fallback (browsers without View
 * Transitions) without touching history state.
 */
export function usePageTransitionDirection(): PageTransitionDirection {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const previousPathname = useRef<string | undefined>(undefined)
  const [direction, setDirection] = useState<PageTransitionDirection>('forward')

  useEffect(() => {
    const next = resolvePageTransitionDirection(
      previousPathname.current,
      pathname
    )
    previousPathname.current = pathname
    setDirection(next)
  }, [pathname])

  return direction
}

/** Signed pixel offset for the entering / leaving page, in page-shift units. */
export function directionSign(direction: PageTransitionDirection): 1 | -1 {
  return direction === 'forward' ? 1 : -1
}
