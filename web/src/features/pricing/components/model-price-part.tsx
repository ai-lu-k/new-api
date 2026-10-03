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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useSystemConfigStore } from '@/stores/system-config-store'

import { DEFAULT_TOKEN_UNIT } from '../constants'
import { useBillingTime } from '../hooks/use-billing-time'
import {
  getDynamicDisplayGroupRatio,
  getDynamicPriceUnitLabelKey,
  getDynamicPricingSummary,
} from '../lib/dynamic-price'
import { isTokenBasedModel } from '../lib/model-helpers'
import { dynamicPartEntry } from '../lib/model-sort'
import { formatPrice, formatRequestPrice } from '../lib/price'
import { taskUsageUnitLabel } from '../lib/task-price-display'
import type { PricingModel } from '../types'
import type { ModelPriceCellOptions } from './model-price-cell'

const EMPTY = '—'

/**
 * One side of a model's price for a table column: the input price, or the
 * output price. A model billed per request or per image shows that price as
 * its input and no output price.
 */
export function ModelPricePart(props: {
  model: PricingModel
  part: 'input' | 'output'
  options?: ModelPriceCellOptions
}) {
  const { t, i18n } = useTranslation()
  const currency = useSystemConfigStore((state) => state.config.currency)
  const options = props.options ?? {}
  const tokenUnit = options.tokenUnit ?? DEFAULT_TOKEN_UNIT
  const billingTime = useBillingTime(props.model.billing_expr)
  const dynamic = useMemo(
    () =>
      getDynamicPricingSummary(props.model, {
        priceRate: options.priceRate,
        usdExchangeRate: options.usdExchangeRate,
        showRechargePrice: options.showRechargePrice,
        now: billingTime === undefined ? undefined : new Date(billingTime),
        tokenUnit,
        showCurrencySymbol: true,
        groupRatioMultiplier: getDynamicDisplayGroupRatio(
          props.model,
          options.selectedGroup
        ),
      }),
    // Currency is read indirectly by the price formatter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      props.model,
      tokenUnit,
      options.priceRate,
      options.usdExchangeRate,
      options.showRechargePrice,
      options.selectedGroup,
      billingTime,
      currency,
    ]
  )

  let value: string = EMPTY
  let unit = ''
  if (dynamic) {
    if (dynamic.isSpecialExpression) {
      if (props.part === 'input') value = t('Special billing expression')
    } else {
      const entry = dynamicPartEntry(dynamic, props.part)
      if (entry) {
        value = entry.formattedRange ?? entry.formatted
        if (entry.unit !== 'token' || entry.variable) {
          const key = getDynamicPriceUnitLabelKey(entry)
          const label = taskUsageUnitLabel(
            entry,
            i18n.language,
            key ? t(key) : ''
          )
          unit = label ? `/${label}` : ''
        }
      }
    }
  } else if (isTokenBasedModel(props.model)) {
    value = formatPrice(
      props.model,
      props.part,
      tokenUnit,
      options.showRechargePrice,
      options.priceRate,
      options.usdExchangeRate,
      options.selectedGroup
    )
  } else if (props.part === 'input') {
    value = formatRequestPrice(
      props.model,
      options.showRechargePrice,
      options.priceRate,
      options.usdExchangeRate,
      options.selectedGroup
    )
    unit = `/${t('request')}`
  }

  if (value === EMPTY || value === '-') {
    return <span className='text-muted-foreground/60'>{EMPTY}</span>
  }
  return (
    <span className='font-mono text-sm whitespace-nowrap tabular-nums'>
      {value}
      {unit && (
        <span className='text-muted-foreground ml-0.5 text-xs'>{unit}</span>
      )}
    </span>
  )
}
