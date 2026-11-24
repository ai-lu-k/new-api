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

import { isFreeModel } from '../lib/model-helpers'
import type { PricingModel } from '../types'
import { PricingMark } from './pricing-mark'

/**
 * What a free model says about itself: that it costs nothing, and that the
 * allowance which makes it free is capped, so the row cannot be read as
 * unlimited.
 *
 * The two read as one block — no gap, no dividing rule — because they are one
 * statement split in two: the ink half is the offer, the muted half is its
 * condition.
 */
export function ModelFreeBadge(props: {
  model: PricingModel
  className?: string
}) {
  const { t } = useTranslation()
  if (!isFreeModel(props.model)) return null

  return (
    <div className={cn('flex min-w-0 items-center', props.className)}>
      <PricingMark
        label={t('Free')}
        join='start'
        className='bg-foreground text-background font-semibold'
      />
      <PricingMark
        label={t('Limited quota')}
        join='end'
        className='bg-muted text-muted-foreground'
      />
    </div>
  )
}
