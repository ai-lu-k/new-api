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
import { ArrowUpRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { RollingNumber } from '@/components/motion/rolling-number'
import { formatQuotaWithCurrency } from '@/lib/currency'

import '@/styles/topup-campaign.css'

export function CampaignBonusPreview(props: {
  bonusQuota?: number
  featured?: boolean
  loading?: boolean
}) {
  const { t } = useTranslation()
  const [settledQuota, setSettledQuota] = useState(props.bonusQuota)
  // Preserve a settled figure while the next quote is pending, then clear it
  // if the completed request has no eligible bonus. Never cache a failed quote.
  if (!props.loading && settledQuota !== props.bonusQuota) {
    setSettledQuota(props.bonusQuota)
  }
  const quota = props.loading ? settledQuota : props.bonusQuota
  if (quota === undefined || quota <= 0) return null

  const amount = formatQuotaWithCurrency(quota)
  if (props.featured) {
    return (
      <div
        className='double11-voucher double11-voucher-featured'
        role='status'
        aria-label={t('Bonus voucher')}
        aria-live='polite'
        aria-atomic='true'
        aria-busy={props.loading || undefined}
      >
        <ArrowUpRight aria-hidden='true' className='double11-voucher-icon' />
        <span className='double11-credit-label'>{t('Bonus voucher')}</span>
        <strong aria-label={`+${amount}`}>
          <span className='double11-credit-sign' aria-hidden='true'>
            +
          </span>
          <RollingNumber value={amount} />
        </strong>
      </div>
    )
  }

  return (
    <div className='double11-voucher' aria-live='polite'>
      <ArrowUpRight aria-hidden='true' className='double11-voucher-icon' />
      <span>{t('Bonus voucher')}</span>
      <strong>+{amount}</strong>
    </div>
  )
}
