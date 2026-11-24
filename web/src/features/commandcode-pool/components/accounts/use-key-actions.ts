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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { handleServerError } from '@/lib/handle-server-error'

import {
  COMMAND_CODE_POOL_QUERY_ROOT,
  deletePoolKey,
  getKeyCredits,
  refreshAllCredits,
  updatePoolKey,
} from '../../api'
import type { CommandCodePoolKey } from '../../types'

/**
 * The key mutations. Every one lands in the proxy, so the list is re-read
 * afterwards instead of being patched locally; a failed call keeps the old row
 * and shows the proxy's own wording.
 */
export function useKeyActions() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  async function invalidatePool() {
    await queryClient.invalidateQueries({
      queryKey: COMMAND_CODE_POOL_QUERY_ROOT,
    })
  }

  const toggle = useMutation({
    mutationFn: async (input: {
      key: CommandCodePoolKey
      enabled: boolean
    }) => {
      const response = await updatePoolKey(input.key.id, {
        enabled: input.enabled,
      })
      if (!response.success) {
        throw new Error(response.message || t('Unable to change the key.'))
      }
      return response.data
    },
    onSuccess: async (_key, input) => {
      toast.success(input.enabled ? t('Key enabled') : t('Key disabled'))
      await invalidatePool()
    },
    onError: (error: unknown) => {
      handleServerError(error, t('Unable to change the key.'))
    },
  })

  const refreshOne = useMutation({
    mutationFn: async (key: CommandCodePoolKey) => {
      const response = await getKeyCredits(key.id)
      if (!response.success) {
        throw new Error(response.message || t('Unable to read the credits.'))
      }
      return response.data
    },
    onSuccess: async (credits) => {
      if (credits?.error) {
        toast.error(credits.error)
      } else {
        toast.success(t('Credits refreshed'))
      }
      await invalidatePool()
    },
    onError: (error: unknown) => {
      handleServerError(error, t('Unable to read the credits.'))
    },
  })

  const remove = useMutation({
    mutationFn: async (key: CommandCodePoolKey) => {
      const response = await deletePoolKey(key.id)
      if (!response.success) {
        throw new Error(response.message || t('Unable to delete the key.'))
      }
      return key
    },
    onSuccess: async () => {
      toast.success(t('Key deleted'))
      await invalidatePool()
    },
    onError: (error: unknown) => {
      handleServerError(error, t('Unable to delete the key.'))
    },
  })

  const refreshAll = useMutation({
    mutationFn: async () => {
      const response = await refreshAllCredits()
      if (!response.success) {
        throw new Error(response.message || t('Unable to read the credits.'))
      }
      return response.data
    },
    onSuccess: async (result) => {
      const results = result?.results ?? []
      const failed = results.filter((item) => item.credits?.error).length
      toast.success(
        t('{{ok}} read, {{failed}} failed', {
          ok: results.length - failed,
          failed,
        })
      )
      await invalidatePool()
    },
    onError: (error: unknown) => {
      handleServerError(error, t('Unable to read the credits.'))
    },
  })

  return { toggle, refreshOne, remove, refreshAll }
}
