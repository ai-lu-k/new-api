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
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { clearAuthentication } from '@/lib/auth-session'
import {
  publishEnvironmentChange,
  requestEnvironmentReload,
  type AppEnvironment,
} from '@/lib/environment'
import { handleServerError } from '@/lib/handle-server-error'
import { ROLE } from '@/lib/roles'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

export interface EnvironmentStatus {
  enabled: boolean
  environment: AppEnvironment
  version: string
}

export function useEnvironment() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const isAdmin = (user?.role ?? 0) >= ROLE.ADMIN
  const status = useQuery({
    queryKey: ['environment', user?.id],
    enabled: isAdmin,
    retry: false,
    meta: { errorToast: false },
    queryFn: async ({ signal }): Promise<EnvironmentStatus> => {
      const response = await api.get('/api/environment', { signal })
      const result = requireServerSuccess(response.data)
      if (
        !result?.data ||
        typeof result.data.enabled !== 'boolean' ||
        !['production', 'staging'].includes(result.data.environment) ||
        typeof result.data.version !== 'string'
      ) {
        throw new Error(t('Request failed'))
      }
      return result.data
    },
  })
  const switching = useEnvironmentSwitch()
  return { isAdmin, status, ...switching }
}

export function useEnvironmentSwitch(onError?: (error: unknown) => void) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const switchEnvironment = useMutation({
    mutationKey: ['environment', 'switch'],
    retry: false,
    mutationFn: async (environment: AppEnvironment): Promise<void> => {
      const response = await api.post(
        '/api/environment',
        { environment },
        { skipAuthRefresh: true }
      )
      requireServerSuccess(response.data)
      if (response.data?.success !== true) throw new Error(t('Request failed'))
    },
    onSuccess: async (_result, environment) => {
      await queryClient.cancelQueries()
      queryClient.clear()
      // Drop only in-memory state. The single production login Cookie survives.
      clearAuthentication(false, 'idle')
      publishEnvironmentChange(environment)
      requestEnvironmentReload('switch')
    },
    onError: (error) => {
      if (onError) onError(error)
      else handleServerError(error, t('Request failed'))
    },
  })
  const isSwitching =
    useIsMutating({ mutationKey: ['environment', 'switch'] }) > 0
  return { switchEnvironment, isSwitching }
}
