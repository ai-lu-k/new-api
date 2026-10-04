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
import { monthBalance, totalGift, totalTopUp } from './lib'
import type { FinanceMonth } from './types'

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
            <CurrentMonth month={months[0]} />
            <FinanceChart months={months} />
            <MonthTable months={months} />
          </div>
        )}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

function CurrentMonth(props: { month: FinanceMonth }) {
  const { t, i18n } = useTranslation()
  const balance = monthBalance(props.month)
  const tiles = [
    { label: t('Top-ups'), value: totalTopUp(props.month) },
    { label: t('Spending'), value: props.month.expenses },
    { label: t('Net'), value: balance, signed: true },
    { label: t('Gifts'), value: totalGift(props.month) },
  ]

  return (
    <section
      aria-label={formatExpenseMonth(props.month.month, i18n.language)}
      className='space-y-3'
    >
      <h2 className='text-muted-foreground text-sm font-medium'>
        {formatExpenseMonth(props.month.month, i18n.language)}
      </h2>
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
        {tiles.map((tile) => (
          <div key={tile.label} className='bg-card rounded-xl border px-5 py-4'>
            <div className='text-muted-foreground text-xs'>{tile.label}</div>
            <div
              className={cn(
                'mt-1 text-xl font-semibold tabular-nums',
                tile.signed && tile.value < 0 && 'text-destructive'
              )}
            >
              {formatExpenseAmount(tile.value, i18n.language)}
            </div>
          </div>
        ))}
      </div>
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
