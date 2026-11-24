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
import { ChartColumn } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TitledCard } from '@/components/ui/titled-card'
import { toIntlLocale } from '@/i18n/languages'
import { useChartTheme } from '@/lib/use-chart-theme'
import { cn } from '@/lib/utils'

import type { WorkBuddyTimeseries } from '../../types'
import { formatCount } from './lib'
import { analyticsKeys, readHub, type AnalyticsWindowParams } from './queries'
import { AnalyticsQueryState } from './query-state'
import { CreditSeriesChart } from './series-credit-chart'
import { TokenSeriesChart } from './series-tokens-chart'
import { ALL_MODELS, type AnalyticsFilters } from './types'

type Measure = 'tokens' | 'credit'

const MEASURES: { id: Measure; label: string }[] = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'credit', label: 'Credit' },
]

type AnalyticsSeriesChartProps = {
  filters: AnalyticsFilters
  params: AnalyticsWindowParams
}

/**
 * Tokens and credit per bucket. The hub chooses the bucket width from the
 * window — a minute for short windows, an hour for long ones — so the copy
 * follows the payload rather than a fixed guess. The endpoint has no model
 * dimension, so a model filter cannot narrow this chart.
 */
export function AnalyticsSeriesChart(
  props: AnalyticsSeriesChartProps
): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const { resolvedTheme, themeReady } = useChartTheme()
  const [measure, setMeasure] = useState<Measure>('tokens')
  const query = useQuery({
    queryKey: analyticsKeys.series(props.params),
    queryFn: () =>
      readHub<WorkBuddyTimeseries>('usage.timeseries', props.params),
  })
  const payload = query.data
  const series = useMemo(() => payload?.series ?? [], [payload])
  const bucketSeconds = payload?.bucket_seconds ?? 3_600
  const totals = useMemo(() => {
    let tokens = 0
    let credit = 0
    for (const point of series) {
      tokens += point.total_tokens
      credit += point.credit
    }
    return { tokens, credit }
  }, [series])

  const textColor =
    resolvedTheme === 'dark'
      ? 'rgba(255, 255, 255, 0.68)'
      : 'rgba(15, 23, 42, 0.58)'
  const gridColor =
    resolvedTheme === 'dark'
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(15, 23, 42, 0.12)'
  const bucketNote =
    bucketSeconds < 3_600
      ? t('Each bucket covers one minute')
      : t('Each bucket covers one hour')

  return (
    <TitledCard
      title={t('Usage over time')}
      icon={<ChartColumn />}
      iconTone='chart-1'
      description={t(
        'Tokens or credit per bucket across the selected window. The bucket width comes from the hub.'
      )}
      action={
        <div
          role='group'
          aria-label={t('Measure')}
          className='bg-muted inline-flex rounded-lg p-1'
        >
          {MEASURES.map((entry) => (
            <button
              key={entry.id}
              type='button'
              aria-pressed={measure === entry.id}
              onClick={() => setMeasure(entry.id)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                measure === entry.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t(entry.label)}
            </button>
          ))}
        </div>
      }
    >
      <AnalyticsQueryState
        isPending={query.isPending}
        isError={query.isError}
        errorMessage={query.error?.message}
        onRetry={() => void query.refetch()}
      >
        {series.length === 0 && (
          <p className='text-muted-foreground py-12 text-center text-sm'>
            {t('No request in this window')}
          </p>
        )}
        {series.length > 0 && (
          <>
            <div className='h-64'>
              {themeReady &&
                (measure === 'tokens' ? (
                  <TokenSeriesChart
                    series={series}
                    locale={locale}
                    textColor={textColor}
                    gridColor={gridColor}
                    resolvedTheme={resolvedTheme}
                  />
                ) : (
                  <CreditSeriesChart
                    series={series}
                    locale={locale}
                    textColor={textColor}
                    gridColor={gridColor}
                    resolvedTheme={resolvedTheme}
                  />
                ))}
            </div>
            <div className='text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs tabular-nums'>
              <span>
                {t('Total tokens {{value}}', {
                  value: formatCount(totals.tokens, locale),
                })}
              </span>
              <span>
                {t('Total credit {{value}}', {
                  value: formatCount(totals.credit, locale),
                })}
              </span>
              <span>{bucketNote}</span>
            </div>
            {props.filters.model !== ALL_MODELS && (
              <p className='text-muted-foreground mt-2 text-xs'>
                {t(
                  'The hub does not break the time series down by model, so this chart covers every model in the window.'
                )}
              </p>
            )}
          </>
        )}
      </AnalyticsQueryState>
    </TitledCard>
  )
}
