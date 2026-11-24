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
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { DatePicker } from '@/components/date-picker'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import dayjs from '@/lib/dayjs'
import { formatNumber } from '@/lib/format'

import {
  getPlanStatistics,
  type PlanUsageDay,
  type PlanUsageTrend,
} from './api'
import type { PlanTrendUser } from './users'

type DatedUsageDay = PlanUsageDay & { free_used: number }

const UsageChart = lazy(() =>
  import('./usage-chart').then((module) => ({ default: module.PlanUsageChart }))
)

export function PlanUsageTrendPanel(props: {
  identity: string
  user: PlanTrendUser | null
  onClearUser: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  // Calendar selection is date-only. The server interprets these ISO dates
  // in Shanghai even when the administrator's browser uses another timezone.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const [initial] = useState(() => ({
    start_date: dayjs(today).subtract(29, 'day').format('YYYY-MM-DD'),
    end_date: today,
  }))
  const [start, setStart] = useState<Date | undefined>(() =>
    dayjs(initial.start_date).toDate()
  )
  const [end, setEnd] = useState<Date | undefined>(() =>
    dayjs(initial.end_date).toDate()
  )
  const [range, setRange] = useState(initial)
  const startText = start ? dayjs(start).format('YYYY-MM-DD') : ''
  const endText = end ? dayjs(end).format('YYYY-MM-DD') : ''
  const valid = Boolean(
    start &&
    end &&
    startText <= endText &&
    dayjs(endText).diff(dayjs(startText), 'day') <= 92
  )
  const query = useQuery({
    queryKey: [
      'token-plan-statistics',
      props.identity,
      'trend',
      range,
      props.user?.id ?? 0,
    ],
    queryFn: ({ signal }) =>
      getPlanStatistics<PlanUsageTrend>(
        'trend',
        { ...range, user_id: props.user?.id ?? 0 },
        signal
      ),
  })
  const quota = (amount: number | null) =>
    amount === null
      ? t('No dated settlements')
      : formatQuotaWithCurrency(amount, { locale })
  // Days inside the range without a settlement carry no figures. Listing them
  // row by row repeated the "no dated settlements" note once per empty day and
  // pushed the dated days below the fold, so only dated days are ranked here;
  // the charts and the undated note above already say what is missing.
  const datedDays =
    query.data?.days.filter(
      (day): day is DatedUsageDay => day.free_used !== null
    ) ?? []
  return (
    <section aria-label={t('Daily usage')} className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <h2 className='text-lg font-semibold'>
          {t('Daily usage')} ·{' '}
          {props.user ? `#${props.user.id} ${props.user.name}` : t('All users')}
        </h2>
        {props.user && (
          <Button variant='outline' onClick={props.onClearUser}>
            {t('All users')}
          </Button>
        )}
      </div>
      <div className='flex flex-wrap items-end gap-3'>
        <div role='group' aria-label={t('Start date')} className='space-y-1'>
          <p className='text-sm'>{t('Start date')}</p>
          <DatePicker
            selected={start}
            onSelect={setStart}
            ariaLabel={t('Start date')}
            maxDate={dayjs(today).toDate()}
          />
        </div>
        <div role='group' aria-label={t('End date')} className='space-y-1'>
          <p className='text-sm'>{t('End date')}</p>
          <DatePicker
            selected={end}
            onSelect={setEnd}
            ariaLabel={t('End date')}
            maxDate={dayjs(today).toDate()}
          />
        </div>
        <Button
          disabled={!valid || query.isFetching}
          onClick={() => setRange({ start_date: startText, end_date: endText })}
        >
          {t('Apply')}
        </Button>
        <span className='text-muted-foreground text-xs'>
          {t('Up to 93 days')} · Asia/Shanghai
        </span>
      </div>
      {!valid && (
        <p role='alert' className='text-destructive text-sm'>
          {t('Select a valid range of up to 93 days.')}
        </p>
      )}
      <p className='text-muted-foreground text-sm'>
        {t(
          'Daily totals include dated settled reservations only. Earlier usage without settlement dates is unavailable. Later refunds update the original settlement day; pending reservations are excluded.'
        )}
      </p>
      {query.isPending && <LoadingState />}
      {query.isError && <ErrorState onRetry={() => void query.refetch()} />}
      {query.data && !query.isError && (
        <>
          <div
            className='bg-muted/40 flex flex-wrap gap-6 rounded-lg border p-4 text-sm'
            aria-label={t('Selected period totals')}
            role='region'
          >
            <span>
              {t('Free plan usage')}:{' '}
              <strong>
                {query.data.total.requests > 0
                  ? quota(query.data.total.free_used)
                  : '—'}
              </strong>
            </span>
            <span>
              {t('Balance continuation')}:{' '}
              <strong>
                {query.data.total.requests > 0
                  ? quota(query.data.total.wallet_used)
                  : '—'}
              </strong>
            </span>
            <span>
              {t('Settled requests')}:{' '}
              <strong>{formatNumber(query.data.total.requests, locale)}</strong>
            </span>
          </div>
          {query.data.undated.requests > 0 && (
            <p role='note' className='text-muted-foreground text-sm'>
              {t(
                'Undated historical settlements (all time): {{count}} requests · free {{free}} · balance {{wallet}}. These are excluded from daily totals.',
                {
                  count: formatNumber(query.data.undated.requests, locale),
                  free: quota(query.data.undated.free_used),
                  wallet: quota(query.data.undated.wallet_used),
                }
              )}
            </p>
          )}
          {query.data.days.some((day) => day.free_used !== null) ? (
            <Suspense fallback={<LoadingState />}>
              <UsageChart days={query.data.days} />
            </Suspense>
          ) : (
            <EmptyState title={t('No dated settlements')} />
          )}
          {datedDays.length > 0 && (
            <StaticDataTable
              data={datedDays}
              getRowKey={(row) => row.date}
              tableProps={{ 'aria-label': t('Daily usage details') }}
              columns={[
                { id: 'date', header: t('Date'), cell: (row) => row.date },
                {
                  id: 'free',
                  header: t('Free plan usage'),
                  cell: (row) => quota(row.free_used),
                },
                {
                  id: 'wallet',
                  header: t('Balance continuation'),
                  cell: (row) => quota(row.wallet_used),
                },
                {
                  id: 'requests',
                  header: t('Settled requests'),
                  cell: (row) => formatNumber(row.requests, locale),
                },
              ]}
            />
          )}
        </>
      )}
    </section>
  )
}
