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

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'

import { formatCount, formatRate, percentile, sampleCount } from './lib'
import type { PerfModelRow } from './types'

type PerfModelTableProps = {
  rows: PerfModelRow[]
  locale: Intl.LocalesArgument
}

/**
 * One row per model, so a single slow model can be told apart from a slow
 * gateway. Percentiles that the sample could not produce stay blank.
 */
export function PerfModelTable(props: PerfModelTableProps): React.JSX.Element {
  const { t } = useTranslation()
  const locale = props.locale

  const columns: StaticDataTableColumn<PerfModelRow>[] = [
    {
      id: 'model',
      header: t('Model'),
      cell: (row) => <span className='font-mono text-xs'>{row.model}</span>,
    },
    {
      id: 'requests',
      header: t('Requests'),
      className: 'text-right',
      cell: (row) => (
        <span className='tabular-nums'>
          {formatCount(row.block.requests, locale)}
        </span>
      ),
    },
    {
      id: 'success',
      header: t('Success rate'),
      className: 'text-right',
      cell: (row) => (
        <span className='tabular-nums'>
          {formatRate(row.block.success_rate_pct, locale)}
        </span>
      ),
    },
    {
      id: 'ttft',
      header: t('TTFT p50 / p90 (ms)'),
      className: 'text-right',
      cell: (row) => (
        <span className='tabular-nums'>
          {formatCount(percentile(row.block.ttft_ms, 'p50'), locale)} /{' '}
          {formatCount(percentile(row.block.ttft_ms, 'p90'), locale)}
        </span>
      ),
    },
    {
      id: 'generation',
      header: t('Generation p50 (ms)'),
      className: 'text-right',
      cell: (row) => (
        <span className='tabular-nums'>
          {formatCount(percentile(row.block.generation_ms, 'p50'), locale)}
        </span>
      ),
    },
    {
      id: 'speed',
      header: t('Tokens per second p50'),
      className: 'text-right',
      cell: (row) => (
        <span className='tabular-nums'>
          {formatCount(percentile(row.block.tokens_per_sec, 'p50'), locale)}
        </span>
      ),
    },
    {
      id: 'cache',
      header: t('Cache hit p50 (%)'),
      className: 'text-right',
      cell: (row) => (
        <span className='tabular-nums'>
          {formatCount(percentile(row.block.cache_hit_pct, 'p50'), locale)}
        </span>
      ),
    },
    {
      id: 'samples',
      header: t('Samples'),
      className: 'text-right',
      cell: (row) => (
        <span className='tabular-nums'>
          {formatCount(sampleCount(row.block.ttft_ms), locale)}
        </span>
      ),
    },
  ]

  return (
    <StaticDataTable
      columns={columns}
      data={props.rows}
      getRowKey={(row) => row.model}
      tableClassName='min-w-[880px]'
      emptyContent={
        <span className='text-muted-foreground text-sm'>
          {t('The hub measured no request in this window')}
        </span>
      }
    />
  )
}
