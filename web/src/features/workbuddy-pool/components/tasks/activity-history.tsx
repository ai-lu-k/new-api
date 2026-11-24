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

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { requireServerSuccess } from '@/lib/server-error-message'

import { hubGet } from '../../api'
import type { WorkBuddyActivityHistory } from './types'

/** Ranges the hub validates; anything else is rejected with a 400. */
const RANGES = [
  { value: 'today', labelKey: 'Today' },
  { value: '1d', labelKey: 'Last day' },
  { value: '7d', labelKey: 'Last 7 days' },
  { value: '30d', labelKey: 'Last 30 days' },
  { value: '90d', labelKey: 'Last 90 days' },
  { value: 'all', labelKey: 'All time' },
]

const TASK_LABEL: Record<string, string> = {
  checkin: 'Check-in',
  daily_chat: 'Daily chat',
}

const TRIGGER_LABEL: Record<string, string> = {
  scheduler: 'Scheduled',
  manual: 'Manual',
  account_add: 'Account added',
  account_import: 'Account imported',
  unknown: 'Unknown',
}

const REALM_LABEL: Record<string, string> = {
  cn: 'Domestic',
  intl: 'International',
}

/**
 * The hub writes the wall-clock time with its own offset, so the panel shows it
 * as written. Converting it would move the operator's local time a second time.
 */
function activityTime(ts: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(ts)
  if (!match) return ts || '—'
  return `${match[2]}-${match[3]} ${match[4]}:${match[5]}`
}

/**
 * Every recorded check-in and daily chat the hub attempted, so the operator can
 * see whether the scheduler is actually running and on whom it failed.
 */
export function ActivityHistory(): React.JSX.Element {
  const { t } = useTranslation()
  const [range, setRange] = useState('7d')
  const query = useQuery({
    queryKey: ['workbuddy', 'activity-history', range],
    queryFn: async (): Promise<WorkBuddyActivityHistory> => {
      const response = requireServerSuccess(
        await hubGet<WorkBuddyActivityHistory>('activity.history', {
          range,
          limit: 100,
        })
      )
      return response.data ?? { rows: [], total: 0, limit: 100, range }
    },
    refetchInterval: 60_000,
  })

  const rows = query.data?.rows ?? []
  const total = query.data?.total ?? 0

  return (
    <section
      aria-label={t('Activity history')}
      className='bg-card overflow-hidden rounded-xl border'
    >
      <header className='flex flex-wrap items-start justify-between gap-3 px-5 py-4'>
        <div>
          <h2 className='text-base font-semibold'>{t('Activity history')}</h2>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t(
              'Every check-in and daily chat the hub attempted, newest first. This is the record that shows whether the scheduler is really running.'
            )}
          </p>
        </div>
        <Select
          items={RANGES.map((item) => ({
            value: item.value,
            label: t(item.labelKey),
          }))}
          value={range}
          onValueChange={(value) => setRange(String(value ?? '7d'))}
        >
          <SelectTrigger aria-label={t('Time range')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {RANGES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {t(item.labelKey)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </header>

      {query.isLoading && <LoadingState className='border-t py-6' />}
      {query.isError && (
        <div className='border-t'>
          <ErrorState
            compact
            title={t('Could not read the activity history')}
            onRetry={() => query.refetch()}
          />
        </div>
      )}
      {query.isSuccess && rows.length === 0 && (
        <div className='border-t'>
          <EmptyState
            title={t('No activity in this range')}
            description={t('Widen the range to see older records.')}
          />
        </div>
      )}
      {query.isSuccess && rows.length > 0 && (
        <>
          <div className='overflow-x-auto border-t'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Time')}</TableHead>
                  <TableHead>{t('Account')}</TableHead>
                  <TableHead>{t('Realm')}</TableHead>
                  <TableHead>{t('Task')}</TableHead>
                  <TableHead>{t('Trigger')}</TableHead>
                  <TableHead>{t('Result')}</TableHead>
                  <TableHead>{t('Message')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.ts}-${row.uid}-${row.task}`}>
                    <TableCell className='font-mono text-xs whitespace-nowrap'>
                      {activityTime(row.ts)}
                    </TableCell>
                    <TableCell className='whitespace-normal'>
                      <span title={row.uid}>
                        {row.nickname || row.uid.slice(0, 8)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant='outline'>
                        {REALM_LABEL[row.realm]
                          ? t(REALM_LABEL[row.realm])
                          : row.realm}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {TASK_LABEL[row.task]
                        ? t(TASK_LABEL[row.task])
                        : row.task}
                    </TableCell>
                    <TableCell>
                      {TRIGGER_LABEL[row.trigger]
                        ? t(TRIGGER_LABEL[row.trigger])
                        : row.trigger}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.ok ? 'secondary' : 'destructive'}>
                        {row.ok ? t('Succeeded') : t('Failed')}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-muted-foreground max-w-96 text-xs whitespace-normal'>
                      {row.message || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {rows.length < total && (
            <p className='text-muted-foreground border-t px-5 py-2 text-xs'>
              {t('Showing the latest {{shown}} of {{total}} records', {
                shown: rows.length,
                total,
              })}
            </p>
          )}
        </>
      )}
    </section>
  )
}
