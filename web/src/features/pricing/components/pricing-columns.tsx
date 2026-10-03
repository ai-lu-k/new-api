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
import type { ModelPriceCellOptions } from './model-price-cell'
import { ModelPricePart } from './model-price-part'
import { PerfCell, WeeklyTokensCell } from './model-stats-cells'
import { PriceTierBadge } from './price-tier-badge'
import { PricingSortHeader } from './pricing-sort-header'

// ----------------------------------------------------------------------------
// Pricing Table Columns
// ----------------------------------------------------------------------------

export type PricingColumnsOptions = ModelPriceCellOptions

const NUMERIC = 'text-right'

/**
 * The model list as a table in the manner of OpenRouter: one row per model,
 * with usage, price and speed side by side. Every heading sorts the list.
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
  } = options

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
        header: () => heading('name', t('Model'), false),
        cell: ({ row }) => {
          const model = row.original
          const modelIconKey = model.icon || model.vendor_icon
          const modelIcon = modelIconKey ? getLobeIcon(modelIconKey, 18) : null
          return (
            <div className='flex max-w-full min-w-0 items-center gap-2.5'>
              {modelIcon ?? <span className='size-[18px] shrink-0' />}
              <span className='truncate font-mono text-sm font-medium'>
                {model.model_name}
              </span>
              <PriceTierBadge
                multiplier={model.price_multiplier}
                className='shrink-0'
              />
            </div>
          )
        },
        minSize: 260,
        enableSorting: false,
      },
      {
        id: 'weekly_tokens',
        header: () => heading('tokens', t('Weekly tokens')),
        cell: ({ row }) => (
          <WeeklyTokensCell modelName={row.original.model_name} />
        ),
        size: 120,
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
        size: 150,
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
        size: 150,
        enableSorting: false,
      },
      {
        id: 'latency',
        header: () => heading('latency', t('Latency')),
        cell: ({ row }) => (
          <PerfCell modelName={row.original.model_name} field='latency' />
        ),
        size: 110,
        enableSorting: false,
      },
      {
        id: 'throughput',
        header: () => heading('throughput', t('Throughput')),
        cell: ({ row }) => (
          <PerfCell modelName={row.original.model_name} field='tps' />
        ),
        size: 110,
        enableSorting: false,
      },
    ]
    return columns
  }, [
    t,
    tokenUnit,
    priceRate,
    usdExchangeRate,
    showRechargePrice,
    selectedGroup,
  ])
}
