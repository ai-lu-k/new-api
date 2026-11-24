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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { SectionHeading } from '@/components/section-heading'
import {
  formatExpenseAmount,
  formatExpenseMonth,
  formatExpenseMonthShort,
} from '@/features/rankings/lib/expenses'
import { toIntlLocale } from '@/i18n/languages'
import { textActionClass } from '@/lib/text-action'
import { cn } from '@/lib/utils'

import { useCostLines } from '../hooks'
import { MISSING_FIGURE } from '../lib/figures'
import { RiseInView } from './rise-in'

/**
 * What the site spends, in one narrow column: the newest month's total over the
 * months the ledger holds, so the figure reads as a series rather than a note
 * someone typed. The detail stays in the ledger, one link away.
 */
export function CostSection() {
  const { t, i18n } = useTranslation()
  const { lines } = useCostLines()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language) ?? 'en'

  const money = (amount: number | null) =>
    amount == null ? MISSING_FIGURE : formatExpenseAmount(amount, locale)

  const series = lines.series
  const peak = series.reduce(
    (highest, point) => Math.max(highest, point.total),
    0
  )

  return (
    <section data-slot='home-cost' className='mt-16 min-w-0 sm:mt-[104px]'>
      <SectionHeading as='h2' level='section' title={t('Cost, in the open')} />

      <div className='mt-4 sm:grid sm:grid-cols-12 sm:gap-6'>
        <div className='sm:col-span-7 sm:pr-6'>
          <p className='text-[16px] leading-[1.45] font-semibold tracking-[-0.01em]'>
            {t('Every expense goes into the ledger and is published monthly.')}
          </p>
          <p className='text-muted-foreground mt-3 text-[13px] leading-[1.6]'>
            {t(
              'Domain and upstream top-ups are read from the ledger, and the month adds the lines beside them. Figures are entered from records: no estimates, nothing hidden.'
            )}
          </p>
          <p className='mt-4 text-[13px]'>
            <Link
              to='/rankings'
              search={{ section: 'expenses' }}
              className={cn(
                'decoration-border hover:decoration-foreground',
                textActionClass
              )}
            >
              {t('Open the ledger')}
            </Link>
          </p>
        </div>

        <RiseInView className='sm:border-border mt-5 sm:col-span-5 sm:mt-0 sm:border-l sm:pl-6'>
          <p className='text-muted-foreground flex items-baseline gap-1.5 text-[11px] leading-[1.5] tabular-nums'>
            <span>{t('Month total')}</span>
            {lines.month ? (
              <span>{formatExpenseMonth(lines.month, locale)}</span>
            ) : null}
          </p>
          <p className='mt-1.5 text-[30px] leading-none font-semibold tracking-[-0.02em] tabular-nums'>
            {money(lines.total)}
          </p>

          {series.length > 1 ? (
            <div data-slot='home-cost-series' className='mt-5'>
              <div className='border-border grid h-20 grid-cols-6 items-end gap-1.5 border-b'>
                {series.map((point, index) => (
                  <div
                    key={point.month}
                    title={`${formatExpenseMonth(point.month, locale)} · ${money(point.total)}`}
                    className='flex h-full items-end justify-center'
                  >
                    <div
                      className={cn(
                        'w-full max-w-9',
                        index === series.length - 1
                          ? 'bg-foreground'
                          : 'bg-foreground/20'
                      )}
                      style={{
                        height: `${Math.max(3, Math.round((point.total / peak) * 100))}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className='mt-1.5 grid grid-cols-6 gap-1.5'>
                {series.map((point) => (
                  <span
                    key={point.month}
                    className='text-muted-foreground text-center text-[10px] tabular-nums'
                  >
                    {formatExpenseMonthShort(point.month, locale)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {series.length === 0 ? (
            <p className='text-muted-foreground mt-3 text-[11px]'>
              {t('Nothing entered this month yet')}
            </p>
          ) : null}
        </RiseInView>
      </div>
    </section>
  )
}
