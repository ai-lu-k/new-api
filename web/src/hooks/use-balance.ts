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
import { useEffect } from 'react'

import { getSelf } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

/**
 * What the account can still spend. The server's answer wins because spending
 * happens in other tabs and on other keys; the store covers the moment before
 * the first answer arrives and the cases where it never does.
 *
 * Both readers — the header figure and the account panel — share one query key,
 * so opening the panel reuses the header's request instead of spending another.
 */
export function useBalance(enabled = true): number | null {
  const storeQuota = useAuthStore((state) => state.auth.user?.quota ?? null)
  const { data, refetch } = useQuery({
    queryKey: ['self-balance'],
    queryFn: async () => {
      const response = await getSelf()
      const quota = response?.data?.quota
      return typeof quota === 'number' ? quota : null
    },
    enabled,
    staleTime: 0,
    retry: false,
    meta: { errorToast: false },
  })

  // A top-up updates the signed-in account in the store before anything else
  // knows, so a store figure that disagrees with the server's answer is the
  // signal to read again. It settles after one request: the two then agree.
  const movedBehindUs =
    data != null && storeQuota != null && storeQuota !== data
  useEffect(() => {
    if (movedBehindUs) void refetch()
  }, [movedBehindUs, refetch])

  return data ?? storeQuota
}
