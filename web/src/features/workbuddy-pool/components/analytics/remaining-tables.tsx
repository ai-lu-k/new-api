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
import { Progress } from '@/components/ui/progress'

import { accountName, formatCount, formatRate, formatTokens } from './lib'
import type { RemainingRow } from './types'

type RemainingRowsTableProps = {
  rows: RemainingRow[]
  names: Record<string, string>
  locale: Intl.LocalesArgument
}

/**
 * One row per account and model. A quota the hub could not estimate renders as
 * unknown rather than as zero: an unestimated pair is not an exhausted one.
 */
export function RemainingRowsTable(
  props: RemainingRowsTableProps
): React.JSX.Element {
  const { t } = useTranslation()
  const locale = props.locale

  const columns: StaticDataTableColumn<RemainingRow>[] = [
    {
      id: 'account',
      header: t('Account'),
      cell: (row) => (
        <span className='font-mono text-xs' title={row.uid}>
          {accountName(row.uid, props.names)}
        </span>
      ),
    },
    {
      id: 'model',
      header: t('Model'),
      cell: (row) => (
        <span className='flex flex-wrap items-center gap-1'>
          <span className='font-mono text-xs'>{row.model}</span>
          {row.cooling === true && (
            <Badge variant='destructive'>{t('Cooling')}</Badge>
          )}
          {row.estimated === true && (
            <Badge variant='outline'>{t('Estimated')}</Badge>
          )}
        </span>
      ),
    },
    {
      id: 'used',
      header: t('Used'),
      className: 'text-right',
      cell: (row) => (
        <span className='tabular-nums' title={formatCount(row.used, locale)}>
          {formatTokens(row.used, locale)}
        </span>
      ),
    },
    {
      id: 'budget',
      header: t('Budget'),
      className: 'text-right',
      cell: (row) => (
        <span className='tabular-nums' title={formatCount(row.budget, locale)}>
          {formatTokens(row.budget, locale)}
        </span>
      ),
    },
    {
      id: 'remaining',
      header: t('Remaining'),
      className: 'text-right',
      cell: (row) => {
        if (row.remaining == null) {
          return (
            <Badge variant='outline' title={t('The hub could not estimate it')}>
              {t('Unknown')}
            </Badge>
          )
        }
        return (
          <span
            className='tabular-nums'
            title={formatCount(row.remaining, locale)}
          >
            {formatTokens(row.remaining, locale)}
          </span>
        )
      },
    },
    {
      id: 'used_pct',
      header: t('Used share'),
      cell: (row) => {
        if (row.used_pct == null) {
          return <span className='text-muted-foreground text-xs'>-</span>
        }
        const clamped = Math.max(0, Math.min(100, row.used_pct))
        return (
          <span className='flex items-center gap-2'>
            <Progress
              value={clamped}
              className='w-20'
              aria-label={t('Used share')}
            />
            <span className='text-xs tabular-nums'>
              {formatRate(row.used_pct, locale)}
            </span>
          </span>
        )
      },
    },
    {
      id: 'window',
      header: t('Window start'),
      cell: (row) => (
        <span className='text-muted-foreground text-xs tabular-nums'>
          {row.window_iso}
        </span>
      ),
    },
    {
      id: 'reset',
      header: t('Resets'),
      cell: (row) => (
        <span className='text-muted-foreground text-xs tabular-nums'>
          {row.reset_iso ?? '-'}
        </span>
      ),
    },
  ]

  return (
    <StaticDataTable
      columns={columns}
      data={props.rows}
      getRowKey={(row) => `${row.uid}-${row.model}-${row.realm}`}
      tableClassName='min-w-[900px]'
      emptyContent={
        <span className='text-muted-foreground text-sm'>
          {t('No account has a quota record yet')}
        </span>
      }
    />
  )
}
