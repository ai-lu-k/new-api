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
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatTimestampToDate } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { commandCodePoolKeys, getPoolState } from '../api'
import {
  autoDisabledReasonLabel,
  findWindow,
  orderPoolKeys,
  planOf,
} from '../lib'
import type { CommandCodePoolKey } from '../types'
import { AddKeyDialog } from './accounts/add-key-dialog'
import { EditKeyDialog } from './accounts/edit-key-dialog'
import { useKeyActions } from './accounts/use-key-actions'

/**
 * The key pool itself: every upstream key the proxy holds, what it has left,
 * and the controls that change it. Credit readings come from the proxy's last
 * pass unless one is refreshed by hand, which is the expensive path.
 */
export function AccountsTab() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<CommandCodePoolKey | null>(null)
  const [deleting, setDeleting] = useState<CommandCodePoolKey | null>(null)
  const actions = useKeyActions()

  const query = useQuery({
    queryKey: commandCodePoolKeys.pool,
    queryFn: async () => requireServerSuccess(await getPoolState()),
    refetchInterval: 60_000,
  })
  const keys = orderPoolKeys(
    query.data?.data?.keys ?? [],
    query.data?.data?.poolOrder
  )

  const columns: StaticDataTableColumn<CommandCodePoolKey>[] = [
    {
      id: 'label',
      header: t('Label'),
      className: 'min-w-40',
      cell: (key) => (
        <span className='font-medium'>{key.label || t('Unnamed')}</span>
      ),
    },
    {
      id: 'keyPrefix',
      header: t('Key'),
      className: 'min-w-32',
      cell: (key) => (
        <span className='text-muted-foreground font-mono text-xs'>
          {key.keyPrefix}
        </span>
      ),
    },
    {
      id: 'plan',
      header: t('Plan'),
      cell: (key) => planOf(key) || '—',
    },
    {
      id: 'credits',
      header: t('Credits'),
      className: 'text-right',
      cell: (key) => {
        const remaining = key.credits?.creditsRemaining
        if (typeof remaining !== 'number') {
          return <span className='text-muted-foreground'>—</span>
        }
        return formatNumber(remaining, locale)
      },
    },
    {
      id: 'weekly',
      header: t('Weekly window'),
      className: 'text-right',
      cell: (key) => {
        const weekly = findWindow(key.credits, 'weekly')
        if (!weekly) return <span className='text-muted-foreground'>—</span>
        return t('{{used}} of {{cap}}', {
          used: formatNumber(weekly.used, locale),
          cap: formatNumber(weekly.cap, locale),
        })
      },
    },
    {
      id: 'weight',
      header: t('Weight / priority'),
      className: 'text-right',
      cell: (key) =>
        t('{{weight}} / {{priority}}', {
          weight: formatNumber(key.weight, locale),
          priority: formatNumber(key.priority, locale),
        }),
    },
    {
      id: 'status',
      header: t('Status'),
      className: 'min-w-44',
      cell: (key) => (
        <div className='flex flex-wrap items-center gap-1.5'>
          <Switch
            size='sm'
            checked={key.enabled}
            aria-label={t('Key enabled')}
            disabled={actions.toggle.isPending}
            onCheckedChange={(checked) =>
              actions.toggle.mutate({ key, enabled: checked })
            }
          />
          {Boolean(key.cooling) && (
            <Badge
              variant='outline'
              title={
                key.cooldownUntil
                  ? formatTimestampToDate(key.cooldownUntil, 'milliseconds')
                  : undefined
              }
            >
              {t('Cooling')}
            </Badge>
          )}
          {key.autoDisabled && (
            <Badge variant='destructive'>
              {t(autoDisabledReasonLabel(key.autoDisabled.reason))}
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: 'sessions',
      header: t('Sessions'),
      className: 'text-right',
      cell: (key) => (
        <span className='tabular-nums'>
          {formatNumber(key.activeSessions ?? 0, locale)}
          {(key.inflight ?? 0) > 0 && (
            <span className='text-muted-foreground text-xs'>
              {' '}
              +{formatNumber(key.inflight ?? 0, locale)}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'lastUsedAt',
      header: t('Last used'),
      cell: (key) =>
        key.lastUsedAt ? (
          <span className='text-xs tabular-nums'>
            {formatTimestampToDate(key.lastUsedAt, 'milliseconds')}
          </span>
        ) : (
          <span className='text-muted-foreground'>—</span>
        ),
    },
    {
      id: 'lastErrorAt',
      header: t('Last error'),
      cell: (key) =>
        key.lastErrorAt ? (
          <span className='text-xs tabular-nums'>
            {formatTimestampToDate(key.lastErrorAt, 'milliseconds')}
            {(key.errorCount ?? 0) > 0 && (
              <span className='text-muted-foreground'>
                {' '}
                ×{formatNumber(key.errorCount ?? 0, locale)}
              </span>
            )}
          </span>
        ) : (
          <span className='text-muted-foreground'>—</span>
        ),
    },
    {
      id: 'actions',
      header: <span className='sr-only'>{t('Actions')}</span>,
      className: 'w-auto text-right',
      cell: (key) => (
        <div className='flex justify-end gap-1'>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label={t('Refresh credits')}
            disabled={
              actions.refreshOne.isPending &&
              actions.refreshOne.variables?.id === key.id
            }
            onClick={() => actions.refreshOne.mutate(key)}
          >
            <RefreshCw />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label={t('Edit key')}
            onClick={() => setEditing(key)}
          >
            <Pencil />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label={t('Delete key')}
            className='text-destructive hover:text-destructive'
            onClick={() => setDeleting(key)}
          >
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-muted-foreground text-sm'>
          {t('{{count}} keys in the pool', { count: keys.length })}
        </p>
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={actions.refreshAll.isPending || keys.length === 0}
            onClick={() => actions.refreshAll.mutate()}
          >
            <RefreshCw className='mr-1 size-4' />
            {t('Refresh all credits')}
          </Button>
          <Button type='button' size='sm' onClick={() => setAdding(true)}>
            <Plus className='mr-1 size-4' />
            {t('Add key')}
          </Button>
        </div>
      </div>

      {query.isLoading && <LoadingState />}
      {query.isError && (
        <ErrorState
          title={t('Unable to read the key pool')}
          description={query.error?.message}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isSuccess && keys.length === 0 && (
        <EmptyState
          title={t('No keys in the pool yet')}
          description={t(
            'Add one with the Add key button; the proxy then balances traffic across everything enabled here.'
          )}
          action={
            <Button type='button' onClick={() => setAdding(true)}>
              <Plus className='mr-1 size-4' />
              {t('Add key')}
            </Button>
          }
        />
      )}
      {keys.length > 0 && (
        <StaticDataTable
          data={keys}
          columns={columns}
          getRowKey={(key) => key.id}
          getRowClassName={(key) => (key.enabled ? undefined : 'opacity-70')}
        />
      )}

      <AddKeyDialog open={adding} onOpenChange={setAdding} />
      <EditKeyDialog
        poolKey={editing}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('Delete this key?')}
        desc={t(
          'The proxy forgets {{label}}. Requests already routed to it are not affected.',
          { label: deleting?.label || deleting?.keyPrefix || '' }
        )}
        confirmText={t('Delete')}
        destructive
        handleConfirm={() => {
          if (!deleting) return
          actions.remove.mutate(deleting, {
            onSettled: () => setDeleting(null),
          })
        }}
        isLoading={actions.remove.isPending}
      />
    </div>
  )
}
