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
import { ArrowUpRight, Asterisk } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { LearnMore } from '@/components/learn-more'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import '@/styles/topup-campaign.css'

import { useTopupCampaign } from './use-topup-campaign'

export function CampaignRules(props: { featured?: boolean }) {
  const { t, i18n } = useTranslation()
  const { campaign, active } = useTopupCampaign()
  if (!active || !campaign) return null
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const threshold = formatNumber(campaign.threshold_cny, locale)

  return (
    <section
      aria-label={t('Double 11 top-up offer')}
      className={cn(
        'double11-offer',
        props.featured && 'double11-offer-featured'
      )}
    >
      {props.featured && (
        <span className='double11-edition' aria-hidden='true'>
          11
        </span>
      )}
      <div className='double11-offer-topline'>
        <span className='double11-day'>
          <Asterisk size={15} aria-hidden='true' /> 11 / 11
        </span>
        <span className='double11-deadline'>
          {t('Ends Nov 12, 24:00 (Beijing)')}
        </span>
      </div>
      <div className='double11-offer-main'>
        <div className='double11-offer-heading'>
          <h2>
            {t(
              '{{base}}% bonus, {{bonus}}% for single payments of CNY {{amount}}+',
              {
                base: formatNumber(campaign.base_percent, locale),
                bonus: formatNumber(campaign.threshold_percent, locale),
                amount: threshold,
              }
            )}
          </h2>
          <p>
            {t('Single payment of CNY {{amount}} or more', {
              amount: threshold,
            })}
          </p>
        </div>
        <div className='double11-rate'>
          <span>+</span>
          {formatNumber(campaign.threshold_percent, locale)}
          <span>%</span>
        </div>
      </div>
      <div className='double11-offer-bottom'>
        <span className='double11-base'>
          <ArrowUpRight size={16} aria-hidden='true' />
          {t('Below CNY {{amount}}: {{percent}}% bonus', {
            amount: threshold,
            percent: formatNumber(campaign.base_percent, locale),
          })}
        </span>
        <LearnMore
          triggerProps={{
            'aria-label': t('Double 11 rules'),
            className: 'double11-details',
          }}
          contentProps={{ className: 'max-w-xs space-y-2 leading-6' }}
        >
          <p>
            {t(
              'Bonus credit is calculated from the credited top-up amount. Only online payments in CNY qualify.'
            )}
          </p>
          <p>
            {t(
              'The CNY 100 threshold is based on a single actual payment. The 15% and 5% bonuses do not stack. Code redemption and administrator credits do not qualify.'
            )}
          </p>
          <p>
            {t(
              'Bonuses are issued as redemption codes after successful online payment. Find your voucher in Billing History and redeem it in your wallet.'
            )}
          </p>
        </LearnMore>
      </div>
      <span className='double11-offer-stamp' aria-hidden='true'>
        +
      </span>
    </section>
  )
}
