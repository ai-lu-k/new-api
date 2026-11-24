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
import { Badge } from '@/components/ui/badge'

import { formatCount, formatTokens } from './lib'
import type { HubRemaining } from './types'

type RemainingModelSummary = HubRemaining['models'][number]

type RemainingSummaryTableProps = {
  models: RemainingModelSummary[]
  locale: Intl.LocalesArgument
}

/** The per-model roll-up: how many pairs are available, cooling or unknown. */
export function RemainingSummaryTable(
  props: RemainingSummaryTableProps
): React.JSX.Element {
  const { t } = useTranslation()
  const locale = props.locale

  const columns: StaticDataTableColumn<RemainingModelSummary>[] = [
    {
      id: 'model',
      header: t('Model'),
      cell: (entry) => <span className='font-mono text-xs'>{entry.model}</span>,
    },
    {
      id: 'remaining',
      header: t('Total remaining'),
      className: 'text-right',
      cell: (entry) => {
        if (entry.total_remaining == null) {
          return <Badge variant='outline'>{t('Unknown')}</Badge>
        }
        return (
          <span className='tabular-nums'>
            {formatTokens(entry.total_remaining, locale)}
          </span>
        )
      },
    },
    {
      id: 'budget',
      header: t('Budget'),
      className: 'text-right',
      cell: (entry) => (
        <span className='tabular-nums'>
          {formatTokens(entry.budget, locale)}
        </span>
      ),
    },
    {
      id: 'pairs',
      header: t('Account and model pairs'),
      className: 'text-right',
      cell: (entry) => (
        <span className='tabular-nums'>{formatCount(entry.pairs, locale)}</span>
      ),
    },
    {
      id: 'available',
      header: t('Available'),
      className: 'text-right',
      cell: (entry) => (
        <span className='tabular-nums'>
          {formatCount(entry.available, locale)}
        </span>
      ),
    },
    {
      id: 'cooling',
      header: t('Cooling'),
      className: 'text-right',
      cell: (entry) => (
        <span className='tabular-nums'>
          {formatCount(entry.cooling, locale)}
        </span>
      ),
    },
    {
      id: 'unknown',
      header: t('Unknown'),
      className: 'text-right',
      cell: (entry) => (
        <span className='tabular-nums'>
          {formatCount(entry.unknown, locale)}
        </span>
      ),
    },
  ]

  return (
    <StaticDataTable
      columns={columns}
      data={props.models}
      getRowKey={(entry) => `${entry.realm}-${entry.model}`}
      tableClassName='min-w-[720px]'
      emptyContent={
        <span className='text-muted-foreground text-sm'>
          {t('No model is being tracked in this window')}
        </span>
      }
    />
  )
}
