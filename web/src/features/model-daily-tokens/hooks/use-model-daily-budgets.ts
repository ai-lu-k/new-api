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

import { useAuthStore } from '@/stores/auth-store'

import { getModelDailyBudgets, type ModelDailyBudgets } from '../api'

/**
 * Only the models this account is actually limited on: an unlimited override is
 * not a limit, so it gets no row and no reserved column either.
 */
export function limitedModels(snapshot?: ModelDailyBudgets) {
  return (snapshot?.models ?? []).filter((budget) => !budget.unlimited)
}

/**
 * The signed-in user's daily model limits. The overview reads it to decide
 * whether to reserve a column for the panel, and the panel itself reads the
 * same cache entry, so both agree on one request.
 */
export function useModelDailyBudgets() {
  const userId = useAuthStore((state) => state.auth.user?.id)
  const sessionId = useAuthStore((state) => state.auth.session?.sid)

  return useQuery({
    queryKey: ['model-daily-tokens', userId, sessionId],
    queryFn: getModelDailyBudgets,
    enabled: Boolean(userId),
    staleTime: 30000,
    refetchInterval: 30000,
  })
}
