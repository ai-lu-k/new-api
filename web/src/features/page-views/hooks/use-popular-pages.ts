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
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { useAccessibleRootNavGroups } from '@/hooks/use-sidebar-view'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getPopularPageViews } from '../api'
import { collectDestinations, type NavDestination } from '../lib/destinations'

/** How many shortcuts the profile menu shows. */
export const POPULAR_PAGE_LIMIT = 4

/**
 * Ordering used before the site has a week of data, or when the ranking
 * names pages this user cannot reach. Each entry is only a candidate: it is
 * dropped unless the user's navigation actually offers it.
 */
const FALLBACK_URLS = [
  '/keys',
  '/wallet',
  '/usage-logs/common',
  '/dashboard/overview',
  '/profile',
  '/playground',
]

/**
 * The shortcuts the profile menu should show: site-wide favourites from the
 * last rolling week, filtered to pages this user can reach, then topped up
 * with the default candidates so the menu is never short or empty.
 */
export function usePopularPages(): NavDestination[] {
  const navGroups = useAccessibleRootNavGroups()
  const destinations = useMemo(
    () => collectDestinations(navGroups),
    [navGroups]
  )

  const query = useQuery({
    queryKey: ['page-views', 'popular'],
    queryFn: async () => {
      const result = requireServerSuccess(await getPopularPageViews())
      return Array.isArray(result?.data) ? result.data : []
    },
    // A menu that reorders while it is open is worse than a slightly stale
    // ranking, so the list is fetched once per session and never polled.
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
    meta: { errorToast: false },
  })

  return useMemo(() => {
    const byUrl = new Map(
      destinations.map((destination) => [destination.url, destination])
    )
    const picked: NavDestination[] = []
    const seen = new Set<string>()

    for (const entry of query.data ?? []) {
      const destination = byUrl.get(entry.page)
      if (!destination || seen.has(destination.url)) continue
      seen.add(destination.url)
      picked.push(destination)
      if (picked.length === POPULAR_PAGE_LIMIT) return picked
    }

    for (const url of FALLBACK_URLS) {
      if (picked.length === POPULAR_PAGE_LIMIT) break
      const destination = byUrl.get(url)
      if (!destination || seen.has(url)) continue
      seen.add(url)
      picked.push(destination)
    }
    return picked
  }, [destinations, query.data])
}
