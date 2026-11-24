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
import type { Row, Table } from '@tanstack/react-table'
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
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useListDiffTransition } from '@/components/motion/use-list-diff-transition'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import { getListEntranceSignature, getRowDiffKey } from '../core/list-signature'
import { tableHasCompactMeta } from './card-cell-utils'
import { CardRowContent } from './card-row-content'

/** Helpers passed to a custom {@link DataTableCardGridProps.renderCard}. */
export type DataTableCardHelpers = {
  /**
   * Whether the table declares compact card meta (`mobileTitle`/`mobileBadge`).
   * Provided so custom renderers can match the default layout decision.
   */
  compact: boolean
  /**
   * Row selection state captured before entering memoized custom card renderers.
   */
  isSelected: boolean
}

export interface DataTableCardGridProps<TData> {
  table: Table<TData>
  isLoading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyIcon?: React.ReactNode
  getRowKey?: (row: Row<TData>) => string | number
  getRowClassName?: (row: Row<TData>) => string | undefined
  /**
   * Custom card renderer. When omitted, cards render generically from the
   * column definitions via {@link CardRowContent} (driven by column meta).
   */
  renderCard?: (
    row: Row<TData>,
    helpers: DataTableCardHelpers
  ) => React.ReactNode
  /**
   * Responsive grid className override. Defaults to a 1/2/3-column grid.
   */
  gridClassName?: string
  /** Stable key prefix for skeleton cards. */
  skeletonKeyPrefix?: string
}

const DEFAULT_GRID_CLASSNAME =
  'grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3'

function CardGridSkeleton(props: {
  gridClassName?: string
  keyPrefix?: string
}) {
  const prefix = props.keyPrefix ?? 'card-skeleton'
  return (
    <div className={props.gridClassName ?? DEFAULT_GRID_CLASSNAME}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={`${prefix}-${i}`}
          className='space-y-3 rounded-lg border bg-(--table-row) p-3'
        >
          <div className='flex items-center justify-between gap-2'>
            <Skeleton className='h-4 w-32' />
            <Skeleton className='h-5 w-16 rounded-md' />
          </div>
          <div className='grid grid-cols-2 gap-x-3 gap-y-1.5'>
            {[1, 2, 3, 4].map((j) => (
              <div key={j}>
                <Skeleton className='mb-1 h-2 w-8' />
                <Skeleton className='h-4 w-full' />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Desktop card view for table data — a responsive grid of bordered cards.
 *
 * Renders the same per-row content as {@link MobileCardList} (via
 * {@link CardRowContent}) unless a custom `renderCard` is supplied. This keeps
 * the card view reusable across any table with zero per-feature work while
 * still allowing a bespoke card design when desired.
 *
 * The default generic card omits the `select` column. Custom `renderCard`
 * implementations can use `helpers.isSelected` to keep selection UI in sync.
 */
export function DataTableCardGrid<TData>(props: DataTableCardGridProps<TData>) {
  const { t } = useTranslation()

  const resolvedEmptyTitle = props.emptyTitle ?? t('No Data')
  const resolvedEmptyDescription =
    props.emptyDescription ?? t('No data available')

  const visibleColumns = props.table.getVisibleLeafColumns()
  const compact = React.useMemo(
    () => tableHasCompactMeta(props.table),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleColumns]
  )
  const rows = props.table.getRowModel().rows
  const listSignature = React.useMemo(
    () => getListEntranceSignature(rows, props.table.getState()),
    // The rows array identity changes exactly when the result set changes.
    [props.table, rows]
  )
  const gridRef = React.useRef<HTMLDivElement>(null)
  // Cards are keyed by `data-diff-key`, so a filter that keeps one of three
  // cards moves that card and drops the other two (motion contract §10.1).
  useListDiffTransition(gridRef, listSignature)

  if (props.isLoading) {
    return (
      <CardGridSkeleton
        gridClassName={props.gridClassName}
        keyPrefix={props.skeletonKeyPrefix}
      />
    )
  }

  if (!rows || rows.length === 0) {
    // Same quiet treatment as the table body: one line of copy, no illustration
    // and no frame, so an empty list never outweighs the records beside it.
    return (
      <div className='flex flex-col gap-1 py-6'>
        <p className='text-muted-foreground text-[13px] leading-snug'>
          {resolvedEmptyTitle}
        </p>
        <p className='text-muted-foreground text-[13px] leading-snug'>
          {resolvedEmptyDescription}
        </p>
      </div>
    )
  }

  return (
    <div
      ref={gridRef}
      className={props.gridClassName ?? DEFAULT_GRID_CLASSNAME}
    >
      {rows.map((row) => {
        const key = props.getRowKey
          ? String(props.getRowKey(row))
          : getRowDiffKey(row)
        const isSelected = row.getIsSelected()
        return (
          <CardGridItem
            key={key}
            diffKey={key}
            isSelected={isSelected}
            className={props.getRowClassName?.(row)}
          >
            {props.renderCard ? (
              props.renderCard(row, { compact, isSelected })
            ) : (
              <CardRowContent row={row} compact={compact} />
            )}
          </CardGridItem>
        )
      })}
    </div>
  )
}

/**
 * One card in the grid. Selection and hover are colour transitions on the fast
 * token; whether the card travels or re-enters after a result change is decided
 * by the grid's handoff, not here.
 */
function CardGridItem(props: {
  isSelected: boolean
  diffKey: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      data-diff-key={props.diffKey}
      data-slot='data-table-card'
      data-state={props.isSelected ? 'selected' : undefined}
      className={cn(
        'rounded-lg border bg-(--data-table-card-bg,var(--table-row)) px-3 py-2.5 transition-[background-color,border-color] duration-(--motion-fast) ease-(--ease-out) data-[state=selected]:[--data-table-card-bg:color-mix(in_oklch,var(--primary)_7%,var(--table-row))] data-[state=selected]:border-primary/40',
        props.className
      )}
    >
      {props.children}
    </div>
  )
}
