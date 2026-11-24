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

import { QuotaDetailsPopover } from '@/components/quota-details-popover'
import { formatQuota } from '@/lib/format'
import { textActionClass } from '@/lib/text-action'
import { cn } from '@/lib/utils'

import type { UsageSource } from '../../types'

/**
 * The secondary line under the remaining credit: how much of it was given to
 * the account rather than paid for. The gift side is a fact only when the
 * funding records cover the account; otherwise it says so instead of reading as
 * zero.
 */
export function GiftCreditHint(props: {
  usageSource?: UsageSource | null
  creditRemaining: number
}) {
  const { t } = useTranslation()
  const source = props.usageSource
  if (!source) return null
  const giftKnown = source.gift_known === true
  const giftRemaining = Number(source.gift_remaining ?? 0)
  // A known zero is not worth a line; an unknown figure always is.
  if (giftKnown && !(giftRemaining > 0)) return null
  const amount = formatQuota(giftRemaining)
  const paid = Math.max(props.creditRemaining - giftRemaining, 0)
  const label = giftKnown
    ? t('Gift credit {{amount}}', { amount })
    : t('Gift credit · Untraceable')

  return (
    <QuotaDetailsPopover
      title={t('Quota details')}
      triggerLabel={label}
      details={[
        {
          label: t('Credit remaining'),
          value: formatQuota(props.creditRemaining),
        },
        {
          label: t('Gift credit'),
          value: giftKnown ? amount : t('Untraceable'),
        },
        ...(giftKnown
          ? [{ label: t('Paid balance'), value: formatQuota(paid) }]
          : []),
      ]}
    >
      <span
        className={cn(
          'text-muted-foreground hover:text-foreground text-[13px] leading-4',
          textActionClass
        )}
      >
        {label}
      </span>
    </QuotaDetailsPopover>
  )
}
