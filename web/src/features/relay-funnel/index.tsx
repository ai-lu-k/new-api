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
import { RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CompactDateTimeRangePicker } from '@/features/usage-logs/components/compact-date-time-range-picker'
import { useDebounce } from '@/hooks/use-debounce'
import { getServerErrorMessage } from '@/lib/server-error-message'

import { getFunnelReport } from './api'
import { ChainFunnel } from './components/chain-funnel'
import { ChannelMetricsTable } from './components/channel-table'
import { MetricTiles } from './components/metric-tiles'

/** The report endpoint refuses ranges wider than seven days. */
const MAX_RANGE_MS = 7 * 24 * 3600 * 1000

function defaultRange(): { start: Date; end: Date } {
  const end = new Date()
  return { start: new Date(end.getTime() - 24 * 3600 * 1000), end }
}

function clampRange(range: { start: Date; end: Date }) {
  const span = range.end.getTime() - range.start.getTime()
  if (span <= MAX_RANGE_MS) return range
  return {
    start: new Date(range.end.getTime() - MAX_RANGE_MS),
    end: range.end,
  }
}

export function RelayFunnel(props: {
  initialStart?: number
  initialEnd?: number
  initialModel?: string
}) {
  const { t } = useTranslation()
  const [range, setRange] = useState(() => {
    if (!props.initialStart && !props.initialEnd) return defaultRange()
    const fallback = defaultRange()
    return clampRange({
      start: new Date(props.initialStart ?? fallback.start.getTime()),
      end: new Date(props.initialEnd ?? fallback.end.getTime()),
    })
  })
  const [model, setModel] = useState(props.initialModel ?? '')
  const debouncedModel = useDebounce(model.trim(), 400)

  const query = useQuery({
    queryKey: [
      'relay-funnel',
      Math.floor(range.start.getTime() / 1000),
      Math.floor(range.end.getTime() / 1000),
      debouncedModel,
    ],
    queryFn: () =>
      getFunnelReport({
        start: Math.floor(range.start.getTime() / 1000),
        end: Math.floor(range.end.getTime() / 1000) + 1,
        model: debouncedModel === '' ? undefined : debouncedModel,
      }),
    staleTime: 15000,
    retry: false,
    meta: { errorToast: false },
  })

  const totals = query.data?.summary.totals
  const channels = useMemo(
    () => query.data?.summary.by_channel ?? [],
    [query.data]
  )
  const incomplete =
    (query.data?.scan_truncated ?? false) ||
    (totals?.truncated_requests ?? 0) > 0

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <span className='inline-flex min-w-0 items-center gap-2'>
          <span className='truncate'>{t('Request funnel')}</span>
          <Badge variant='outline' className='shrink-0'>
            Root
          </Badge>
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t(
          'Common HTTP relay only. Each request counts once; every upstream attempt carries its own latency, cache and procurement cost. Probes are excluded.'
        )}
      </SectionPageLayout.Description>
      <SectionPageLayout.Actions>
        <CompactDateTimeRangePicker
          start={range.start}
          end={range.end}
          onChange={(next) =>
            setRange(
              clampRange({
                start: next.start ?? range.start,
                end: next.end ?? range.end,
              })
            )
          }
        />
        <Input
          className='w-48'
          placeholder={t('Model')}
          value={model}
          onChange={(event) => setModel(event.target.value)}
        />
        <Button
          variant='outline'
          size='icon'
          onClick={() => void query.refetch()}
          aria-label={t('Refresh')}
        >
          <RefreshCw aria-hidden='true' />
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        {query.isPending && <LoadingState />}
        {query.isError && (
          <ErrorState
            compact
            description={getServerErrorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        )}
        {query.data && totals && (
          <div className='space-y-6'>
            {incomplete && (
              <p role='status' className='text-amber-600'>
                {t(
                  'Observation data is incomplete: the scan limit was reached.'
                )}
              </p>
            )}
            <section className='space-y-2'>
              <h2 className='text-sm font-medium'>
                {t('Model routing chains')}
              </h2>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'One row per channel, in the order the router tries them: the highest priority tier first, the heavier channel within it. Reached counts the requests that considered it, and stopped here counts the ones that ended on it.'
                )}
              </p>
              {(query.data.summary.chains ?? []).length > 0 ? (
                <ChainFunnel
                  chains={query.data.summary.chains ?? []}
                  channelNames={query.data.channel_names ?? {}}
                />
              ) : (
                <EmptyState
                  title={t('No attempts recorded')}
                  className='min-h-0 p-6'
                />
              )}
            </section>
            <MetricTiles totals={totals} />
            <section className='space-y-2'>
              <h2 className='text-sm font-medium'>
                {t('Channel performance')}
              </h2>
              <ChannelMetricsTable
                channels={channels}
                channelNames={query.data.channel_names ?? {}}
              />
            </section>
          </div>
        )}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
