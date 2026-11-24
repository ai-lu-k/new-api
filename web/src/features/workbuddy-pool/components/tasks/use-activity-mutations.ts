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
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { hubPost } from '../../api'
import { invalidateAccountState } from './invalidate'
import type {
  WorkBuddyActivityResult,
  WorkBuddyActivityResultRow,
} from './types'

type Outcome = { ok: number; failed: number; firstFailure: string }

/** Counts one bulk call's per-account outcomes so the toast can say what happened. */
function countOutcomes(rows: WorkBuddyActivityResultRow[]): Outcome {
  const ok = rows.filter((row) => row.ok === true).length
  const failure = rows.find((row) => row.ok !== true)
  return {
    ok,
    failed: rows.length - ok,
    firstFailure: failure?.error || failure?.msg || '',
  }
}

/** A partial run is still a failure: the operator needs the hub's reason. */
function reportOutcome(
  outcome: Outcome,
  successText: string,
  failedText: string
): void {
  if (outcome.failed > 0) {
    toast.error(failedText, { description: outcome.firstFailure || undefined })
    return
  }
  toast.success(successText)
}

/** `POST /accounts/daily-chat`: the light desktop chat every intl account needs. */
export function useBulkDailyChat(): UseMutationResult<
  WorkBuddyActivityResult,
  Error,
  void
> {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response = requireServerSuccess(
        await hubPost<WorkBuddyActivityResult>('accounts.daily-chat', {})
      )
      return response.data ?? {}
    },
    onSuccess: async (data) => {
      const rows = data.results ?? []
      if (rows.length === 0) {
        toast.warning(t('No international account takes part in tasks'))
      } else {
        const outcome = countOutcomes(rows)
        reportOutcome(
          outcome,
          t('Daily chat finished for {{accounts}} accounts', {
            accounts: outcome.ok,
          }),
          t('Daily chat finished: {{ok}} succeeded, {{failed}} failed', {
            ok: outcome.ok,
            failed: outcome.failed,
          })
        )
      }
      await invalidateAccountState(queryClient)
    },
    onError: (error) =>
      handleServerError(error, t('Could not run the daily chat')),
  })
}

/** `POST /accounts/daily-chat-web`: creates a web session and runs a real task. */
export function useBulkDailyChatWeb(): UseMutationResult<
  WorkBuddyActivityResult,
  Error,
  void
> {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response = requireServerSuccess(
        await hubPost<WorkBuddyActivityResult>('accounts.daily-chat-web', {})
      )
      return response.data ?? {}
    },
    onSuccess: async (data) => {
      const rows = data.results ?? []
      if (rows.length === 0) {
        toast.warning(t('No international account takes part in tasks'))
      } else {
        const outcome = countOutcomes(rows)
        reportOutcome(
          outcome,
          t('Web-channel chat created {{accounts}} sessions', {
            accounts: outcome.ok,
          }),
          t('Web-channel chat finished: {{ok}} succeeded, {{failed}} failed', {
            ok: outcome.ok,
            failed: outcome.failed,
          })
        )
      }
      await invalidateAccountState(queryClient)
    },
    onError: (error) =>
      handleServerError(error, t('Could not run the web-channel chat')),
  })
}
