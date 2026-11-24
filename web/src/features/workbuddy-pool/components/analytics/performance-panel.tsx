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
import { Gauge } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { TitledCard } from '@/components/ui/titled-card'
import { toIntlLocale } from '@/i18n/languages'
import { formatTimestampToDate } from '@/lib/format'

import { formatCount, formatRate, percentile, sampleCount } from './lib'
import { PerfModelTable } from './perf-model-table'
import { analyticsKeys, readHub, type AnalyticsWindowParams } from './queries'
import { AnalyticsQueryState } from './query-state'
import {
  ALL_MODELS,
  type HubPerf,
  type PerfBlock,
  type PerfModelRow,
} from './types'

type AnalyticsPerformancePanelProps = {
  model: string
  params: AnalyticsWindowParams
}

/**
 * Latency, speed and cache behaviour of the window, measured on the hub's
 * sample of the newest requests. A model filter switches the tiles to that
 * model's block and narrows the table to the same row.
 */
export function AnalyticsPerformancePanel(
  props: AnalyticsPerformancePanelProps
): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const query = useQuery({
    queryKey: analyticsKeys.perf(props.params),
    queryFn: () => readHub<HubPerf>('usage.perf', props.params),
  })
  const perf = query.data
  const scoped =
    props.model === ALL_MODELS ? undefined : perf?.by_model[props.model]
  const block: PerfBlock | undefined = scoped ?? perf
  const rows: PerfModelRow[] = Object.entries(perf?.by_model ?? {})
    .filter(([model]) => props.model === ALL_MODELS || model === props.model)
    .map(([model, entry]) => ({ model, block: entry }))
    .sort((left, right) => right.block.requests - left.block.requests)

  const tiles = [
    {
      key: 'requests',
      label: t('Sampled requests'),
      value: formatCount(block?.requests, locale),
    },
    {
      key: 'success',
      label: t('Success rate'),
      value: formatRate(block?.success_rate_pct, locale),
      note: t('{{errors}} errors', {
        errors: formatCount(block?.errors, locale),
      }),
    },
    {
      key: 'aborted',
      label: t('Client aborted'),
      value: formatCount(block?.client_aborted, locale),
    },
    {
      key: 'ttft',
      label: t('TTFT p50 (ms)'),
      value: formatCount(percentile(block?.ttft_ms, 'p50'), locale),
      note: t('p90 {{p90}} · p99 {{p99}}', {
        p90: formatCount(percentile(block?.ttft_ms, 'p90'), locale),
        p99: formatCount(percentile(block?.ttft_ms, 'p99'), locale),
      }),
    },
    {
      key: 'generation',
      label: t('Generation p50 (ms)'),
      value: formatCount(percentile(block?.generation_ms, 'p50'), locale),
      note: t('p90 {{p90}} · p99 {{p99}}', {
        p90: formatCount(percentile(block?.generation_ms, 'p90'), locale),
        p99: formatCount(percentile(block?.generation_ms, 'p99'), locale),
      }),
    },
    {
      key: 'wall',
      label: t('Wall p50 (ms)'),
      value: formatCount(percentile(block?.wall_ms, 'p50'), locale),
      note: t('p90 {{p90}} · p99 {{p99}}', {
        p90: formatCount(percentile(block?.wall_ms, 'p90'), locale),
        p99: formatCount(percentile(block?.wall_ms, 'p99'), locale),
      }),
    },
    {
      key: 'speed',
      label: t('Tokens per second p50'),
      value: formatCount(percentile(block?.tokens_per_sec, 'p50'), locale),
      note: t('p90 {{p90}} · p99 {{p99}}', {
        p90: formatCount(percentile(block?.tokens_per_sec, 'p90'), locale),
        p99: formatCount(percentile(block?.tokens_per_sec, 'p99'), locale),
      }),
    },
    {
      key: 'cache',
      label: t('Cache hit p50 (%)'),
      value: formatCount(percentile(block?.cache_hit_pct, 'p50'), locale),
      note: t('p90 {{p90}} · p99 {{p99}}', {
        p90: formatCount(percentile(block?.cache_hit_pct, 'p90'), locale),
        p99: formatCount(percentile(block?.cache_hit_pct, 'p99'), locale),
      }),
    },
    {
      key: 'samples',
      label: t('Latency samples'),
      value: formatCount(sampleCount(block?.ttft_ms), locale),
    },
  ]

  return (
    <TitledCard
      title={t('Model performance')}
      icon={<Gauge />}
      iconTone='chart-2'
      description={t(
        'Latency, speed and cache behaviour measured on the gateway’s newest requests in the window.'
      )}
      action={
        perf?.sample_capped ? (
          <Badge variant='warning'>{t('Sample capped')}</Badge>
        ) : undefined
      }
    >
      <AnalyticsQueryState
        isPending={query.isPending}
        isError={query.isError}
        errorMessage={query.error?.message}
        onRetry={() => void query.refetch()}
      >
        <dl className='grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5'>
          {tiles.map((tile) => (
            <div key={tile.key} className='min-w-0'>
              <dt className='text-muted-foreground truncate text-xs'>
                {tile.label}
              </dt>
              <dd className='mt-1 text-lg font-semibold tabular-nums'>
                {tile.value}
              </dd>
              {tile.note != null && (
                <dd className='text-muted-foreground truncate text-xs tabular-nums'>
                  {tile.note}
                </dd>
              )}
            </div>
          ))}
        </dl>

        {perf?.sample_capped && (
          <p className='text-muted-foreground mt-4 text-xs'>
            {t(
              'The hub kept only the newest {{count}} requests, sampled from {{from}}; older traffic in the window is not included.',
              {
                count: formatCount(perf.sampled, locale),
                from: formatTimestampToDate(perf.sample_from),
              }
            )}
          </p>
        )}

        <div className='mt-4 border-t pt-4'>
          <PerfModelTable rows={rows} locale={locale} />
        </div>
      </AnalyticsQueryState>
    </TitledCard>
  )
}
