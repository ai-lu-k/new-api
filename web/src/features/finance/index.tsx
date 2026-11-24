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
import { Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SECTION_TABLE_HEAD_CLASSNAME } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LearnMore } from '@/components/learn-more'
import { TabSwitch } from '@/components/motion/tab-switch'
import { SectionPanel } from '@/components/section-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ExpenseLedger } from '@/features/rankings/components'
import {
  formatExpenseAmount,
  formatExpenseMonth,
} from '@/features/rankings/lib'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { getFinanceSummary } from './api'
import { DailyFinanceChart } from './components/daily-finance-chart'
import { MetricLabel } from './components/metric-label'
import { OperationsOverview } from './components/operations-overview'
import { ReserveTargets } from './components/reserve-targets'
import { UpstreamAccounts } from './components/upstream-accounts'
import { UpstreamBookings } from './components/upstream-bookings'
import { monthBalance, totalGift, totalTopUp } from './lib'
import type { FinanceMonth } from './types'

/**
 * Money in and out by month, for the root user only: what users paid, what
 * was given away, and what the site spent.
 */
export function Finance(props: { tab?: 'expenses' }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'analysis' | 'expenses'>(
    props.tab ?? 'analysis'
  )
  const query = useQuery({
    queryKey: ['finance-summary'],
    queryFn: async () => requireServerSuccess(await getFinanceSummary()),
  })
  const months = query.data?.data?.months ?? []
  const excludedUsers = query.data?.data?.excluded_users ?? 0

  return (
    <SectionPageLayout pageIndex={<>{t('Admin area')} / 07</>}>
      <SectionPageLayout.Title>
        <span className='inline-flex min-w-0 items-center gap-2'>
          <span className='truncate'>{t('Operations info')}</span>
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
        <TabSwitch
          value={tab}
          onValueChange={(value) => {
            if (value === 'analysis' || value === 'expenses') {
              setTab(value)
            }
          }}
          ariaLabel={t('Finance')}
          panelClassName='space-y-4'
          tabs={[
            {
              value: 'analysis',
              label: t('Income and expenses'),
              content: (
                <>
                  {query.isLoading && (
                    <Skeleton className='h-[420px] w-full rounded-xl' />
                  )}
                  {query.isError && (
                    <ErrorState
                      description={t('Unable to load income data')}
                      onRetry={() => void query.refetch()}
                    />
                  )}
                  {!query.isLoading && !query.isError && (
                    <div className='space-y-6'>
                      <ReserveTargets />
                      <DailyFinanceChart />
                      <OperationsOverview />
                      <UpstreamAccounts />
                      {months.length > 0 && <MonthTable months={months} />}
                      {excludedUsers > 0 && (
                        <p className='text-muted-foreground text-xs'>
                          {t(
                            'The figures leave out {{count}} accounts marked as test accounts.',
                            { count: excludedUsers }
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </>
              ),
            },
            {
              value: 'expenses',
              label: t('Expense disclosure'),
              content: (
                <>
                  <div className='flex flex-wrap items-end justify-between gap-3'>
                    <p className='text-muted-foreground max-w-2xl text-sm'>
                      {t(
                        'Enter what the site paid each month. The lines are shown to every visitor; notes stay private.'
                      )}
                      <br />
                      {t(
                        'Upstream top-ups are added automatically; do not enter them again here.'
                      )}
                    </p>
                    <Button
                      variant='outline'
                      size='sm'
                      render={
                        <Link to='/rankings' search={{ section: 'expenses' }} />
                      }
                    >
                      <ExternalLink />
                      {t('View public page')}
                    </Button>
                  </div>
                  <ExpenseLedger editable />
                  <UpstreamBookings />
                </>
              ),
            },
          ]}
        />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

function MonthTable(props: { months: FinanceMonth[] }) {
  const { t, i18n } = useTranslation()
  const money = (value: number) => formatExpenseAmount(value, i18n.language)

  return (
    <section aria-label={t('Monthly breakdown')}>
      <SectionPanel
        title={t('Monthly breakdown')}
        actions={
          <LearnMore
            triggerProps={{
              'aria-label': t('Monthly breakdown'),
              className:
                'size-4 shrink-0 border-0 bg-transparent text-muted-foreground hover:bg-transparent [&_svg]:size-3.5',
              openOnHover: true,
              delay: 0,
            }}
            contentProps={{ className: 'max-w-72 text-xs leading-5' }}
          >
            {t('Gifts are quota, not money, and stay out of the net.')}
          </LearnMore>
        }
      >
        <Table className={SECTION_TABLE_HEAD_CLASSNAME}>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Expense month')}</TableHead>
              <TableHead className='text-end'>
                {t('Checkout top-ups')}
              </TableHead>
              <TableHead className='text-end'>{t('Paid offline')}</TableHead>
              <TableHead className='text-end'>
                <MetricLabel
                  label={t('Top-ups')}
                  align='end'
                  hint={t(
                    'Checkout payments, plus manual additions marked as paid offline.'
                  )}
                />
              </TableHead>
              <TableHead className='text-end'>
                <MetricLabel
                  label={t('Spending')}
                  align='end'
                  hint={t(
                    'Ledger expenses plus upstream top-ups the bound gateways report.'
                  )}
                />
              </TableHead>
              <TableHead className='text-end'>
                <MetricLabel
                  label={t('Net')}
                  align='end'
                  hint={t(
                    'Top-ups minus spending for the period; gifts are not money.'
                  )}
                />
              </TableHead>
              <TableHead className='text-end'>{t('Check-in gifts')}</TableHead>
              <TableHead className='text-end'>
                {t('Redemption codes')}
              </TableHead>
              <TableHead className='text-end'>{t('Event gifts')}</TableHead>
              <TableHead className='text-end'>{t('Manual gifts')}</TableHead>
              <TableHead className='text-end'>
                <MetricLabel
                  label={t('Gifts')}
                  align='end'
                  hint={t(
                    'Check-in, redemption, event and manual gifts at face value.'
                  )}
                />
              </TableHead>
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
                    {money(month.gift_event)}
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
      </SectionPanel>
    </section>
  )
}
