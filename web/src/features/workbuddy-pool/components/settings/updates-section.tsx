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
import { RefreshCw, Upload } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import { requireServerSuccess } from '@/lib/server-error-message'

import { hubGet, hubPost } from '../../api'
import type { HubUpdateStatus } from './types'
import { UpdatesRollback } from './updates-rollback'
import { BUSY_STATES, UpdatesStatus } from './updates-status'

/**
 * The hub's own updater. Checking is harmless; installing replaces the gateway's
 * program files and restarts it, so it is confirmed by version and only offered
 * when the hub says its updater is installed.
 */
export function UpdatesSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [confirmInstall, setConfirmInstall] = useState(false)

  const updates = useQuery({
    queryKey: ['workbuddy', 'settings', 'updates'],
    queryFn: async () =>
      requireServerSuccess(await hubGet<HubUpdateStatus>('updates')),
    refetchInterval: 20_000,
  })
  const status = updates.data?.data

  const check = useMutation({
    mutationFn: async () => {
      const response = await hubPost<HubUpdateStatus & { ok?: boolean }>(
        'updates.check',
        {}
      )
      if (!response.success) {
        throw new Error(response.message || t('The update check failed.'))
      }
      if (response.data?.ok === false) {
        throw new Error(
          response.data.last_error || t('The update check did not run.')
        )
      }
      return response.data
    },
    onSuccess: async (next) => {
      if (next?.update_available) {
        toast.success(
          t('Version {{version}} is available.', {
            version: next.latest_version ?? '',
          })
        )
      } else {
        toast.success(t('Already up to date.'))
      }
      await queryClient.invalidateQueries({
        queryKey: ['workbuddy', 'settings', 'updates'],
      })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const install = useMutation({
    mutationFn: async () => {
      const response = await hubPost<{ ok?: boolean; msg?: string }>(
        'updates.install',
        {}
      )
      if (!response.success) {
        throw new Error(response.message || t('Unable to start the update.'))
      }
      if (response.data?.ok === false) {
        throw new Error(response.data.msg || t('Unable to start the update.'))
      }
      return true
    },
    onSuccess: async () => {
      setConfirmInstall(false)
      toast.success(
        t('The update started. The gateway restarts while it runs.')
      )
      await queryClient.invalidateQueries({
        queryKey: ['workbuddy', 'settings', 'updates'],
      })
    },
    onError: (error: Error) => {
      setConfirmInstall(false)
      toast.error(error.message)
    },
  })

  if (updates.isPending) {
    return <Skeleton className='h-56 w-full' />
  }
  if (!status) {
    return null
  }

  const installState = status.installation?.state || 'idle'
  const canInstall =
    status.install_enabled &&
    status.update_available &&
    status.latest_tag !== '' &&
    status.release_url !== '' &&
    !status.checking &&
    !BUSY_STATES.has(installState) &&
    installState !== 'unavailable'
  const target = status.latest_version ?? status.latest_tag

  return (
    <TitledCard
      icon={<Upload />}
      title={t('Updates')}
      description={t(
        'The gateway updates itself from its release page. Installing restarts it; accounts and usage data are kept.'
      )}
      action={
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={check.isPending || status.checking}
            onClick={() => check.mutate()}
          >
            <RefreshCw className='mr-1 size-4' />
            {t('Check now')}
          </Button>
          <Button
            type='button'
            size='sm'
            disabled={!canInstall || install.isPending}
            onClick={() => setConfirmInstall(true)}
          >
            {t('Install update')}
          </Button>
        </div>
      }
    >
      <div className='space-y-4'>
        <UpdatesStatus status={status} />
        <UpdatesRollback currentVersion={status.current_version} />
      </div>

      <ConfirmDialog
        open={confirmInstall}
        onOpenChange={setConfirmInstall}
        title={t('Install version {{version}}?', { version: target })}
        desc={t(
          'The gateway downloads {{version}}, replaces its program files and restarts. Requests in flight are interrupted; accounts and usage data are kept.',
          { version: target }
        )}
        destructive
        confirmText={t('Install {{version}}', { version: target })}
        isLoading={install.isPending}
        handleConfirm={() => install.mutate()}
      />
    </TitledCard>
  )
}
