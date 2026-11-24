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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { requireServerSuccess } from '@/lib/server-error-message'

import { hubGet } from '../../api'
import type { WorkBuddyScheduler } from './types'
import { useSchedulerToggle, useSchedulerTrigger } from './use-task-mutations'

function InfoRow(props: { label: string; value: string }): React.JSX.Element {
  return (
    <div className='flex flex-wrap gap-x-3 px-5 py-2 text-sm'>
      <dt className='text-muted-foreground w-44 shrink-0 text-xs'>
        {props.label}
      </dt>
      <dd className='min-w-0 break-words'>{props.value}</dd>
    </div>
  )
}

/**
 * The hub's background scheduler: what it is set to run, when it last ran and
 * when it runs next, plus the two controls. Triggering is not a preview — it
 * patrols the live accounts — so it goes through a confirm dialog.
 */
export function SchedulerPanel(): React.JSX.Element {
  const { t } = useTranslation()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const toggle = useSchedulerToggle()
  const trigger = useSchedulerTrigger()
  const query = useQuery({
    queryKey: ['workbuddy', 'scheduler'],
    queryFn: async (): Promise<WorkBuddyScheduler> => {
      const response = requireServerSuccess(
        await hubGet<WorkBuddyScheduler>('scheduler')
      )
      return response.data ?? { enabled: false }
    },
    refetchInterval: 60_000,
  })

  const scheduler = query.data
  const daily = scheduler?.daily_chat
  const logTail = (scheduler?.logs ?? []).slice(-8)

  const confirmTrigger = (): void => {
    trigger.mutate()
    setConfirmOpen(false)
  }

  return (
    <section
      aria-label={t('Scheduler')}
      className='bg-card overflow-hidden rounded-xl border'
    >
      <header className='flex flex-wrap items-start justify-between gap-3 px-5 py-4'>
        <div>
          <h2 className='text-base font-semibold'>{t('Scheduler')}</h2>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t(
              'The hub keeps check-in, daily activity and token keepalive running on its own schedule. Pause it here, or run one patrol now.'
            )}
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-3'>
          {scheduler && (
            <Badge variant={scheduler.enabled ? 'default' : 'outline'}>
              {scheduler.enabled ? t('Running') : t('Paused')}
            </Badge>
          )}
          <Switch
            checked={scheduler?.enabled === true}
            onCheckedChange={() => toggle.mutate()}
            disabled={!scheduler || toggle.isPending}
            aria-label={t('Enable the scheduler')}
          />
          <Button
            size='sm'
            variant='outline'
            onClick={() => setConfirmOpen(true)}
            disabled={trigger.isPending}
          >
            {trigger.isPending ? t('Patrolling…') : t('Run a patrol now')}
          </Button>
        </div>
      </header>

      {query.isLoading && <LoadingState className='border-t py-6' />}
      {query.isError && (
        <div className='border-t'>
          <ErrorState
            compact
            title={t('Could not read the scheduler')}
            onRetry={() => query.refetch()}
          />
        </div>
      )}
      {scheduler && (
        <dl className='border-t'>
          <InfoRow
            label={t('Domestic mode')}
            value={scheduler.mode_cn || scheduler.mode || '—'}
          />
          <InfoRow
            label={t('International mode')}
            value={scheduler.mode_intl || '—'}
          />
          <InfoRow
            label={t('Last run')}
            value={scheduler.last_run_time || '—'}
          />
          <InfoRow
            label={t('Next run')}
            value={scheduler.next_run_time || '—'}
          />
          {daily?.times && daily.times.length > 0 && (
            <InfoRow
              label={t('Daily chat slots')}
              value={`${daily.times.join(' / ')} · ${t('Next slot {{slot}}', {
                slot: daily.next_slot || '—',
              })} · ${t('{{done}} of {{total}} done', {
                done: daily.done_slots?.length ?? 0,
                total: daily.times.length,
              })}`}
            />
          )}
        </dl>
      )}

      {logTail.length > 0 && (
        <div className='border-t px-5 py-4'>
          <h3 className='text-sm font-medium'>{t('Recent scheduler log')}</h3>
          <pre className='bg-muted/40 mt-2 max-h-48 overflow-auto rounded-md border p-3 font-mono text-xs whitespace-pre-wrap'>
            {logTail.join('\n')}
          </pre>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('Run a patrol now')}
        desc={t(
          'Runs one scheduler patrol immediately: token keepalive, check-in, daily activity report, cat travel and the daily chat for every eligible account. It writes to the live accounts right away and cannot be undone.'
        )}
        confirmText={t('Run now')}
        isLoading={trigger.isPending}
        handleConfirm={confirmTrigger}
      />
    </section>
  )
}
