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
import dayjs from 'dayjs'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { LearnMore } from '@/components/learn-more'
import {
  SectionPanel,
  type SectionPanelStatus,
} from '@/components/section-panel'
import { Badge } from '@/components/ui/badge'
import { formatExpenseAmount } from '@/features/rankings/lib'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getFinanceReserves } from '../api'
import type { FinanceReserveDaily, FinanceReserveExtreme } from '../types'
import { MetricLabel } from './metric-label'

/**
 * The cumulative balance next to the two three-day reserve targets: the
 * seven-day average upstream cost, and the whole consumable stock converted at
 * the same window's cost share. The assumptions live behind the help entry so
 * the page keeps its numbers first.
 */
export function ReserveTargets() {
  const { t, i18n } = useTranslation()
  const query = useQuery({
    queryKey: ['finance-reserves'],
    queryFn: async () => requireServerSuccess(await getFinanceReserves()),
  })
  const money = (value: number) => formatExpenseAmount(value, i18n.language)
  const data = query.data?.data
  const daily = data?.daily
  const extreme = data?.extreme

  const tiles = [
    {
      label: t('Cumulative balance'),
      hint: t(
        'The balance is money received minus money spent since the site began; the period tabs above do not change it.'
      ),
      value: money(data?.baseline.amount ?? 0),
      delta: null,
      detail: t('All time: money received minus money spent'),
    },
    {
      label: t('Daily reserve ({{days}} days)', {
        days: daily?.horizon_days ?? 3,
      }),
      hint: t(
        'The daily reserve is three times the upstream cost actually billed on average over the last seven complete days, free usage included.'
      ),
      value:
        daily?.target === null || daily?.target === undefined
          ? t('Unavailable')
          : money(daily.target),
      delta: (
        <ReserveDelta
          gap={daily?.gap ?? null}
          excess={daily?.excess ?? null}
          unavailable={
            daily?.has_reports ? null : t('No upstream cost report yet')
          }
        />
      ),
      // The two targets answer different questions, so each tile spells its own
      // formula out. Without it the extreme target can land on the daily one and
      // the pair reads as the same number printed twice.
      detail: dailyFormula({ daily, money, t }),
    },
    {
      label: t('Extreme reserve ({{days}} days)', {
        days: extreme?.horizon_days ?? 3,
      }),
      hint: t(
        'The extreme reserve assumes every wallet balance and the remaining Token Plan free quota are spent within three days, counted at 100% of face value.'
      ),
      value:
        extreme?.target === null || extreme?.target === undefined
          ? t('Unavailable')
          : money(extreme.target),
      delta: (
        <ReserveDelta
          gap={extreme?.gap ?? null}
          excess={extreme?.excess ?? null}
          unavailable={null}
        />
      ),
      detail: extremeFormula({ extreme, money, t }),
    },
  ]

  let panelStatus: SectionPanelStatus = 'ready'
  if (query.isLoading) panelStatus = 'loading'
  else if (query.isError) panelStatus = 'error'

  const errorDescription =
    query.error instanceof Error ? query.error.message : undefined

  return (
    <section aria-label={t('Reserve targets')}>
      <SectionPanel
        title={t('Reserve targets')}
        description={t('Updated {{time}}', {
          time: dayjs.unix(data?.as_of ?? 0).format('MM-DD HH:mm'),
        })}
        actions={
          <div className='flex items-center gap-2'>
            <LearnMore
              triggerProps={{
                'aria-label': t('Reserve targets'),
                className:
                  'size-4 shrink-0 border-0 bg-transparent text-muted-foreground hover:bg-transparent [&_svg]:size-3.5',
                openOnHover: true,
                delay: 0,
              }}
              contentProps={{ className: 'max-w-80 text-xs leading-5' }}
            >
              <div className='space-y-1.5'>
                <p>
                  {t(
                    'The balance is money received minus money spent since the site began; the period tabs above do not change it.'
                  )}
                </p>
                <p>
                  {t(
                    'The daily reserve is three times the upstream cost actually billed on average over the last seven complete days, free usage included.'
                  )}
                </p>
                <p>
                  {t(
                    'The extreme reserve assumes every wallet balance and the remaining Token Plan free quota are spent within three days, counted at 100% of face value.'
                  )}
                </p>
                <p>
                  {t(
                    'A CommandCode subscription is paid in advance, so it is not a per-day cost and stays out of both targets.'
                  )}
                </p>
                <p>
                  {t(
                    'There is no per-model upstream cost, so the extreme reserve is a scenario estimate rather than a proven maximum.'
                  )}
                </p>
              </div>
            </LearnMore>
            {daily && !daily.complete ? (
              <Badge variant='warning'>{t('Cost data incomplete')}</Badge>
            ) : null}
          </div>
        }
        status={panelStatus}
        errorMessage={
          errorDescription ?? t('Unable to load the reserve targets.')
        }
        onRetry={() => void query.refetch()}
        placeholderClassName='h-40'
      >
        {data && (
          <>
            <dl className='grid grid-cols-1 sm:grid-cols-3 sm:divide-x'>
              {tiles.map((tile) => (
                <div
                  key={tile.label}
                  className='min-w-0 pe-4 pb-4 not-first:ps-4'
                >
                  <dt className='text-muted-foreground text-xs'>
                    <MetricLabel label={tile.label} hint={tile.hint} />
                  </dt>
                  <dd className='mt-1 text-xl font-semibold tabular-nums'>
                    {tile.value}
                  </dd>
                  {tile.delta && (
                    <div className='mt-1 text-xs'>{tile.delta}</div>
                  )}
                  {tile.detail && (
                    <div className='text-muted-foreground mt-1 text-xs'>
                      {tile.detail}
                    </div>
                  )}
                </div>
              ))}
            </dl>

            {daily &&
              (daily.missing_accounts.length > 0 ||
                daily.stale_accounts.length > 0) && (
                <div className='text-warning space-y-1 border-t pt-3 text-xs'>
                  {daily.missing_accounts.length > 0 && (
                    <p>
                      {t(
                        'No upstream cost report from {{names}}; both targets are estimated lower than reality.',
                        { names: daily.missing_accounts.join(', ') }
                      )}
                    </p>
                  )}
                  {daily.stale_accounts.length > 0 && (
                    <p>
                      {t(
                        'The cost report of {{names}} is more than two days old.',
                        { names: daily.stale_accounts.join(', ') }
                      )}
                    </p>
                  )}
                </div>
              )}
          </>
        )}
      </SectionPanel>
    </section>
  )
}

/** How far the balance is from one target, in the reader's language. */
function ReserveDelta(props: {
  gap: number | null
  excess: number | null
  unavailable: string | null
}) {
  const { t, i18n } = useTranslation()
  if (props.unavailable) {
    return <span className='text-muted-foreground'>{props.unavailable}</span>
  }
  if ((props.gap ?? 0) > 0) {
    return (
      <span className='text-warning'>
        {t('Short of {{amount}}', {
          amount: formatExpenseAmount(props.gap ?? 0, i18n.language),
        })}
      </span>
    )
  }
  return (
    <span className='text-muted-foreground'>
      {t('Above target by {{amount}}', {
        amount: formatExpenseAmount(props.excess ?? 0, i18n.language),
      })}
    </span>
  )
}

/** Up to half a cent, so a rounded snapshot still reads as consistent. */
const TARGET_EPSILON = 0.005

/**
 * The arithmetic behind a target, written out. The "= target" tail only appears
 * when the figures really add up to the target the server sent; a snapshot
 * whose components and target disagree would otherwise print an equation that
 * does not hold, which is worse than printing no equation at all.
 */
function dailyFormula(props: {
  daily: FinanceReserveDaily | undefined
  money: (value: number) => string
  t: TFunction
}): string | null {
  const daily = props.daily
  if (daily?.daily_average === null || daily?.daily_average === undefined) {
    return null
  }
  const basis = `${props.t('Seven-day average {{amount}}', {
    amount: props.money(daily.daily_average),
  })} × ${daily.horizon_days}`
  const computed = daily.daily_average * daily.horizon_days
  if (daily.target === null || daily.target === undefined) {
    return basis
  }
  if (Math.abs(computed - daily.target) > TARGET_EPSILON) {
    return basis
  }
  return `${basis} = ${props.money(daily.target)}`
}

function extremeFormula(props: {
  extreme: FinanceReserveExtreme | undefined
  money: (value: number) => string
  t: TFunction
}): string | null {
  const extreme = props.extreme
  if (!extreme) {
    return null
  }
  const basis = props.t(
    '{{wallet}} in wallets plus {{plan}} in Token Plan quota',
    {
      wallet: props.money(extreme.wallet),
      plan: props.money(extreme.plan_remaining),
    }
  )
  if (extreme.target === null || extreme.target === undefined) {
    return basis
  }
  if (Math.abs(extreme.face_value - extreme.target) > TARGET_EPSILON) {
    return basis
  }
  return `${basis} = ${props.money(extreme.target)}`
}
