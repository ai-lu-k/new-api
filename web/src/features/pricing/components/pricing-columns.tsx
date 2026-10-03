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
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { getLobeIcon } from '@/lib/lobe-icon'

import type { PricingModel } from '../types'
import type { ModelPriceCellOptions } from './model-price-cell'
import { ModelPricePart } from './model-price-part'
import { PerfCell, WeeklyTokensCell } from './model-stats-cells'
import { PriceTierBadge } from './price-tier-badge'

// ----------------------------------------------------------------------------
// Pricing Table Columns
// ----------------------------------------------------------------------------

export type PricingColumnsOptions = ModelPriceCellOptions

/**
 * The model list as a table in the manner of OpenRouter: one row per model,
 * with usage, price and speed side by side.
 */
export function usePricingColumns(
  options: PricingColumnsOptions = {}
): ColumnDef<PricingModel>[] {
  const { t } = useTranslation()
  const tokenUnitLabel = options.tokenUnit === 'K' ? '1K' : '1M'
  const numeric = 'text-right'

  return [
    {
      accessorKey: 'model_name',
      meta: { label: t('Model') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Model')} />
      ),
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
    },
    {
      id: 'weekly_tokens',
      header: () => <div className={numeric}>{t('Weekly tokens')}</div>,
      cell: ({ row }) => (
        <WeeklyTokensCell modelName={row.original.model_name} />
      ),
      size: 120,
      enableSorting: false,
    },
    {
      id: 'input_price',
      header: () => (
        <div className={numeric}>
          {t('Input')}
          <span className='text-muted-foreground/70 ml-1 text-xs font-normal'>
            /{tokenUnitLabel}
          </span>
        </div>
      ),
      cell: ({ row }) => (
        <div className={numeric}>
          <ModelPricePart model={row.original} part='input' options={options} />
        </div>
      ),
      size: 150,
      enableSorting: false,
    },
    {
      id: 'output_price',
      header: () => (
        <div className={numeric}>
          {t('Output')}
          <span className='text-muted-foreground/70 ml-1 text-xs font-normal'>
            /{tokenUnitLabel}
          </span>
        </div>
      ),
      cell: ({ row }) => (
        <div className={numeric}>
          <ModelPricePart
            model={row.original}
            part='output'
            options={options}
          />
        </div>
      ),
      size: 150,
      enableSorting: false,
    },
    {
      id: 'latency',
      header: () => <div className={numeric}>{t('Latency')}</div>,
      cell: ({ row }) => (
        <PerfCell modelName={row.original.model_name} field='latency' />
      ),
      size: 110,
      enableSorting: false,
    },
    {
      id: 'throughput',
      header: () => <div className={numeric}>{t('Throughput')}</div>,
      cell: ({ row }) => (
        <PerfCell modelName={row.original.model_name} field='tps' />
      ),
      size: 110,
      enableSorting: false,
    },
  ]
}
