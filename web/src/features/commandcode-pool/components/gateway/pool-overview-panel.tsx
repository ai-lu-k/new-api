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
import { Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { TitledCard } from '@/components/ui/titled-card'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { commandCodePoolKeys, getPoolState } from '../../api'
import { summarizePool } from '../../lib'
import { PoolQueryState } from '../query-state'

/**
 * The pool at a glance: how many keys can serve, which plans they hold, and how
 * much credit and weekly window the whole pool has left. Credit totals say "—"
 * until at least one key has been read, instead of pretending to be zero.
 */
export function PoolOverviewPanel() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const query = useQuery({
    queryKey: commandCodePoolKeys.pool,
    queryFn: async () => requireServerSuccess(await getPoolState()),
    refetchInterval: 60_000,
  })
  const summary = summarizePool(query.data?.data?.keys ?? [])

  return (
    <TitledCard
      title={t('Pool overview')}
      icon={<Layers />}
      iconTone='info'
      description={t(
        'Keys the proxy holds, the plans behind them, and the credits and weekly windows still left.'
      )}
      action={
        <Badge variant={summary.enabled > 0 ? 'secondary' : 'destructive'}>
          {t('{{enabled}} enabled of {{total}}', {
            enabled: formatNumber(summary.enabled, locale),
            total: formatNumber(summary.total, locale),
          })}
        </Badge>
      }
    >
      <PoolQueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
      >
        <dl className='grid gap-3 text-sm sm:grid-cols-2'>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Credits remaining')}
            </dt>
            <dd className='tabular-nums'>
              {summary.creditsRemaining == null
                ? '—'
                : formatNumber(summary.creditsRemaining, locale)}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Weekly window used')}
            </dt>
            <dd className='tabular-nums'>
              {summary.weeklyUsed == null || summary.weeklyCap == null
                ? '—'
                : t('{{used}} of {{cap}}', {
                    used: formatNumber(summary.weeklyUsed, locale),
                    cap: formatNumber(summary.weeklyCap, locale),
                  })}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Cooling down')}
            </dt>
            <dd className='tabular-nums'>
              {formatNumber(summary.cooling, locale)}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Auto-disabled')}
            </dt>
            <dd className='tabular-nums'>
              {formatNumber(summary.autoDisabled, locale)}
            </dd>
          </div>
          <div className='sm:col-span-2'>
            <dt className='text-muted-foreground text-xs'>
              {t('Plan distribution')}
            </dt>
            <dd className='mt-1 flex flex-wrap gap-1.5'>
              {summary.plans.length === 0 && (
                <span className='text-muted-foreground text-xs'>
                  {t('No plan has been read yet')}
                </span>
              )}
              {summary.plans.map((plan) => (
                <span
                  key={plan.plan}
                  className='bg-muted/60 rounded-md px-1.5 py-0.5 text-xs tabular-nums'
                >
                  {plan.plan} · {formatNumber(plan.count, locale)}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </PoolQueryState>
    </TitledCard>
  )
}
