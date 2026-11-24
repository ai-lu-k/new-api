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

import { Progress } from '@/components/ui/progress'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { creditPercent, expiryTone } from './lib'
import type { HubAccount } from './types'

type AccountCreditsProps = {
  account: HubAccount
  locale?: string
}

/**
 * What the account can still spend. The hub only knows a balance after someone
 * fetched it, so an unfetched account says so instead of showing a zero.
 */
export function AccountCredits(props: AccountCreditsProps) {
  const { t } = useTranslation()
  const credits = props.account.credits
  if (!credits) {
    return (
      <p className='text-muted-foreground mt-2 text-xs'>
        {t('Credits not fetched yet')}
      </p>
    )
  }
  const remain = Number(credits.remain ?? 0)
  const size = Number(credits.size ?? 0)
  const earliest = credits.earliest_expiring ?? null
  const checkin = credits.checkin
  const tone = expiryTone(earliest?.days_left ?? null)
  const daysLeft = Number(earliest?.days_left ?? 0)

  return (
    <div className='mt-2 grid gap-3 sm:grid-cols-2'>
      <div className='min-w-0'>
        <div className='flex items-baseline justify-between gap-2 text-xs'>
          <span className='text-muted-foreground'>{t('Credits')}</span>
          <span className='tabular-nums'>
            <span className='font-semibold'>
              {formatNumber(remain, props.locale)}
            </span>
            <span className='text-muted-foreground'>
              {' / '}
              {formatNumber(size, props.locale)}
            </span>
          </span>
        </div>
        <Progress
          value={creditPercent(props.account)}
          className='mt-1'
          aria-label={t('Credits remaining')}
        />
        {earliest && (
          <p
            className={cn(
              'mt-1 truncate text-xs',
              tone === 'danger' && 'text-destructive',
              tone === 'warning' && 'text-warning'
            )}
            title={earliest.cycle_end_time}
          >
            {t('{{name}} · {{days}} days left', {
              name: earliest.name,
              days: daysLeft.toFixed(1),
            })}
          </p>
        )}
      </div>
      <div className='text-muted-foreground flex flex-col gap-1 text-xs'>
        {checkin && (
          <span>
            {checkin.today_checked_in
              ? t('Checked in today')
              : t('Not checked in today')}
            {' · '}
            {t('{{days}} day streak', { days: checkin.streak_days })}
            {checkin.today_credit > 0
              ? ` · +${formatNumber(checkin.today_credit, props.locale)}`
              : ''}
          </span>
        )}
        <span>
          {t('Used {{used}} of {{size}}', {
            used: formatNumber(Number(credits.used ?? 0), props.locale),
            size: formatNumber(size, props.locale),
          })}
        </span>
        {credits.is_paid_user && <span>{t('Paid user')}</span>}
      </div>
    </div>
  )
}
