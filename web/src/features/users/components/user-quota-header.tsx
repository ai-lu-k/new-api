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
import type { Table } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

import {
  QUOTA_METRIC_LABELS,
  QUOTA_SORT_METRICS,
  isQuotaSortMetric,
} from '../constants'
import type { User } from '../types'

/**
 * The balance column heading, built like the model list's score column: a
 * button reverses the sort, and a menu picks which figure the column sorts by.
 * The server sorts the whole filtered set, so the state lives in the table's
 * sorting rather than here.
 */
export function UserQuotaHeader(props: { table: Table<User>; unit: string }) {
  const { t } = useTranslation()
  const activeSort = props.table.getState().sorting[0]
  const sorted = Boolean(activeSort && isQuotaSortMetric(activeSort.id))
  const activeMetric =
    activeSort && isQuotaSortMetric(activeSort.id)
      ? activeSort.id
      : QUOTA_SORT_METRICS[0]
  const descending = sorted ? Boolean(activeSort?.desc) : true

  let Icon = ChevronsUpDown
  if (sorted) Icon = descending ? ArrowDown : ArrowUp

  return (
    <div className='flex min-w-0 items-center gap-1'>
      <button
        type='button'
        onClick={() =>
          // The heading sorts by its own figure once, then reverses on each
          // click, exactly like the model list's numeric headings.
          props.table.setSorting([
            { id: activeMetric, desc: sorted ? !descending : true },
          ])
        }
        className={cn(
          'hover:text-foreground focus-visible:ring-ring -ml-1 inline-flex shrink-0 items-center rounded-sm px-1 py-0.5 transition-colors duration-(--motion-fast) ease-(--ease-out) outline-none focus-visible:ring-2',
          sorted && 'text-foreground'
        )}
      >
        <span className='sr-only'>
          {t(QUOTA_METRIC_LABELS[activeMetric])}
          {sorted ? ` ${descending ? t('Desc') : t('Asc')}` : ''}
        </span>
        <Icon
          aria-hidden='true'
          className={cn('size-3.5 shrink-0', !sorted && 'opacity-40')}
        />
      </button>
      <Select
        value={activeMetric}
        onValueChange={(metric) => {
          if (!isQuotaSortMetric(metric)) return
          // Choosing another figure keeps the direction already in use.
          props.table.setSorting([{ id: metric, desc: descending }])
        }}
      >
        <SelectTrigger
          variant='underline'
          showIcon={false}
          aria-label={t('Sort by')}
          className='max-w-full gap-0'
        >
          <SelectValue className='decoration-muted-foreground/50 underline decoration-1 underline-offset-4'>
            {t(QUOTA_METRIC_LABELS[activeMetric])}
          </SelectValue>
          <span className='ml-1'>{` (${props.unit})`}</span>
        </SelectTrigger>
        {/* The menu sizes to its longest figure, not to the narrow heading. */}
        <SelectContent className='w-max'>
          <SelectGroup>
            {QUOTA_SORT_METRICS.map((metric) => (
              <SelectItem key={metric} value={metric}>
                {t(QUOTA_METRIC_LABELS[metric])}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
