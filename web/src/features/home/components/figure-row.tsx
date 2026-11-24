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

import { cn } from '@/lib/utils'

export type FigureItem = {
  /** Stable identity of the figure; also the React key. */
  key: string
  label: ReactNode
  value: ReactNode
  /** Unit printed next to the value, one size smaller, on the same baseline. */
  unit?: ReactNode
  /** Line under the value: the window it covers, a count, the day it peaked. */
  note?: ReactNode
}

export type FigureRowProps = {
  items: FigureItem[]
  className?: string
  /** Hairline above every cell; false where the block itself sets the rule. */
  divided?: boolean
}

/**
 * A row of figures under a block: label above, number, then a line saying what
 * the number covers. Three columns from the width where they fit on one line,
 * stacked with a hairline above each cell on a phone.
 *
 * `StatRow` is the row of the console pages: it draws vertical rules and has no
 * slot for that third line, so a block that has to state its window keeps its
 * own row here.
 */
export function FigureRow(props: FigureRowProps) {
  const divided = props.divided ?? true

  return (
    <dl
      data-slot='home-figure-row'
      className={cn('grid min-w-0 gap-x-6 sm:grid-cols-3', props.className)}
    >
      {props.items.map((item) => (
        <div
          key={item.key}
          className={cn(
            'min-w-0 pr-6 max-sm:mt-4 max-sm:first:mt-0',
            divided && 'border-border border-t pt-5'
          )}
        >
          <dt className='text-muted-foreground text-[13px] leading-snug'>
            {item.label}
          </dt>
          <dd className='mt-2 min-w-0'>
            <p className='flex items-baseline gap-[3px] text-2xl leading-[1.05] font-bold tracking-[-0.02em] tabular-nums'>
              {item.value}
              {item.unit != null && (
                <span className='text-base font-medium tracking-normal'>
                  {item.unit}
                </span>
              )}
            </p>
            {item.note != null && (
              <p className='text-muted-foreground mt-1.5 text-[11px] leading-[1.45] tabular-nums'>
                {item.note}
              </p>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
