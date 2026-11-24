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

import { hubGet } from '../../api'
import { refusalMessage, writeHub } from './hub-call'
import type {
  AccountPatch,
  HubCreditsResponse,
  HubExportDoc,
  HubTaskResponse,
  HubTaskResult,
  HubTestResponse,
} from './types'

/** The hub takes one field per `/accounts/set` call, so a patch is a loop. */
async function applyPatch(uid: string, patch: AccountPatch): Promise<void> {
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue
    await writeHub('accounts.set', { uid, [field]: value })
  }
}

function countResults(results: HubTaskResult[]): {
  ok: number
  failed: number
  firstError: string
} {
  const failed = results.filter((row) => !row.ok)
  return {
    ok: results.length - failed.length,
    failed: failed.length,
    firstError: failed[0]?.error || failed[0]?.msg || '',
  }
}

function saveJsonFile(doc: unknown): string {
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(/[-:T]/g, '')
  const name = `workbuddy-accounts-${stamp}.json`
  const blob = new Blob([JSON.stringify(doc, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return name
}

/**
 * Every write the accounts tab can make. Each one reports the hub's own wording
 * on failure and re-reads the pool afterwards, because a refresh, a test or a
 * check-in changes what the rows say.
 */
export function useAccountActions() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const settle = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workbuddy', 'accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['workbuddy-hub-status'] }),
    ])
  }
  const onError = (error: Error): void => {
    toast.error(error.message)
  }

  const setAccount = useMutation({
    mutationFn: (input: { uid: string; patch: AccountPatch }) =>
      applyPatch(input.uid, input.patch),
    onSuccess: async () => {
      toast.success(t('Account updated'))
      await settle()
    },
    onError,
  })

  const removeAccount = useMutation({
    mutationFn: (uid: string) => writeHub('accounts.delete', { uid }),
    onSuccess: async () => {
      toast.success(t('Account deleted'))
      await settle()
    },
    onError,
  })

  const refresh = useMutation({
    mutationFn: async (uid?: string) => {
      const data = await writeHub<HubTaskResponse>('accounts.refresh', {
        uid,
      })
      return countResults(data?.results ?? [])
    },
    onSuccess: async (counts) => {
      if (counts.failed > 0) {
        toast.warning(
          t('{{ok}} refreshed, {{failed}} failed: {{error}}', {
            ok: counts.ok,
            failed: counts.failed,
            error: counts.firstError,
          })
        )
      } else {
        toast.success(
          t('Credentials refreshed for {{count}} accounts', {
            count: counts.ok,
          })
        )
      }
      await settle()
    },
    onError,
  })

  const test = useMutation({
    mutationFn: (uid: string) =>
      writeHub<HubTestResponse>('accounts.test', { uid }),
    onSuccess: async (data) => {
      if (data?.ok) {
        toast.success(
          t('Test passed in {{ms}}ms on {{model}}', {
            ms: data.elapsed_ms ?? 0,
            model: data.model ?? '',
          })
        )
      } else {
        const reason = data?.error || `HTTP ${data?.status ?? 0}`
        toast.error(t('Test failed: {{error}}', { error: reason }))
      }
      await settle()
    },
    onError,
  })

  const testAll = useMutation({
    mutationFn: (realm: string) =>
      writeHub<HubTestResponse>('accounts.test', { realm }),
    onSuccess: async (data) => {
      const summary = data?.summary
      if (summary?.networkDown) {
        const reason = data?.network?.error || t('Unknown error')
        toast.error(
          t('This machine has no network: {{error}}', { error: reason })
        )
      } else if (summary?.failed) {
        toast.warning(
          t('Test finished: {{passed}} of {{tested}} passed', {
            passed: summary?.passed ?? 0,
            tested: summary?.tested ?? 0,
          })
        )
      } else {
        toast.success(
          t('Test finished: {{passed}} of {{tested}} passed', {
            passed: summary?.passed ?? 0,
            tested: summary?.tested ?? 0,
          })
        )
      }
      await settle()
    },
    onError,
  })

  const fetchCredits = useMutation({
    mutationFn: async (uid?: string) => {
      const data = await writeHub<HubCreditsResponse>(
        'accounts.credits.fetch',
        {
          uid,
        }
      )
      return data?.accounts?.length ?? 0
    },
    onSuccess: async (count) => {
      toast.success(t('Credits refreshed for {{count}} accounts', { count }))
      await settle()
    },
    onError,
  })

  const dailyChat = useMutation({
    mutationFn: async (uid?: string) => {
      const data = await writeHub<HubTaskResponse>('accounts.daily-chat', {
        uid,
      })
      return countResults(data?.results ?? [])
    },
    onSuccess: async (counts) => {
      await settle()
      if (counts.failed > 0) {
        toast.warning(
          t('Daily chat: {{ok}} succeeded, {{failed}} failed: {{error}}', {
            ok: counts.ok,
            failed: counts.failed,
            error: counts.firstError,
          })
        )
        return
      }
      toast.success(
        t('Daily chat finished for {{count}} accounts', {
          count: counts.ok,
        })
      )
    },
    onError,
  })

  const syncProfile = useMutation({
    mutationFn: (uid?: string) =>
      writeHub<{
        updated?: { nickname?: string }[]
        failed?: { error?: string }[]
      }>('accounts.sync-profile', { uid }),
    onSuccess: async (data) => {
      const nickname = data?.updated?.[0]?.nickname
      if (nickname) {
        toast.success(t('Profile synced: {{nickname}}', { nickname }))
      } else if (data?.failed?.[0]?.error) {
        toast.error(data.failed[0].error)
      } else {
        toast.success(t('Profile synced'))
      }
      await settle()
    },
    onError,
  })

  const exportAccounts = useMutation({
    mutationFn: async () => {
      const response = await hubGet<HubExportDoc>('accounts.export')
      if (!response.success) throw new Error(refusalMessage(response))
      const doc = response.data
      if (!doc) throw new Error(t('The WorkBuddy gateway returned no export'))
      return {
        count: doc.count ?? doc.accounts?.length ?? 0,
        name: saveJsonFile(doc),
      }
    },
    onSuccess: (result) => {
      toast.success(t('Exported {{count}} accounts to {{name}}', result))
    },
    onError,
  })

  return {
    setAccount,
    removeAccount,
    refresh,
    test,
    testAll,
    fetchCredits,
    dailyChat,
    syncProfile,
    exportAccounts,
  }
}

export type AccountActions = ReturnType<typeof useAccountActions>
