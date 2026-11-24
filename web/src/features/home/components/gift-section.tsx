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

import { SectionHeading } from '@/components/section-heading'
import { formatExpenseAmount } from '@/features/rankings/lib/expenses'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { MISSING_FIGURE } from '../lib/figures'
import type { GiftStats } from '../types'
import { FigureRow } from './figure-row'
import { RiseInView } from './rise-in'

export type GiftSectionProps = {
  stats: GiftStats | null
}

/** Labels for the sources the API names by key only. */
const FALLBACK_LABELS: Record<string, string> = {
  checkin: 'Check-in',
  voucher: 'Voucher',
  campaign: 'Campaign reward',
}

const TH_CLASS =
  'border-foreground border-border border-t border-b py-2.5 pr-6 text-left align-bottom text-[16px] font-semibold tracking-[-0.01em]'
// On a phone each row stacks: the source's name, then its amount, its count
// and how it is granted, each on its own line with the column name in front.
const TD_CLASS =
  'border-border border-b py-3 pr-6 align-top text-[13px] leading-[1.6] max-sm:block max-sm:border-0 max-sm:py-0 max-sm:pr-0'

/**
 * What the site handed out, and through which doors.
 *
 * Nothing is printed when the ledger is unavailable: a site whose API does not
 * serve `/api/gift-stats` yet answers 404, and a block of zeroes would claim it
 * granted nothing. The backend owns the wording of each source, so `label` and
 * `note` are rendered as received.
 */
export function GiftSection(props: GiftSectionProps) {
  const { t, i18n } = useTranslation()
  if (!props.stats) return null

  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language) ?? 'en'
  const money = (amount: number) => formatExpenseAmount(amount, locale)
  const entries = (count: number) =>
    t('{{value}} entries', { value: formatNumber(count, locale) })
  const stats = props.stats

  return (
    <section data-slot='home-gifts' className='mt-14 min-w-0 sm:mt-[88px]'>
      <SectionHeading as='h2' level='section' title={t('Generous rewards')} />
      <p className='text-muted-foreground mt-4 max-w-[720px] text-[13px] leading-[1.7]'>
        {t(
          'Check-ins, vouchers, make-up grants and campaign rewards all land in one ledger: {{today}} today, {{week}} this week, {{month}} in the last 30 days — every entry can be traced.',
          {
            today: money(stats.today.amount),
            week: money(stats.week.amount),
            month: money(stats.month.amount),
          }
        )}
      </p>

      <RiseInView>
        <FigureRow
          className='mt-8'
          items={[
            {
              key: 'today',
              label: t('Today'),
              value: money(stats.today.amount),
              note: entries(stats.today.count),
            },
            {
              key: 'week',
              label: t('This week'),
              value: money(stats.week.amount),
              note: entries(stats.week.count),
            },
            {
              key: 'month',
              label: t('Last 30 days'),
              value: money(stats.month.amount),
              note: entries(stats.month.count),
            },
          ]}
        />
      </RiseInView>

      <table
        data-slot='home-gift-sources'
        className='mt-8 w-full table-fixed border-collapse max-sm:block'
      >
        <colgroup className='max-sm:hidden'>
          <col className='w-[150px]' />
          <col className='w-[150px]' />
          <col className='w-[96px]' />
          <col />
        </colgroup>
        <thead className='max-sm:hidden'>
          <tr>
            <th scope='col' className={TH_CLASS}>
              {t('Source')}
            </th>
            <th scope='col' className={TH_CLASS}>
              {t('Last 30 days')}
            </th>
            <th scope='col' className={TH_CLASS}>
              {t('Entries')}
            </th>
            <th scope='col' className={TH_CLASS}>
              {t('How it is granted')}
            </th>
          </tr>
        </thead>
        <tbody className='max-sm:block'>
          {stats.sources.map((source) => {
            const fallback = FALLBACK_LABELS[source.key]
            return (
              <tr
                key={source.key}
                className='hover:bg-muted/30 max-sm:border-border transition-colors duration-(--motion-fast) max-sm:block max-sm:border-b max-sm:py-3'
              >
                <td className={TD_CLASS}>
                  <span className='font-medium'>
                    {source.label ?? (fallback ? t(fallback) : source.key)}
                  </span>
                </td>
                <td className={`${TD_CLASS} tabular-nums`}>
                  <span className='text-muted-foreground mr-2 sm:hidden'>
                    {t('Last 30 days')}
                  </span>
                  {money(source.amount)}
                </td>
                <td className={`${TD_CLASS} tabular-nums`}>
                  <span className='text-muted-foreground mr-2 sm:hidden'>
                    {t('Entries')}
                  </span>
                  {formatNumber(source.count, locale)}
                </td>
                <td className={TD_CLASS}>{source.note ?? MISSING_FIGURE}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
