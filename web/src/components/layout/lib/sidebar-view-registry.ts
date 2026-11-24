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
import type { TFunction } from 'i18next'

import { SYSTEM_SETTINGS_VIEW } from '../config/system-settings.config'
import type { NavGroup, SidebarView } from '../types'

/**
 * Registered nested sidebar views.
 *
 * Each entry describes a contextual sidebar that replaces the root
 * navigation when the user enters that workspace (Vercel-style
 * "drill-in" pattern). Add new entries here to register a new view.
 *
 * Match priority is array order; the first matching `pathPattern` wins.
 */
const SIDEBAR_VIEWS: readonly SidebarView[] = [SYSTEM_SETTINGS_VIEW]

/**
 * Resolve the active nested view for the given path.
 *
 * @returns Matching {@link SidebarView}, or `null` when the root
 *          navigation should be displayed.
 */
export function resolveSidebarView(pathname: string): SidebarView | null {
  return SIDEBAR_VIEWS.find((view) => view.pathPattern.test(pathname)) ?? null
}

/**
 * Backwards-compatible helper for consumers (e.g. command palette) that
 * just need the navigation groups for the current path, without caring
 * about the view metadata.
 *
 * @returns Nav groups for the matched view, or `null` if no nested view
 *          matches (callers should then fall back to root nav groups).
 */
export function getNavGroupsForPath(
  pathname: string,
  t: TFunction
): NavGroup[] | null {
  const view = resolveSidebarView(pathname)
  return view ? view.getNavGroups(t) : null
}

/** Rows that can be selected: Base UI maps `isActive` to `data-active`. */
const SELECTED_ROW =
  '[data-sidebar="menu-button"][data-active], [data-sidebar="menu-sub-button"][data-active]'

/** A selected row, boxed in the coordinates of the nav it sits in. */
export type SelectedRow = {
  /** Link plus label, so two selections can be told apart. */
  id: string
  x: number
  y: number
  width: number
  height: number
}

/**
 * Measure the selected row of a sidebar nav.
 *
 * The selection is read from the DOM because that is where `checkIsActive` has
 * already decided it: the mark that travels between rows needs the same answer
 * as the rows themselves, not a second copy of the matching rules.
 *
 * @returns The row's box relative to `container`, or `null` when nothing is
 *          selected or the selected row is hidden inside a folded group.
 */
/**
 * The row a reader would call "current" when no row matched exactly: the link
 * whose href is the longest prefix of the path. A section page such as
 * `/dashboard/flow` belongs to the `/dashboard/models` row even though the two
 * share no prefix beyond the workspace root, so the row itself declares those
 * siblings; this fallback only covers the cases nobody declared.
 */
function closestRow(
  container: HTMLElement,
  pathname: string
): HTMLElement | null {
  const rows = container.querySelectorAll<HTMLElement>(
    '[data-sidebar="menu-button"][href], [data-sidebar="menu-sub-button"][href]'
  )
  let best: HTMLElement | null = null
  let bestLength = -1
  for (const row of rows) {
    const href = row.getAttribute('href') ?? ''
    if (!href || href === '/' || !pathname.startsWith(href)) continue
    if (href.length > bestLength) {
      best = row
      bestLength = href.length
    }
  }
  return best
}

export function measureSelectedRow(
  container: HTMLElement,
  pathname: string = window.location.pathname
): SelectedRow | null {
  const active = container.querySelector<HTMLElement>(SELECTED_ROW)
  // A child page that no row claims would otherwise leave the mark nowhere.
  const row = active ?? closestRow(container, pathname)
  if (!row || row.offsetParent === null) return null

  const box = row.getBoundingClientRect()
  const origin = container.getBoundingClientRect()
  return {
    id: `${row.getAttribute('href') ?? ''}|${row.textContent ?? ''}`,
    x: box.left - origin.left,
    y: box.top - origin.top,
    width: box.width,
    height: box.height,
  }
}
