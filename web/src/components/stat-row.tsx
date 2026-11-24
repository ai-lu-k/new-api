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
import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export type StatRowItem = {
  /** Stable identity of the metric; also the React key. */
  key: string
  label: ReactNode
  value: ReactNode
  /** Plain-text value for assistive tech when `value` is a composite node. */
  valueText?: string
  /** Draws attention to a value that needs action, such as a depleted credit. */
  tone?: 'default' | 'destructive'
  /** Renders a skeleton in the value slot while the figure is pending. */
  loading?: boolean
  /**
   * Secondary line under the value, for a breakdown the figure alone cannot
   * state ("Gift used …"). Only the 'analytics' scale has room for it.
   */
  hint?: ReactNode
}

export type StatRowProps = {
  items: StatRowItem[]
  /** Metrics per row on wide screens; phones always use two columns. */
  columns?: 2 | 3 | 4
  /** 'page' tops a list page; 'analytics' heads an analysis page. */
  size?: 'page' | 'analytics'
  className?: string
  itemClassName?: string
}

// Phones always show two columns: three or four large figures in one narrow
// row either wrap or push the row past the viewport. The vertical rules only
// appear from the breakpoint where every metric sits on one line, because a
// wrapped row would draw a rule in front of the column that starts it.
const GRID_CLASSNAMES: Record<NonNullable<StatRowProps['columns']>, string> = {
  2: 'grid-cols-2 divide-x',
  3: 'grid-cols-2 sm:grid-cols-3 sm:divide-x',
  4: 'grid-cols-2 lg:grid-cols-4 lg:divide-x',
}

// Padding of the cell that opens a wrapped phone row: it starts the line, so
// the inline rule's gutter only applies once every metric is on one row.
const WRAPPED_ROW_START_PADDING: Record<3 | 4, string> = {
  3: 'max-sm:ps-0 sm:ps-4',
  4: 'max-lg:ps-0 lg:ps-4',
}

/**
 * The row of figures that opens a page: a small muted label over a large
 * number, separated by hairline rules. It keeps the figure sizes of the two
 * page families apart instead of letting each page invent its own scale, and
 * reserves each value's box while it loads so the row does not jump.
 */
export function StatRow(props: StatRowProps) {
  const columns = props.columns ?? 4
  const size = props.size ?? 'page'

  return (
    <dl
      data-slot='stat-row'
      className={cn('grid min-w-0', GRID_CLASSNAMES[columns], props.className)}
    >
      {props.items.map((item, index) => {
        let startPadding = 'ps-4'
        if (index === 0) {
          startPadding = ''
        } else if (columns !== 2 && index % 2 === 0) {
          startPadding = WRAPPED_ROW_START_PADDING[columns]
        }

        return (
          <div
            key={item.key}
            className={cn('min-w-0 pe-4', startPadding, props.itemClassName)}
          >
            <dt
              className={cn(
                'text-muted-foreground',
                size === 'page' ? 'text-xs' : 'text-[13px]'
              )}
            >
              {item.label}
            </dt>
            <dd
              className={cn(
                // A currency amount is one unbreakable token: wrapping it splits
                // `$188.79` across two lines, so the neighbouring columns shrink
                // instead.
                'mt-1 font-bold tracking-tight whitespace-nowrap tabular-nums',
                size === 'page'
                  ? 'text-xl lg:text-2xl'
                  : 'text-2xl lg:text-3xl',
                item.tone === 'destructive' && 'text-destructive'
              )}
              aria-label={item.loading ? undefined : item.valueText}
            >
              {item.loading ? (
                <Skeleton
                  className={cn(
                    'max-w-full',
                    size === 'page' ? 'h-6 w-24' : 'h-8 w-28'
                  )}
                />
              ) : (
                // Keyed by the figure itself: a new value is a new node, so it
                // fades in on the fast token instead of the old digits being
                // overwritten between two frames. No counting, no movement —
                // the number is replaced, and only its opacity ramps.
                <span
                  key={item.valueText ?? ''}
                  data-stat-value=''
                  className='whitespace-nowrap'
                >
                  {item.value}
                </span>
              )}
            </dd>
            {size === 'analytics' &&
              item.hint && (
                // The value above is nowrap so an amount never splits; the hint
                // is a sentence and may wrap at word boundaries on a phone.
                <div className='text-muted-foreground mt-1 text-[13px] leading-4'>
                  {item.hint}
                </div>
              )}
          </div>
        )
      })}
    </dl>
  )
}
