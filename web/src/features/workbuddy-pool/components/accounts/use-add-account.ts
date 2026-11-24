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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { hubGet } from '../../api'
import { refusalMessage, writeHub } from './hub-call'
import type {
  HubImportResponse,
  HubImportResult,
  HubLoginPoll,
  HubLoginStart,
} from './types'

/** The poll only answers `pending` until the browser side finishes. */
export function isLoginFinished(status?: string): boolean {
  return (
    status === 'ok' ||
    status === 'error' ||
    status === 'expired' ||
    status === 'unknown'
  )
}

function outcomeCount(list?: HubImportResult['added']): number {
  return list?.length ?? 0
}

type UseAddAccountOptions = {
  // Re-signing-in an existing account should land the operator straight on the
  // upstream page; adding one may stay a link the operator clicks deliberately.
  openAuthWindow?: boolean
}

/**
 * The two ways an account joins the pool: an exported JSON document, and the
 * OAuth hand-off the hub runs for the desktop client. The poll is a query so a
 * closed dialog cannot leave a timer behind.
 */
export function useAddAccount(options?: UseAddAccountOptions) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [loginState, setLoginState] = useState<string | null>(null)
  const [signedIn, setSignedIn] = useState<string | null>(null)

  const settle = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workbuddy', 'accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['workbuddy-hub-status'] }),
    ])
  }

  const preview = useMutation({
    mutationFn: (data: unknown) =>
      writeHub<HubImportResponse>('accounts.import', { data, dryRun: true }),
  })

  const commit = useMutation({
    mutationFn: (input: { data: unknown; overwrite: boolean }) =>
      writeHub<HubImportResponse>('accounts.import', {
        data: input.data,
        overwrite: input.overwrite,
      }),
    onSuccess: async (data) => {
      const result = data?.result
      toast.success(
        t(
          'Import finished: {{added}} added, {{updated}} updated, {{skipped}} skipped, {{invalid}} invalid',
          {
            added: outcomeCount(result?.added),
            updated: outcomeCount(result?.updated),
            skipped: outcomeCount(result?.skipped),
            invalid: outcomeCount(result?.invalid),
          }
        )
      )
      await settle()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const start = useMutation({
    mutationFn: (realm: string) =>
      writeHub<HubLoginStart>('accounts.login.start', {
        platform: 'CLI',
        realm,
      }),
    onSuccess: (data) => {
      if (!data?.state) {
        toast.error(t('The gateway did not return a sign-in state'))
        return
      }
      setSignedIn(null)
      setLoginState(data.state)
      if (options?.openAuthWindow && data.authUrl) {
        window.open(data.authUrl, '_blank', 'noopener,noreferrer')
      }
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const cancel = useMutation({
    mutationFn: async (state: string) => {
      await writeHub('accounts.login.cancel', { state })
    },
    onSettled: () => {
      setLoginState(null)
    },
  })

  const poll = useQuery({
    queryKey: ['workbuddy', 'accounts', 'login', loginState],
    enabled: Boolean(loginState),
    queryFn: async () => {
      const response = await hubGet<HubLoginPoll>('accounts.login.poll', {
        state: loginState,
      })
      if (!response.success) throw new Error(refusalMessage(response))
      return response.data
    },
    refetchInterval: (query) =>
      isLoginFinished(query.state.data?.status) ? false : 2500,
  })

  const status = poll.data?.status
  useEffect(() => {
    if (status !== 'ok') return
    setSignedIn(poll.data?.account?.nickname ?? '')
    void queryClient.invalidateQueries({ queryKey: ['workbuddy', 'accounts'] })
    void queryClient.invalidateQueries({ queryKey: ['workbuddy-hub-status'] })
  }, [status, poll.data, queryClient])

  const reset = (): void => {
    setLoginState(null)
    setSignedIn(null)
    start.reset()
    preview.reset()
    commit.reset()
  }

  return {
    preview,
    commit,
    start,
    cancel,
    poll,
    loginState,
    signedIn,
    reset,
  }
}
