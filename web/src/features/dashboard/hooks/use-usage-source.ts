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

import { requireServerSuccess } from '@/lib/server-error-message'

import { getUserUsageSource } from '../api'
import type { UsageSource } from '../types'

/**
 * Usage split by funding source. A deployment that has not shipped the
 * endpoint yet answers 404: the query then fails quietly and the overview
 * simply omits the gift line instead of failing the page.
 */
export function useUsageSource() {
  return useQuery({
    queryKey: ['user', 'usage-source'],
    queryFn: async (): Promise<UsageSource | null> => {
      const result = requireServerSuccess(await getUserUsageSource())
      const data = result?.data
      // A payload without the traceability flag cannot state a fact about
      // gifts, so it is treated like a missing endpoint.
      if (!data || typeof data.gift_known !== 'boolean') return null
      return data
    },
    staleTime: 60 * 1000,
    retry: false,
    meta: { errorToast: false },
  })
}
