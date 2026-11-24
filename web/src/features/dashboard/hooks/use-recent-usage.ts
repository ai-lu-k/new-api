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

import { requireServerSuccess } from '@/lib/server-error-message'

import { getUserQuotaDates } from '../api'

/**
 * What the account spent over the last 24 hours, counted the way the overview
 * counts it: hourly buckets, summed. One query key, so the overview row and the
 * header readout that repeats the figure share a single request.
 */
export function useRecentUsage() {
  const range = useMemo(() => {
    const end = Math.floor(Date.now() / 1000)
    // The source groups usage by hour; include the current and 23 preceding buckets.
    return {
      start_timestamp: Math.floor(end / 3600) * 3600 - 23 * 3600,
      end_timestamp: end,
    }
  }, [])
  const query = useQuery({
    queryKey: [
      'dashboard',
      'overview',
      'summary-sparklines',
      range.start_timestamp,
      range.end_timestamp,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await getUserQuotaDates({
          start_timestamp: range.start_timestamp,
          end_timestamp: range.end_timestamp,
          default_time: 'hour',
        })
      ),
    staleTime: 60 * 1000,
  })
  const total = (query.data?.data ?? []).reduce(
    (sum, item) => sum + (Number(item.quota) || 0),
    0
  )
  return {
    total,
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  }
}
