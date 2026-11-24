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
import { useLocation } from '@tanstack/react-router'
import { useEffect, useMemo, useRef } from 'react'

import { useAccessibleRootNavGroups } from '@/hooks/use-sidebar-view'
import { useAuthStore } from '@/stores/auth-store'

import { recordPageView } from '../api'
import { collectDestinations } from '../lib/destinations'
import { resolvePageKey } from '../lib/page-key'

/**
 * Report one visit per user-initiated page change.
 *
 * The first location of a session (refresh, bookmark, or a direct link) is
 * not a navigation, so it is not counted. Query strings, pagination, and
 * preloading keep the same pathname and therefore never add a visit. A failed
 * report is dropped silently: the ranking is decoration and must never
 * interrupt navigation.
 */
export function usePageViewTracker(): void {
  const pathname = useLocation({ select: (location) => location.pathname })
  const isAuthenticated = useAuthStore((state) => Boolean(state.auth.user))
  const navGroups = useAccessibleRootNavGroups()
  const knownUrls = useMemo(
    () => collectDestinations(navGroups).map((destination) => destination.url),
    [navGroups]
  )
  const previousPathname = useRef<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return
    const previous = previousPathname.current
    previousPathname.current = pathname
    if (previous === null || previous === pathname) return

    const page = resolvePageKey(pathname, knownUrls)
    if (!page) return
    void recordPageView(page).catch(() => undefined)
  }, [pathname, isAuthenticated, knownUrls])
}
