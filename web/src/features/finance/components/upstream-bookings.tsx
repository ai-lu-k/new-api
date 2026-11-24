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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import {
  formatExpenseAmount,
  formatExpenseMonth,
} from '@/features/rankings/lib'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listUpstreamBookings } from '../api'
import type { UpstreamBooking } from '../types'

/**
 * The payments a bound gateway reported and the monthly totals already count.
 * They stay read-only here: the gateway owns them, and a refresh re-books
 * them.
 */
export function UpstreamBookings() {
  const { t, i18n } = useTranslation()
  const query = useQuery({
    queryKey: ['finance-upstream-bookings'],
    queryFn: async () => requireServerSuccess(await listUpstreamBookings()),
  })
  const items = query.data?.data?.items ?? []
  const money = (value: number) => formatExpenseAmount(value, i18n.language)
  // Expenses follow the site's Asia/Shanghai days, not the browser's.
  const shanghai = (unix: number) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(unix * 1000))
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((entry) => entry.type === type)?.value ?? ''
    return {
      month: `${part('year')}-${part('month')}`,
      day: `${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`,
    }
  }
  const groups = new Map<string, UpstreamBooking[]>()
  for (const item of items) {
    const month = shanghai(item.paid_at).month
    const group = groups.get(month)
    if (group) {
      group.push(item)
    } else {
      groups.set(month, [item])
    }
  }

  if (query.isError) {
    return (
      <p className='text-muted-foreground text-center text-sm'>
        {t('Unable to load the automatic bookings.')}
      </p>
    )
  }
  if (items.length === 0) return null

  return (
    <section className='bg-card overflow-hidden rounded-xl border'>
      <header className='px-5 py-4'>
        <h2 className='text-base font-semibold'>
          {t('Automatic upstream top-ups')}
        </h2>
        <p className='text-muted-foreground mt-1 text-xs'>
          {t(
            'Synced from bound gateways and already counted in the spending above. These lines cannot be edited.'
          )}
        </p>
      </header>
      {[...groups.entries()].map(([month, rows]) => {
        const total = rows.reduce((sum, row) => sum + row.amount_cny, 0)
        return (
          <div key={month} className='border-t'>
            <div className='bg-muted/40 flex items-baseline justify-between gap-4 px-5 py-2'>
              <span className='text-sm font-medium'>
                {formatExpenseMonth(month, i18n.language)}
              </span>
              <span className='text-sm font-medium tabular-nums'>
                {money(total)}
              </span>
            </div>
            <ul className='divide-y'>
              {rows.map((row) => (
                <li
                  key={row.id}
                  className='flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-2 text-sm'
                >
                  <span className='text-muted-foreground tabular-nums'>
                    {shanghai(row.paid_at).day}
                  </span>
                  <span className='min-w-0 flex-1 truncate'>
                    {row.account_name || t('Upstream account')}
                  </span>
                  <span className='tabular-nums'>{money(row.amount_cny)}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
