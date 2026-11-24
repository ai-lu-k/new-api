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

import { StaticDataTable } from '@/components/data-table'
import { toIntlLocale } from '@/i18n/languages'
import { formatOriginalCurrencyAmount } from '@/lib/currency'
import { formatNumber } from '@/lib/format'

import type { ChannelMetrics, ObservationCostTotal } from '../types'

function formatCosts(costs: ObservationCostTotal[] | null): string {
  if (!costs || costs.length === 0) return '—'
  return costs
    .map((cost) => formatOriginalCurrencyAmount(cost.reported, cost.currency))
    .join(' · ')
}

export function ChannelMetricsTable(props: {
  channels: ChannelMetrics[]
  channelNames?: Record<string, string>
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  return (
    <StaticDataTable
      data={props.channels}
      getRowKey={(channel) => `${channel.channel_id}:${channel.upstream_model}`}
      columns={[
        {
          id: 'channel',
          header: t('Channel'),
          cell: (channel) => (
            <span className='inline-flex items-center gap-2'>
              <span className='font-medium'>
                #{formatNumber(channel.channel_id, locale)}
              </span>
              <span className='text-xs'>
                {props.channelNames?.[String(channel.channel_id)] ??
                  channel.upstream_model}
              </span>
              <span className='text-muted-foreground text-xs'>
                {channel.upstream_model}
              </span>
            </span>
          ),
        },
        {
          id: 'attempts',
          header: t('Attempts'),
          cell: (channel) => formatNumber(channel.metrics.attempts, locale),
        },
        {
          id: 'success-rate',
          header: t('Success rate'),
          cell: (channel) => {
            const metrics = channel.metrics
            if (metrics.attempts === 0) return '—'
            return `${formatNumber((metrics.successful / metrics.attempts) * 100, locale)}%`
          },
        },
        {
          id: 'first-answer',
          header: t('First answer'),
          cell: (channel) =>
            channel.metrics.first_content_ms.value == null
              ? '—'
              : `${formatNumber(channel.metrics.first_content_ms.value, locale)} ms`,
        },
        {
          id: 'tps',
          header: t('Output TPS'),
          cell: (channel) =>
            channel.metrics.output_tps == null
              ? '—'
              : formatNumber(channel.metrics.output_tps, locale),
        },
        {
          id: 'cache',
          header: t('Cache hit rate'),
          cell: (channel) =>
            channel.metrics.cache_request_hit_rate == null
              ? '—'
              : `${formatNumber(channel.metrics.cache_request_hit_rate * 100, locale)}%`,
        },
        {
          id: 'cost',
          header: t('Procurement cost'),
          cell: (channel) => formatCosts(channel.metrics.costs),
        },
      ]}
      emptyContent={t('No Data')}
    />
  )
}
