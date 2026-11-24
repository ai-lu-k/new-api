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

import { getGiftStats } from '../api'
import type { GiftStats } from '../types'

/**
 * The gift ledger of the site.
 *
 * `stats` stays null while the endpoint is missing (a site without it answers
 * 404) or the request fails; the block is then left out instead of printing
 * zeroes. `readAt` is when the figures were read, in epoch milliseconds.
 */
export function useGiftStats(): { stats: GiftStats | null; readAt: number } {
  const query = useQuery({
    queryKey: ['gift-stats'],
    queryFn: getGiftStats,
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { errorToast: false },
  })

  return { stats: query.data ?? null, readAt: query.dataUpdatedAt }
}
