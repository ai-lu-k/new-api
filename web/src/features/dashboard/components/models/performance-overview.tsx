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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPanel } from '@/components/section-panel'
import { StatRow, type StatRowItem } from '@/components/stat-row'
import { getPerfMetricsSummary } from '@/features/performance-metrics/api'
import {
  formatLatency,
  formatThroughput,
  formatUptimePct,
  getSuccessRateDotClass,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import type { PerfModelSummary } from '@/features/performance-metrics/types'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

const PERFORMANCE_WINDOW_HOURS = 24
const TOP_MODEL_LIMIT = 6

export function PerformanceOverview() {
  const { t } = useTranslation()
  const metricsQuery = useQuery({
    queryKey: ['perf-metrics-summary', PERFORMANCE_WINDOW_HOURS],
    queryFn: async () =>
      requireServerSuccess(
        await getPerfMetricsSummary(PERFORMANCE_WINDOW_HOURS)
      ),
    staleTime: 60 * 1000,
    retry: false,
  })

  const models = useMemo(
    () => metricsQuery.data?.data.models ?? [],
    [metricsQuery.data]
  )
  const summary = metricsQuery.data?.data.summary
  const topModels = useMemo(() => models.slice(0, TOP_MODEL_LIMIT), [models])
  const loading = metricsQuery.isLoading
  const hasData = models.length > 0
  const successRate = summary?.success_rate ?? Number.NaN

  const items: StatRowItem[] = [
    {
      key: 'success-rate',
      label: t('Success rate'),
      value: (
        <span className={getSuccessRateTextClass(successRate)}>
          {formatUptimePct(successRate)}
        </span>
      ),
      valueText: formatUptimePct(successRate),
    },
    {
      key: 'latency',
      label: t('Average latency'),
      value: formatLatency(summary?.avg_latency_ms ?? 0),
      valueText: formatLatency(summary?.avg_latency_ms ?? 0),
    },
    {
      key: 'throughput',
      label: t('Throughput'),
      value: formatThroughput(summary?.avg_tps ?? 0),
      valueText: formatThroughput(summary?.avg_tps ?? 0),
    },
  ]

  let status: 'ready' | 'loading' | 'empty' = 'ready'
  if (loading) status = 'loading'
  else if (!hasData) status = 'empty'

  return (
    <SectionPanel
      title={t('Performance health')}
      status={status}
      emptyMessage={t('No performance data available')}
      placeholderClassName='h-12'
      contentClassName='space-y-3'
    >
      <StatRow columns={3} size='page' items={items} />
      <div className='flex flex-wrap items-center gap-1.5'>
        {topModels.map((model) => (
          <ModelBadge key={model.model_name} model={model} />
        ))}
      </div>
    </SectionPanel>
  )
}

function ModelBadge(props: { model: PerfModelSummary }) {
  const model = props.model

  return (
    <span className='border-border inline-flex items-center gap-1.5 border px-2 py-0.5'>
      <span className='max-w-[10rem] truncate font-mono text-[11px]'>
        {model.model_name}
      </span>
      <span
        className={cn(
          'size-1.5 rounded-full',
          getSuccessRateDotClass(model.success_rate)
        )}
        aria-hidden='true'
      />
      <span
        className={cn(
          'font-mono text-[11px] font-semibold tabular-nums',
          getSuccessRateTextClass(model.success_rate)
        )}
      >
        {formatUptimePct(model.success_rate)}
      </span>
    </span>
  )
}
