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
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  formatExpenseAmount,
  formatExpenseMonth,
} from '@/features/rankings/lib'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { getFinanceSummary } from './api'
import { FinanceChart } from './components/finance-chart'
import { monthBalance, totalGift, totalTopUp, yearTotals } from './lib'
import type { FinanceMonth, FinanceTotals } from './types'

/**
 * Money in and out by month, for the root user only: what users paid, what
 * was given away, and what the site spent.
 */
export function Finance() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['finance-summary'],
    queryFn: async () => requireServerSuccess(await getFinanceSummary()),
  })
  const months = query.data?.data?.months ?? []
  const excludedUsers = query.data?.data?.excluded_users ?? 0

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <span className='inline-flex min-w-0 items-center gap-2'>
          <span className='truncate'>{t('Income and expenses')}</span>
          <Badge variant='outline' className='shrink-0'>
            Root
          </Badge>
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t(
          'Top-ups are money received: checkout payments plus manual additions marked as paid offline. Everything else added to accounts is a gift, shown at face value. Only you can see this page.'
        )}
      </SectionPageLayout.Description>
      <SectionPageLayout.Content>
        {query.isLoading && <Skeleton className='h-[420px] w-full rounded-xl' />}
        {query.isError && (
          <div className='bg-card rounded-xl border border-dashed px-6 py-12 text-center'>
            <p className='text-muted-foreground text-sm'>
              {t('Unable to load income data')}
            </p>
          </div>
        )}
        {!query.isLoading && !query.isError && months.length > 0 && (
          <div className='space-y-6'>
            {excludedUsers > 0 && (
              <p className='text-muted-foreground text-sm'>
                {t(
                  'The figures leave out {{count}} accounts marked as test accounts.',
                  { count: excludedUsers }
                )}
              </p>
            )}
            <PeriodSummary months={months} total={query.data?.data?.total} />
            <FinanceChart months={months} />
            <MonthTable months={months} />
          </div>
        )}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

type Period = 'month' | 'year' | 'all'

const PERIODS: { id: Period; labelKey: string }[] = [
  { id: 'month', labelKey: 'Current month' },
  { id: 'year', labelKey: 'Current year' },
  { id: 'all', labelKey: 'All time' },
]

/**
 * The four headline figures in one card, for the current month, the current
 * year or everything since the site began.
 */
function PeriodSummary(props: {
  months: FinanceMonth[]
  total?: FinanceTotals
}) {
  const { t, i18n } = useTranslation()
  const [period, setPeriod] = useState<Period>('month')
  const current = props.months[0]
  const year = current.month.slice(0, 4)

  let figures: FinanceTotals = current
  let heading = formatExpenseMonth(current.month, i18n.language)
  if (period === 'year') {
    // The list reaches back twelve months, so it holds the whole year so far.
    figures = yearTotals(props.months, year)
    heading = year
  } else if (period === 'all') {
    figures = props.total ?? yearTotals(props.months, year)
    heading = t('Since the site began')
  }

  const balance = monthBalance(figures)
  const tiles = [
    { label: t('Top-ups'), value: totalTopUp(figures) },
    { label: t('Spending'), value: figures.expenses },
    { label: t('Net'), value: balance, signed: true },
    { label: t('Gifts'), value: totalGift(figures) },
  ]

  return (
    <section
      aria-label={t('Summary')}
      className='bg-card overflow-hidden rounded-xl border'
    >
      <header className='flex flex-wrap items-center justify-between gap-3 px-5 py-4'>
        <h2 className='text-base font-semibold'>{heading}</h2>
        <div
          role='tablist'
          aria-label={t('Period')}
          className='bg-muted inline-flex rounded-lg p-1'
        >
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type='button'
              role='tab'
              aria-selected={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                period === p.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t(p.labelKey)}
            </button>
          ))}
        </div>
      </header>
      <dl className='grid grid-cols-2 border-t lg:grid-cols-4 lg:divide-x'>
        {tiles.map((tile) => (
          <div key={tile.label} className='px-5 py-4'>
            <dt className='text-muted-foreground text-xs'>{tile.label}</dt>
            <dd
              className={cn(
                'mt-1 text-xl font-semibold tabular-nums',
                tile.signed && tile.value < 0 && 'text-destructive'
              )}
            >
              {formatExpenseAmount(tile.value, i18n.language)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function MonthTable(props: { months: FinanceMonth[] }) {
  const { t, i18n } = useTranslation()
  const money = (value: number) => formatExpenseAmount(value, i18n.language)

  return (
    <section className='bg-card overflow-hidden rounded-xl border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Expense month')}</TableHead>
            <TableHead className='text-end'>{t('Checkout top-ups')}</TableHead>
            <TableHead className='text-end'>{t('Paid offline')}</TableHead>
            <TableHead className='text-end'>{t('Top-ups')}</TableHead>
            <TableHead className='text-end'>{t('Spending')}</TableHead>
            <TableHead className='text-end'>{t('Net')}</TableHead>
            <TableHead className='text-end'>{t('Check-in gifts')}</TableHead>
            <TableHead className='text-end'>{t('Redemption codes')}</TableHead>
            <TableHead className='text-end'>{t('Manual gifts')}</TableHead>
            <TableHead className='text-end'>{t('Gifts')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.months.map((month) => {
            const balance = monthBalance(month)
            return (
              <TableRow key={month.month}>
                <TableCell className='font-medium whitespace-nowrap'>
                  {formatExpenseMonth(month.month, i18n.language)}
                </TableCell>
                <TableCell className='text-end tabular-nums'>
                  {money(month.online_topup)}
                </TableCell>
                <TableCell className='text-end tabular-nums'>
                  {money(month.manual_topup)}
                </TableCell>
                <TableCell className='text-end font-medium tabular-nums'>
                  {money(totalTopUp(month))}
                </TableCell>
                <TableCell className='text-end tabular-nums'>
                  {money(month.expenses)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-end font-medium tabular-nums',
                    balance < 0 && 'text-destructive'
                  )}
                >
                  {money(balance)}
                </TableCell>
                <TableCell className='text-muted-foreground text-end tabular-nums'>
                  {money(month.gift_checkin)}
                </TableCell>
                <TableCell className='text-muted-foreground text-end tabular-nums'>
                  {money(month.gift_redemption)}
                </TableCell>
                <TableCell className='text-muted-foreground text-end tabular-nums'>
                  {money(month.gift_manual)}
                </TableCell>
                <TableCell className='text-end tabular-nums'>
                  {money(totalGift(month))}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </section>
  )
}
