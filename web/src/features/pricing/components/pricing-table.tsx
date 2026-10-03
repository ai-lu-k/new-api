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
import type { Row, PaginationState } from '@tanstack/react-table'
import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTablePagination,
  DataTableRow,
  DataTableView,
  useDataTable,
} from '@/components/data-table'

import { DEFAULT_PRICING_PAGE_SIZE, DEFAULT_TOKEN_UNIT } from '../constants'
import { ModelStatsContext, useModelStats } from '../hooks/use-model-stats'
import { PricingSortContext } from '../hooks/use-pricing-sort'
import {
  DEFAULT_MODEL_SORT,
  nextModelSort,
  sortModelsBy,
  type ModelSort,
  type ModelSortKey,
} from '../lib/model-sort'
import type { PricingModel, TokenUnit } from '../types'
import { usePricingColumns } from './pricing-columns'

export interface PricingTableProps {
  models: PricingModel[]
  isLoading?: boolean
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  selectedGroup?: string
  /** The column the list is sorted by; clicking a heading changes it. */
  sort?: ModelSort
  onSortChange?: (sort: ModelSort) => void
  onModelClick?: (modelName: string) => void
}

export function PricingTable(props: PricingTableProps) {
  const { t } = useTranslation()
  const {
    models,
    isLoading = false,
    priceRate = 1,
    usdExchangeRate = 1,
    tokenUnit = DEFAULT_TOKEN_UNIT,
    showRechargePrice = false,
    selectedGroup,
    sort = DEFAULT_MODEL_SORT,
    onSortChange,
    onModelClick,
  } = props

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PRICING_PAGE_SIZE,
  })

  const stats = useModelStats()
  // The usage and speed figures arrive after the list does; the order follows.
  const sortedModels = useMemo(
    () =>
      sortModelsBy(models, sort, {
        weeklyTokens: stats.weeklyTokens,
        perf: stats.perf,
        selectedGroup,
      }),
    [models, sort, stats, selectedGroup]
  )
  const handleSort = useCallback(
    (key: ModelSortKey) => {
      onSortChange?.(nextModelSort(sort, key))
      setPagination((current) => ({ ...current, pageIndex: 0 }))
    },
    [onSortChange, sort]
  )
  const columns = usePricingColumns({
    tokenUnit,
    priceRate,
    usdExchangeRate,
    showRechargePrice,
    selectedGroup,
  })
  const sortState = useMemo(
    () => ({ sort, onSort: handleSort }),
    [sort, handleSort]
  )

  const { table } = useDataTable({
    data: sortedModels,
    columns,
    pageCount: Math.ceil(sortedModels.length / pagination.pageSize),
    pagination,
    onPaginationChange: setPagination,
    manualPagination: false,
    withFilteredRowModel: false,
    withSortedRowModel: false,
    withFacetedRowModel: false,
  })

  const handleRowClick = useCallback(
    (model: PricingModel) => {
      onModelClick?.(model.model_name)
    },
    [onModelClick]
  )

  return (
    <ModelStatsContext value={stats}>
      <PricingSortContext value={sortState}>
        <div className='space-y-4'>
          <DataTableView
            table={table}
            isLoading={isLoading}
            emptyTitle={t('No Models Found')}
            emptyDescription={t('No models match your current filters.')}
            skeletonKeyPrefix='pricing-skeleton'
            applyHeaderSize
            getColumnClassName={(_columnId, kind) =>
              kind === 'header'
                ? 'text-muted-foreground font-medium'
                : undefined
            }
            renderRow={(row: Row<PricingModel>) => (
              <DataTableRow
                key={row.id}
                row={row}
                className='hover:bg-muted/30 cursor-pointer transition-colors'
                onClick={() => handleRowClick(row.original)}
              />
            )}
          />

          {!isLoading && models.length > 0 && (
            <DataTablePagination table={table} />
          )}
        </div>
      </PricingSortContext>
    </ModelStatsContext>
  )
}
