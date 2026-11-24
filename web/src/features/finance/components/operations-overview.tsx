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
import dayjs from 'dayjs'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LearnMore } from '@/components/learn-more'
import {
  SectionPanel,
  type SectionPanelStatus,
} from '@/components/section-panel'
import { StatRow, type StatRowItem } from '@/components/stat-row'
import { Button } from '@/components/ui/button'
import { formatExpenseAmount } from '@/features/rankings/lib'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getFinanceOperations } from '../api'
import { MetricLabel } from './metric-label'
import { WalletSourceDialog } from './wallet-source-dialog'

/**
 * The operations overview for ordinary users: their wallet split, what was
 * consumed in the last 30 days, and the current Token Plan cycles.
 */
export function OperationsOverview() {
  const { t, i18n } = useTranslation()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const query = useQuery({
    queryKey: ['finance-operations'],
    queryFn: async () => requireServerSuccess(await getFinanceOperations()),
  })
  const money = (value: number) => formatExpenseAmount(value, i18n.language)
  const wallet = query.data?.data?.wallet
  const consumption = query.data?.data?.consumption
  const plan = query.data?.data?.token_plan

  const users = String(wallet?.users ?? 0)
  const balance = money(wallet?.balance ?? 0)
  const paid = money(wallet?.paid ?? 0)
  const gift = money(wallet?.gift ?? 0)
  const stats: StatRowItem[] = [
    {
      key: 'users',
      label: (
        <MetricLabel
          label={t('Ordinary users')}
          hint={t(
            'Enabled and disabled ordinary accounts. Administrators and configured test accounts are left out.'
          )}
        />
      ),
      value: users,
      valueText: users,
    },
    {
      key: 'balance',
      label: (
        <MetricLabel
          label={t('Wallet balance')}
          hint={t('The wallets ordinary users still hold, at face value.')}
        />
      ),
      value: balance,
      valueText: balance,
    },
    {
      key: 'paid',
      label: (
        <MetricLabel
          label={t('Remaining paid')}
          hint={t(
            'The part of those wallets still explained by money received.'
          )}
        />
      ),
      value: paid,
      valueText: paid,
    },
    {
      key: 'gift',
      label: (
        <MetricLabel
          label={t('Remaining gift')}
          hint={t(
            'Everything else left in the wallets: gifts, codes and quota no record explains.'
          )}
        />
      ),
      value: gift,
      valueText: gift,
    },
  ]

  let panelStatus: SectionPanelStatus = 'ready'
  if (query.isLoading) panelStatus = 'loading'
  else if (query.isError) panelStatus = 'error'

  return (
    <section aria-label={t('Operations overview')}>
      <SectionPanel
        title={t('Operations overview')}
        description={t('Updated {{time}}', {
          time: dayjs.unix(wallet?.as_of ?? 0).format('MM-DD HH:mm'),
        })}
        actions={
          <Button
            variant='outline'
            size='sm'
            onClick={() => setDetailsOpen(true)}
            disabled={!wallet}
          >
            {t('Check details')}
          </Button>
        }
        status={panelStatus}
        errorMessage={t('Unable to load the operations overview.')}
        onRetry={() => void query.refetch()}
        placeholderClassName='h-40'
      >
        {wallet && consumption && plan && (
          <>
            <StatRow columns={4} items={stats} className='pb-4' />

            <div className='grid gap-4 border-t pt-4 sm:grid-cols-2'>
              <div>
                <h3 className='flex items-center gap-1.5 text-sm font-medium'>
                  {t('Settled consumption (last 30 days)')}
                  <LearnMore
                    triggerProps={{
                      'aria-label': t('Settled consumption (last 30 days)'),
                      className:
                        'size-4 shrink-0 border-0 bg-transparent text-muted-foreground hover:bg-transparent [&_svg]:size-3.5',
                      openOnHover: true,
                      delay: 0,
                    }}
                    contentProps={{ className: 'max-w-72 text-xs leading-5' }}
                  >
                    {t(
                      'What users were charged for settled requests in the last 30 days. This is user price, not upstream cost.'
                    )}
                  </LearnMore>
                </h3>
                <dl className='mt-2 space-y-1 text-sm'>
                  <div className='flex justify-between gap-3'>
                    <dt className='text-muted-foreground'>
                      <MetricLabel
                        label={t('Total')}
                        hint={t('Wallet and Token Plan free usage added up.')}
                      />
                    </dt>
                    <dd className='tabular-nums'>{money(consumption.total)}</dd>
                  </div>
                  <div className='flex justify-between gap-3'>
                    <dt className='text-muted-foreground'>
                      <MetricLabel
                        label={t('Wallet balance spent')}
                        hint={t('The part paid from the user wallet balance.')}
                      />
                    </dt>
                    <dd className='tabular-nums'>
                      {money(consumption.wallet)}
                    </dd>
                  </div>
                  <div className='flex justify-between gap-3'>
                    <dt className='text-muted-foreground'>
                      <MetricLabel
                        label={t('Gift credit spent')}
                        hint={t(
                          'The part of the wallet spend paid from gifted balance.'
                        )}
                      />
                    </dt>
                    <dd className='tabular-nums'>
                      {money(consumption.gift_consumed)}
                    </dd>
                  </div>
                  <div className='flex justify-between gap-3'>
                    <dt className='text-muted-foreground'>
                      <MetricLabel
                        label={t('Token Plan free usage')}
                        hint={t(
                          'The part the Token Plan allowance covered for free.'
                        )}
                      />
                    </dt>
                    <dd className='tabular-nums'>
                      {money(consumption.plan_free)}
                    </dd>
                  </div>
                </dl>
              </div>
              <div>
                <h3 className='flex flex-wrap items-center gap-2 text-sm font-medium'>
                  {t('Token Plan cycles')}
                  <LearnMore
                    triggerProps={{
                      'aria-label': t('Token Plan cycles'),
                      className:
                        'size-4 shrink-0 border-0 bg-transparent text-muted-foreground hover:bg-transparent [&_svg]:size-3.5',
                      openOnHover: true,
                      delay: 0,
                    }}
                    contentProps={{ className: 'max-w-72 text-xs leading-5' }}
                  >
                    {t(
                      'Quota granted in the current cycles. Each user cycle ends on a different day.'
                    )}
                  </LearnMore>
                  <Link
                    to='/token-plan-statistics'
                    className='text-xs font-normal underline underline-offset-4'
                  >
                    {t('View details')}
                  </Link>
                </h3>
                <dl className='mt-2 space-y-1 text-sm'>
                  <div className='flex justify-between gap-3'>
                    <dt className='text-muted-foreground'>
                      <MetricLabel
                        label={t('Activated users')}
                        hint={t('Users who have activated a Token Plan cycle.')}
                      />
                    </dt>
                    <dd className='tabular-nums'>
                      {plan.activated_users} / {plan.users}
                    </dd>
                  </div>
                  <div className='flex justify-between gap-3'>
                    <dt className='text-muted-foreground'>{t('Total')}</dt>
                    <dd className='tabular-nums'>{money(plan.total_quota)}</dd>
                  </div>
                  <div className='flex justify-between gap-3'>
                    <dt className='text-muted-foreground'>{t('Used')}</dt>
                    <dd className='tabular-nums'>{money(plan.used_quota)}</dd>
                  </div>
                  <div className='flex justify-between gap-3'>
                    <dt className='text-muted-foreground'>{t('Remaining')}</dt>
                    <dd className='tabular-nums'>
                      {money(plan.remaining_quota)}
                    </dd>
                  </div>
                </dl>
                <p className='text-muted-foreground mt-2 text-xs'>
                  {t('Each user cycle ends on a different day.')}
                </p>
              </div>
            </div>
          </>
        )}

        {detailsOpen && (
          <WalletSourceDialog
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
          />
        )}
      </SectionPanel>
    </section>
  )
}
