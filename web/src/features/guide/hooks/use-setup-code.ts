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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { createServerError } from '@/lib/server-error-message'

import { createDshSetupCode } from '../api'

// A code on screen is replaced this long before it runs out, so that a command
// copied at the last moment still has time to be used.
const RENEW_EARLY_MS = 60 * 1000

/**
 * The account's current setup code. One is asked for as soon as the page is
 * shown and replaced before it expires, so a usable one is always on screen
 * without the user asking. Both one-command setups run on the same code.
 */
export function useSetupCode(
  userId: number | undefined,
  enabled: boolean,
  tokenId?: number
) {
  const { t } = useTranslation()
  const failure = t('Failed to prepare the setup prompt')
  const query = useQuery({
    queryKey: ['dsh-setup-code', userId ?? null, tokenId ?? null],
    queryFn: async () => {
      const response = await createDshSetupCode(tokenId)
      if (!response.success || !response.data) {
        throw createServerError(response, failure)
      }
      return response.data
    },
    enabled,
    // When to ask again is decided below, not by the cache.
    staleTime: Infinity,
    retry: false,
    refetchOnReconnect: false,
    meta: { errorToast: false },
  })
  const { data, refetch } = query
  // A code found past its lifetime stays hidden until its successor arrives.
  const [deadCode, setDeadCode] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    const expiresAt = data.expires_at * 1000
    let timer: number | undefined
    const renew = () => {
      // Nobody copies from a hidden page; it catches up when shown again.
      if (document.visibilityState !== 'visible') return
      if (Date.now() >= expiresAt) setDeadCode(data.code)
      void refetch()
    }
    const arm = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(
        renew,
        Math.max(expiresAt - RENEW_EARLY_MS - Date.now(), 0)
      )
    }
    arm()
    document.addEventListener('visibilitychange', arm)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', arm)
    }
  }, [data, refetch])

  return {
    setup: data && data.code !== deadCode ? data : undefined,
    error: query.isError ? query.error : null,
    isFetching: query.isFetching,
    renew: refetch,
  }
}
