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
import {
  flexRender,
  type Row,
  type PaginationState,
} from '@tanstack/react-table'
import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTablePagination,
  DataTableRow,
  DataTableView,
  MobileCardList,
  SECTION_FRAME_CLASSNAME,
  SECTION_TABLE_HEAD_CLASSNAME,
  useDataTable,
} from '@/components/data-table'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMediaQuery } from '@/hooks'
import { cn } from '@/lib/utils'

import { DEFAULT_PRICING_PAGE_SIZE, DEFAULT_TOKEN_UNIT } from '../constants'
import { BenchmarkContext, useBenchmark } from '../hooks/use-benchmark'
import { ModelStatsContext, useModelStats } from '../hooks/use-model-stats'
import { PricingSortContext } from '../hooks/use-pricing-sort'
import {
  benchmarkDimensionsForModality,
  benchmarkScore,
  benchmarkSource,
  defaultBenchmarkDimension,
  type BenchmarkModality,
} from '../lib/benchmark'
import { parseTags } from '../lib/filters'
import {
  DEFAULT_MODEL_SORT,
  nextModelSort,
  sortModelsBy,
  type ModelSort,
  type ModelSortKey,
} from '../lib/model-sort'
import type { PricingModel, TokenUnit } from '../types'
import { BenchmarkAttribution } from './benchmark-controls'
import { usePricingColumns } from './pricing-columns'

export interface PricingTableProps {
  models: PricingModel[]
  isLoading?: boolean
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  selectedGroup?: string
  /** The kind of work the list is filtered to; it picks the score ladder. */
  modelType?: string
  /** The column the list is sorted by; clicking a heading changes it. */
  sort?: ModelSort
  onSortChange?: (sort: ModelSort) => void
  onModelClick?: (modelName: string) => void
}

export function PricingTable(props: PricingTableProps) {
  const { t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const {
    models,
    isLoading = false,
    priceRate = 1,
    usdExchangeRate = 1,
    tokenUnit = DEFAULT_TOKEN_UNIT,
    showRechargePrice = false,
    selectedGroup,
    modelType,
    sort = DEFAULT_MODEL_SORT,
    onSortChange,
    onModelClick,
  } = props

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PRICING_PAGE_SIZE,
  })

  const stats = useModelStats()
  const benchmark = useBenchmark()
  let modality: BenchmarkModality = 'text'
  if (modelType === 'image') modality = 'image'
  if (modelType === 'audio') modality = 'speech'
  const dimensions = useMemo(() => {
    return benchmarkDimensionsForModality(
      benchmark.data?.dimensions ?? [],
      modality
    )
  }, [benchmark.data?.dimensions, modality])
  const [chosenDimension, setChosenDimension] = useState<string>()
  // A dimension belongs to one filter type, so switching the type falls back to
  // that modality's default instead of leaving an empty column behind.
  const dimension =
    chosenDimension && dimensions.some((item) => item.id === chosenDimension)
      ? chosenDimension
      : defaultBenchmarkDimension(modality)
  const handleDimensionChange = useCallback((value: string) => {
    setChosenDimension(value)
    setPagination((current) => ({ ...current, pageIndex: 0 }))
  }, [])
  const benchmarkScores = useMemo(() => {
    const scores = new Map<string, number>()
    for (const model of models) {
      const score = benchmarkScore(
        benchmark.models.get(model.model_name),
        dimension
      )
      if (score) scores.set(model.model_name, score.rating)
    }
    return scores
  }, [models, benchmark.models, dimension])
  const sourceVersion = benchmarkSource(benchmark.data, modality)?.version
  const benchmarkState = useMemo(
    () => ({
      models: benchmark.models,
      modality,
      dimension,
      dimensions,
      version: sourceVersion,
      onDimensionChange: handleDimensionChange,
    }),
    [
      benchmark.models,
      sourceVersion,
      modality,
      dimensions,
      dimension,
      handleDimensionChange,
    ]
  )
  // The usage and speed figures arrive after the list does; the order follows.
  const sortedModels = useMemo(
    () =>
      sortModelsBy(models, sort, {
        weeklyTokens: stats.weeklyTokens,
        weeklyCalls: stats.weeklyCalls,
        perf: stats.perf,
        selectedGroup,
        benchmarkScores,
      }),
    [models, sort, stats, selectedGroup, benchmarkScores]
  )
  const handleSort = useCallback(
    (key: ModelSortKey) => {
      onSortChange?.(nextModelSort(sort, key))
      setPagination((current) => ({ ...current, pageIndex: 0 }))
    },
    [onSortChange, sort]
  )
  // A tag carried by every row of this list says nothing about any one of them,
  // so the rows leave it out and the words that remain are the differences.
  // It is read from the filtered list rather than the sorted one: the sort
  // changes the order of the rows, never which tags they share, and rebuilding
  // the columns on every sort would reset the table under the pointer.
  const commonTags = useMemo(() => {
    if (models.length < 2) return []
    const counts = new Map<string, number>()
    for (const model of models) {
      for (const tag of parseTags(model.tags)) {
        const key = tag.toLowerCase()
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
    return [...counts]
      .filter(([, count]) => count === models.length)
      .map(([tag]) => tag)
  }, [models])

  const columns = usePricingColumns({
    modelType,
    commonTags,
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

  const mobileFields = [
    { column: 'input_price', key: 'input', label: t('Input') },
    { column: 'output_price', key: 'output', label: t('Output') },
    { column: 'benchmark', key: 'benchmark', label: t('Score') },
    { column: 'weekly_tokens', key: 'tokens', label: t('Weekly tokens') },
    { column: 'latency', key: 'latency', label: t('Latency') },
    { column: 'throughput', key: 'throughput', label: t('Throughput') },
  ] as const
  const pageRows = table.getRowModel().rows
  const selectedSortLabel = mobileFields.find(
    (field) => field.key === sort.key
  )?.label

  return (
    <BenchmarkContext value={benchmarkState}>
      <ModelStatsContext value={stats}>
        <PricingSortContext value={sortState}>
          <div className='min-w-0 space-y-4'>
            {benchmark.isError && (
              <p className='text-muted-foreground text-xs'>
                {t('Benchmark scores unavailable')}
              </p>
            )}
            {isMobile ? (
              <>
                <div className='flex min-w-0 items-center gap-2'>
                  <Select
                    value={sort.key}
                    onValueChange={(value) => {
                      const field = mobileFields.find(
                        (item) => item.key === value
                      )
                      if (field) handleSort(field.key)
                    }}
                  >
                    <SelectTrigger
                      aria-label={t('Sort by')}
                      className='h-10 min-w-0 flex-1'
                    >
                      <SelectValue>{selectedSortLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      {mobileFields.map((field) => (
                        <SelectItem key={field.key} value={field.key}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type='button'
                    variant='outline'
                    className='h-10'
                    onClick={() => handleSort(sort.key)}
                  >
                    {sort.descending ? t('Desc') : t('Asc')}
                  </Button>
                </div>
                {isLoading || pageRows.length === 0 ? (
                  <MobileCardList
                    table={table}
                    isLoading={isLoading}
                    emptyTitle={t('No Models Found')}
                    emptyDescription={t(
                      'No models match your current filters.'
                    )}
                  />
                ) : (
                  <ul className='border-t-foreground divide-y border-t'>
                    {pageRows.map((row) => {
                      const cells = row.getVisibleCells()
                      const model = cells.find(
                        (cell) => cell.column.id === 'model_name'
                      )
                      return (
                        <li key={row.id} className='space-y-3 py-4'>
                          {model &&
                            flexRender(
                              model.column.columnDef.cell,
                              model.getContext()
                            )}
                          <dl className='grid grid-cols-2 gap-3'>
                            {mobileFields.map((field) => {
                              const cell = cells.find(
                                (item) => item.column.id === field.column
                              )
                              if (!cell) return null
                              return (
                                <div key={field.column} className='min-w-0'>
                                  <dt className='text-muted-foreground text-xs'>
                                    {field.label}
                                  </dt>
                                  <dd className='mt-1 text-sm [&>div]:justify-start [&>div]:text-left'>
                                    {flexRender(
                                      cell.column.columnDef.cell,
                                      cell.getContext()
                                    )}
                                  </dd>
                                </div>
                              )
                            })}
                          </dl>
                          {onModelClick && (
                            <Button
                              type='button'
                              variant='outline'
                              onClick={() => handleRowClick(row.original)}
                            >
                              {t('View details')}
                            </Button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </>
            ) : (
              <DataTableView
                table={table}
                isLoading={isLoading}
                emptyTitle={t('No Models Found')}
                emptyDescription={t('No models match your current filters.')}
                skeletonKeyPrefix='pricing-skeleton'
                containerClassName={SECTION_FRAME_CLASSNAME}
                tableClassName={cn(
                  'table-fixed min-w-[900px] [&_td]:h-[76px]',
                  SECTION_TABLE_HEAD_CLASSNAME
                )}
                colgroup={
                  <colgroup>
                    {table.getVisibleLeafColumns().map((column) => (
                      <col
                        key={column.id}
                        className={
                          column.id === 'model_name' ? 'w-[320px]' : undefined
                        }
                      />
                    ))}
                  </colgroup>
                }
                getColumnClassName={(_columnId, kind) =>
                  kind === 'header'
                    ? 'text-muted-foreground font-medium'
                    : undefined
                }
                renderRow={(row: Row<PricingModel>) => (
                  <DataTableRow
                    key={row.id}
                    row={row}
                    className='hover:bg-muted/30 cursor-pointer transition-colors duration-(--motion-fast)'
                    onClick={() => handleRowClick(row.original)}
                  />
                )}
              />
            )}

            {/* A decision model has no published benchmark, so the table has
                no score column for the attribution to explain. */}
            {modelType !== 'decision' && dimensions.length > 0 && (
              <BenchmarkAttribution
                modality={modality}
                snapshot={benchmark.data}
                stale={benchmark.data?.stale}
                date={dimensions.find((item) => item.id === dimension)?.date}
              />
            )}

            {!isLoading && models.length > 0 && (
              <DataTablePagination table={table} />
            )}
          </div>
        </PricingSortContext>
      </ModelStatsContext>
    </BenchmarkContext>
  )
}
