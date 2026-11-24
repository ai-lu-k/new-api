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
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { formatOriginalCurrencyAmount } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { ObservationAverage, RequestMetrics } from '../types'

type Tile = { label: string; value: string; hint?: string }

function formatPercent(
  value: number | null,
  locale: string | undefined
): string {
  if (value == null) return '—'
  return `${formatNumber(value * 100, locale)}%`
}

function formatMilliseconds(
  average: ObservationAverage,
  locale: string | undefined
) {
  if (average.value == null) return '—'
  return `${formatNumber(average.value, locale)} ms`
}

export function MetricTiles(props: { totals: RequestMetrics }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const totals = props.totals
  const upstream = totals.upstream
  const tiles: Tile[] = [
    {
      label: t('Failover recoveries'),
      value: formatNumber(totals.failover_saved, locale),
      hint: `${t('Failover attempts')}: ${formatNumber(totals.failover_requests, locale)}`,
    },
    {
      label: t('Capacity skips'),
      value: formatNumber(totals.capacity_skipped, locale),
      hint: `${t('Candidate checks')}: ${formatNumber(totals.candidate_checks, locale)}`,
    },
    {
      label: t('First answer'),
      value: formatMilliseconds(totals.first_content_ms, locale),
      hint: `${t('Samples')}: ${formatNumber(totals.first_content_ms.samples, locale)}`,
    },
    {
      label: t('First reasoning'),
      value: formatMilliseconds(totals.first_reasoning_ms, locale),
    },
    {
      label: t('Output TPS'),
      value:
        upstream.output_tps == null
          ? '—'
          : formatNumber(upstream.output_tps, locale),
      hint: `${t('Samples')}: ${formatNumber(upstream.tps_observed_attempts, locale)}`,
    },
    {
      label: t('Cache hit rate'),
      value: formatPercent(upstream.cache_request_hit_rate, locale),
      hint: `${t('Samples')}: ${formatNumber(upstream.cache_observed_attempts, locale)}`,
    },
    {
      label: t('Cache token hit rate'),
      value: formatPercent(upstream.cache_token_hit_rate, locale),
      hint: `${t('Samples')}: ${formatNumber(upstream.cache_paired_attempts, locale)}`,
    },
    {
      label: t('Unknown cost attempts'),
      value: formatNumber(upstream.unknown_cost_attempts, locale),
      hint: `${t('Attempts')}: ${formatNumber(upstream.attempts, locale)}`,
    },
  ]

  return (
    <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
      {tiles.map((tile) => (
        <div key={tile.label} className='bg-card rounded-lg border px-4 py-3'>
          <p className='text-muted-foreground text-xs'>{tile.label}</p>
          <p className='mt-1 text-xl font-semibold tabular-nums'>
            {tile.value}
          </p>
          {tile.hint && (
            <p className='text-muted-foreground mt-1 text-xs'>{tile.hint}</p>
          )}
        </div>
      ))}
      {(upstream.costs ?? []).map((cost) => (
        <div
          key={cost.currency}
          className={cn('bg-card rounded-lg border px-4 py-3')}
        >
          <p className='text-muted-foreground text-xs'>
            {t('Procurement cost')} · {cost.currency}
          </p>
          <p className='mt-1 text-sm tabular-nums'>
            {t('Reported')}:{' '}
            {formatOriginalCurrencyAmount(cost.reported, cost.currency)}
          </p>
          <p className='text-muted-foreground mt-1 text-xs tabular-nums'>
            {t('Estimated')}:{' '}
            {formatOriginalCurrencyAmount(cost.estimated, cost.currency)}
          </p>
        </div>
      ))}
    </div>
  )
}
