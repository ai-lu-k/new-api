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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { StaticDataTable } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { requireServerSuccess } from '@/lib/server-error-message'

import { hubGet, hubPost } from '../../api'
import type { HubUpdateBackup, HubUpdateBackups } from './types'

/**
 * Rolling back to a version the hub kept on disk. It restores the program files
 * and restarts the gateway, so it is named and confirmed per version.
 */
export function UpdatesRollback(props: { currentVersion: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<HubUpdateBackup | null>(null)

  const backups = useQuery({
    queryKey: ['workbuddy', 'settings', 'backups'],
    queryFn: async () =>
      requireServerSuccess(await hubGet<HubUpdateBackups>('updates.backups')),
  })
  const payload = backups.data?.data
  const rows = payload?.backups ?? []

  const rollback = useMutation({
    mutationFn: async (version: string) => {
      const response = await hubPost<{ ok?: boolean; msg?: string }>(
        'updates.rollback',
        { version }
      )
      if (!response.success) {
        throw new Error(response.message || t('Unable to start the rollback.'))
      }
      if (response.data?.ok === false) {
        throw new Error(response.data.msg || t('Unable to start the rollback.'))
      }
      return version
    },
    onSuccess: async (version) => {
      setTarget(null)
      toast.success(t('Rolling back to {{version}}.', { version }))
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['workbuddy', 'settings', 'updates'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['workbuddy', 'settings', 'backups'],
        }),
      ])
    },
    onError: (error: Error) => {
      setTarget(null)
      toast.error(error.message)
    },
  })

  const enabled = payload?.rollback_enabled === true

  return (
    <div className='space-y-2 border-t pt-3'>
      <div className='flex items-center justify-between gap-2'>
        <p className='text-sm font-medium'>
          {t('Roll back to a kept version')}
        </p>
        {!enabled && (
          <Badge variant='warning'>{t('Rollback unavailable')}</Badge>
        )}
      </div>
      <StaticDataTable
        data={rows}
        getRowKey={(row) => row.version}
        empty={rows.length === 0}
        emptyContent={t('No local backups yet.')}
        columns={[
          {
            id: 'version',
            header: t('Version'),
            cell: (row) => <span className='font-mono'>{row.version}</span>,
          },
          {
            id: 'created',
            header: t('Backed up'),
            cell: (row) => (
              <span className='font-mono text-xs'>{row.created_at}</span>
            ),
          },
          {
            id: 'files',
            header: t('Files'),
            cell: (row) => <span>{row.files ?? 0}</span>,
          },
          {
            id: 'integrity',
            header: t('Integrity'),
            cell: (row) =>
              row.complete ? (
                <Badge variant='secondary'>{t('Complete')}</Badge>
              ) : (
                <Badge variant='warning'>{row.reason || t('Incomplete')}</Badge>
              ),
          },
          {
            id: 'action',
            header: t('Actions'),
            cell: (row) => {
              const isCurrent = row.version === props.currentVersion
              return (
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={!enabled || !row.complete || isCurrent}
                  onClick={() => setTarget(row)}
                >
                  {isCurrent ? t('Current version') : t('Roll back')}
                </Button>
              )
            },
          },
        ]}
      />

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null)
        }}
        title={t('Roll back to {{version}}?', {
          version: target?.version ?? '',
        })}
        desc={t(
          'The gateway restores the program files of {{version}} and restarts. Requests in flight are interrupted; accounts and usage data are kept.',
          { version: target?.version ?? '' }
        )}
        destructive
        confirmText={t('Roll back to {{version}}', {
          version: target?.version ?? '',
        })}
        isLoading={rollback.isPending}
        handleConfirm={() => {
          if (target) rollback.mutate(target.version)
        }}
      />
    </div>
  )
}
