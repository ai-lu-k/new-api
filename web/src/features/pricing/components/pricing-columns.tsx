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
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { getLobeIcon } from '@/lib/lobe-icon'

import type { ModelSortKey } from '../lib/model-sort'
import type { PricingModel } from '../types'
import { BenchmarkScoreHeader } from './benchmark-controls'
import { BenchmarkScoreCell } from './benchmark-score-cell'
import { ModelFreeBadge } from './model-free-badge'
import type { ModelPriceCellOptions } from './model-price-cell'
import { ModelPricePart } from './model-price-part'
import { ModelSharedName } from './model-shared-name'
import {
  PerfCell,
  SuccessRateCell,
  WeeklyCallsCell,
  WeeklyTokensCell,
} from './model-stats-cells'
import { ModelTags } from './model-tags'
import { PriceTierBadge } from './price-tier-badge'
import { PricingSortHeader } from './pricing-sort-header'
import { PromoCountdown } from './promo-countdown'

// ----------------------------------------------------------------------------
// Pricing Table Columns
// ----------------------------------------------------------------------------

export type PricingColumnsOptions = ModelPriceCellOptions & {
  /**
   * The kind of work the list is filtered to. Image models return pictures and
   * decision models publish no benchmark, so their rows read differently.
   */
  modelType?: string
  /** Tags every model in the list carries; they name the list, not a model. */
  commonTags?: string[]
}

const NUMERIC = 'text-center'

/**
 * The model list as a table in the manner of OpenRouter: one row per model,
 * with usage, price and speed side by side. Numeric headings sort the list.
 *
 * The definitions are created once per set of options. A heading or cell that
 * shows something that changes (the sort, the live figures) reads it from a
 * context, not from here.
 */
export function usePricingColumns(
  options: PricingColumnsOptions = {}
): ColumnDef<PricingModel>[] {
  const { t } = useTranslation()
  const {
    tokenUnit,
    priceRate,
    usdExchangeRate,
    showRechargePrice,
    selectedGroup,
    modelType,
    commonTags,
  } = options
  // Image models return pictures, not tokens: the same row reads as calls,
  // one price per request, and how long a picture takes.
  const isImage = modelType === 'image'
  // A decision model is priced per token by its plugin expression, so its row
  // reads usage and both prices. It publishes no benchmark, no throughput and
  // no relay telemetry (a plugin settles its task in the same second), so
  // those columns are left out rather than standing empty.
  const isDecision = modelType === 'decision'
  // Speech models are priced per character of what they say, so a separate
  // output price would be the same figure twice; the column is left out.
  const isSpeech = modelType === 'audio'

  return useMemo(() => {
    const priceOptions: ModelPriceCellOptions = {
      tokenUnit,
      priceRate,
      usdExchangeRate,
      showRechargePrice,
      selectedGroup,
    }
    const tokenUnitLabel = tokenUnit === 'K' ? '1K' : '1M'
    const heading = (
      sortKey: ModelSortKey,
      label: React.ReactNode,
      numeric = true
    ) => (
      <PricingSortHeader sortKey={sortKey} numeric={numeric}>
        {label}
      </PricingSortHeader>
    )
    const priceLabel = (label: string) => (
      <>
        {label}
        <span className='text-muted-foreground/70 ml-1 text-xs font-normal'>
          /{tokenUnitLabel}
        </span>
      </>
    )

    const columns: ColumnDef<PricingModel>[] = [
      {
        accessorKey: 'model_name',
        // No meta.label: the shared table would swap in its own sort menu.
        header: () => t('Model'),
        cell: ({ row }) => {
          const model = row.original
          const modelIconKey = model.icon || model.vendor_icon
          const modelIcon = modelIconKey ? getLobeIcon(modelIconKey, 18) : null
          return (
            <div className='min-w-0 space-y-1'>
              <div className='flex max-w-full min-w-0 items-center gap-2'>
                {modelIcon}
                <ModelSharedName
                  modelName={model.model_name}
                  className='truncate text-sm font-bold'
                />
              </div>
              {/* The vendor takes a fixed column so the discount and the
                  countdown start at the same place on every row. */}
              <div className='text-muted-foreground grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 text-xs'>
                <span className='truncate'>{model.vendor_name}</span>
                <div className='flex min-w-0 items-center gap-3'>
                  <ModelFreeBadge model={model} className='shrink-0' />
                  <PriceTierBadge
                    multiplier={model.price_multiplier}
                    className='shrink-0'
                  />
                  <PromoCountdown
                    endsAt={model.promo_ends_at}
                    className='shrink-0'
                  />
                  <ModelTags tags={model.tags} omit={commonTags} />
                </div>
              </div>
            </div>
          )
        },
        enableSorting: false,
      },
    ]

    // No published benchmark covers a decision model, so its score column
    // would only ever read as a dash.
    if (!isDecision) {
      columns.push({
        id: 'benchmark',
        header: () => <BenchmarkScoreHeader />,
        cell: ({ row }) => (
          <BenchmarkScoreCell modelName={row.original.model_name} />
        ),
        enableSorting: false,
      })
    }

    if (isDecision) {
      columns.push(
        {
          id: 'weekly_tokens',
          header: () => heading('tokens', t('Weekly tokens')),
          cell: ({ row }) => (
            <WeeklyTokensCell modelName={row.original.model_name} />
          ),
          enableSorting: false,
        },
        {
          id: 'weekly_calls',
          header: () => heading('calls', t('Weekly calls')),
          cell: ({ row }) => (
            <WeeklyCallsCell modelName={row.original.model_name} />
          ),
          enableSorting: false,
        },
        {
          id: 'input_price',
          header: () => heading('input', priceLabel(t('Input'))),
          cell: ({ row }) => (
            <div className={NUMERIC}>
              <ModelPricePart
                model={row.original}
                part='input'
                options={priceOptions}
              />
            </div>
          ),
          enableSorting: false,
        },
        {
          id: 'output_price',
          header: () => heading('output', priceLabel(t('Output'))),
          cell: ({ row }) => (
            <div className={NUMERIC}>
              <ModelPricePart
                model={row.original}
                part='output'
                options={priceOptions}
              />
            </div>
          ),
          enableSorting: false,
        }
      )
      return isSpeech
        ? columns.filter((column) => column.id !== 'output_price')
        : columns
    }

    if (isImage) {
      columns.push(
        {
          id: 'weekly_calls',
          header: () => heading('calls', t('Weekly calls')),
          cell: ({ row }) => (
            <WeeklyCallsCell modelName={row.original.model_name} />
          ),
          enableSorting: false,
        },
        {
          id: 'request_price',
          header: () => heading('input', t('Price')),
          // The request price is the model's whole price, so this column
          // carries the sort key the text list splits across two columns.
          cell: ({ row }) => (
            <div className={NUMERIC}>
              <ModelPricePart
                model={row.original}
                part='input'
                options={priceOptions}
              />
            </div>
          ),
          enableSorting: false,
        },
        {
          id: 'latency',
          header: () => heading('latency', t('Generation time')),
          cell: ({ row }) => (
            <PerfCell modelName={row.original.model_name} field='latency' />
          ),
          enableSorting: false,
        },
        {
          id: 'success_rate',
          header: () => heading('success_rate', t('Success rate')),
          cell: ({ row }) => (
            <SuccessRateCell modelName={row.original.model_name} />
          ),
          enableSorting: false,
        }
      )
      return isSpeech
        ? columns.filter((column) => column.id !== 'output_price')
        : columns
    }

    columns.push(
      {
        id: 'weekly_tokens',
        header: () => heading('tokens', t('Weekly tokens')),
        cell: ({ row }) => (
          <WeeklyTokensCell modelName={row.original.model_name} />
        ),
        enableSorting: false,
      },
      {
        id: 'input_price',
        header: () => heading('input', priceLabel(t('Input'))),
        cell: ({ row }) => (
          <div className={NUMERIC}>
            <ModelPricePart
              model={row.original}
              part='input'
              options={priceOptions}
            />
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'output_price',
        header: () => heading('output', priceLabel(t('Output'))),
        cell: ({ row }) => (
          <div className={NUMERIC}>
            <ModelPricePart
              model={row.original}
              part='output'
              options={priceOptions}
            />
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'latency',
        header: () => heading('latency', t('Latency')),
        cell: ({ row }) => (
          <PerfCell modelName={row.original.model_name} field='latency' />
        ),
        enableSorting: false,
      },
      {
        id: 'throughput',
        header: () => heading('throughput', t('Throughput')),
        cell: ({ row }) => (
          <PerfCell modelName={row.original.model_name} field='tps' />
        ),
        enableSorting: false,
      }
    )
    return isSpeech
      ? columns.filter((column) => column.id !== 'output_price')
      : columns
  }, [
    t,
    tokenUnit,
    priceRate,
    usdExchangeRate,
    showRechargePrice,
    selectedGroup,
    commonTags,
    isImage,
    isDecision,
    isSpeech,
  ])
}
