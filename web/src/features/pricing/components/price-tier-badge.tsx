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
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { priceTierDiscount } from '../lib/model-helpers'
import { PricingMark } from './pricing-mark'

/**
 * Marks a model sold below its official price ("75% off", "2.5 折"), as a mark
 * on a tint of its own colour: the figure is about saving, and the green says
 * so before it is read.
 */
export function PriceTierBadge(props: {
  multiplier: number | undefined
  className?: string
}) {
  const { t } = useTranslation()
  const discount = priceTierDiscount(props.multiplier)
  if (!discount) return null
  return (
    <PricingMark
      label={
        discount.percent === 100
          ? t('Free')
          : t('{{percent}}% off', {
              percent: discount.percent,
              tenths: discount.tenths,
            })
      }
      // One width for every tier, so the column of marks lines up whatever the
      // figure is; the words stay centred in it.
      className={cn('bg-success/12 text-success min-w-14', props.className)}
    />
  )
}
