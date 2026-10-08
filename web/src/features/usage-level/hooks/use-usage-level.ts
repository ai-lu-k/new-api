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
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { getUserProfile } from '@/features/profile/api'
import type { UserProfile } from '@/features/profile/types'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

// One shared query refreshes consumption while the dashboard or profile is
// visible. It never copies account identity or permissions from a stale fetch.
export function useUsageLevel() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const userId = user?.id
  const applied = useRef<UserProfile | null>(null)
  const query = useQuery({
    queryKey: ['usage-level', userId],
    queryFn: async () =>
      requireServerSuccess(await getUserProfile()).data ?? null,
    enabled: Boolean(userId && user?.usage_level),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })

  useEffect(() => {
    const data = query.data
    if (
      !query.isFetchedAfterMount ||
      !data?.usage_level ||
      data.id !== userId ||
      applied.current === data
    ) {
      return
    }
    const current = useAuthStore.getState().auth.user
    if (!current || current.id !== data.id) return
    const oldLevel = current.usage_level?.level
    applied.current = data
    if (oldLevel != null && data.usage_level.level > oldLevel) {
      toast.success(
        t('You reached LV{{level}}', { level: data.usage_level.level })
      )
    }
    useAuthStore.getState().auth.setUser({
      ...current,
      quota: data.quota,
      request_count: data.request_count,
      used_quota: data.used_quota,
      usage_level: data.usage_level,
    })
  }, [query.data, query.isFetchedAfterMount, userId, t])

  return user
}
