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
import { lazy, Suspense, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { Reveal } from '@/components/motion/reveal'
import {
  sharedElementName,
  useSharedName,
} from '@/components/motion/use-shared-name'
import { StatRow, type StatRowItem } from '@/components/stat-row'
import { Skeleton } from '@/components/ui/skeleton'
import { getUserDailyQuotaData } from '@/features/dashboard/api'
import { useRecentUsage } from '@/features/dashboard/hooks/use-recent-usage'
import { useUsageSource } from '@/features/dashboard/hooks/use-usage-source'
import { ModelDailyBudgetPanel } from '@/features/model-daily-tokens/components/budget-panel'
import {
  limitedModels,
  useModelDailyBudgets,
} from '@/features/model-daily-tokens/hooks/use-model-daily-budgets'
import { UsageLevelCard } from '@/features/usage-level/components/usage-level-card'
import { USAGE_LEVEL_VISIBLE } from '@/features/usage-level/visibility'
import { useStatus } from '@/hooks/use-status'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatQuota } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { AccountIdentity } from './account-identity'
import { GiftCreditHint } from './gift-credit-hint'

const UsageHeatmap = lazy(() =>
  import('./usage-heatmap').then((module) => ({
    default: module.UsageHeatmap,
  }))
)

export function SummaryCards(props: { checkin?: ReactNode }) {
  const budgets = useModelDailyBudgets()
  // Only a user with limits sees the panel, and only then does the account row
  // give up its right half; everyone else keeps the full width.
  const hasModelLimits = limitedModels(budgets.data).length > 0
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const user = useAuthStore((state) => state.auth.user)
  const { loading } = useStatus()
  const dailyRange = useMemo(() => {
    const end = Math.floor(Date.now() / 1000)
    // Nine months of Asia/Shanghai days.
    return { start_timestamp: end - 273 * 86400, end_timestamp: end }
  }, [])
  const remainQuota = Number(user?.quota ?? 0)
  const balance = formatQuota(remainQuota)
  // The same figure reappears as the first card of Model Call Analytics; the
  // name lets it travel there instead of a new block appearing from nowhere.
  const modelUsageName = useSharedName(sharedElementName('card', 'model-usage'))
  const usageSource = useUsageSource()
  const usage = useRecentUsage()
  const dailyUsageQuery = useQuery({
    queryKey: [
      'dashboard',
      'overview',
      'daily-usage',
      dailyRange.start_timestamp,
      dailyRange.end_timestamp,
    ],
    queryFn: async () =>
      requireServerSuccess(await getUserDailyQuotaData(dailyRange)),
    staleTime: 60 * 1000,
  })
  const items: StatRowItem[] = [
    {
      key: 'credit-remaining',
      label: t('Credit remaining'),
      value: balance,
      valueText: balance,
      tone: remainQuota <= 0 ? 'destructive' : 'default',
      loading,
      hint: loading ? undefined : (
        <GiftCreditHint
          usageSource={usageSource.data}
          creditRemaining={remainQuota}
        />
      ),
    },
    {
      key: 'usage-24h',
      label: t('24h usage'),
      value: usage.isError ? (
        <ErrorState
          compact
          inline
          title={t('Failed to load')}
          description='—'
          onRetry={() => {
            void usage.refetch()
          }}
        />
      ) : (
        formatQuota(usage.total)
      ),
      loading: usage.isPending,
    },
    {
      key: 'total-consumption',
      label: t('Total consumption'),
      value: formatQuota(Number(user?.used_quota ?? 0)),
      valueText: formatQuota(Number(user?.used_quota ?? 0)),
      loading,
    },
    {
      key: 'request-count',
      label: t('Request Count'),
      value: formatNumber(Number(user?.request_count ?? 0), locale),
      valueText: formatNumber(Number(user?.request_count ?? 0), locale),
      loading,
    },
  ]

  return (
    <section
      aria-label={t('Overview')}
      className='grid min-w-0 gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1.83fr)_minmax(0,1fr)]'
    >
      <section
        aria-label={t('Credit remaining')}
        className={cn(
          'border-border min-w-0 space-y-3 border-y py-4',
          !hasModelLimits && 'lg:col-span-2'
        )}
      >
        <Reveal>
          <AccountIdentity />
        </Reveal>
        <Reveal delay={0.04}>
          <div {...modelUsageName}>
            <StatRow
              columns={4}
              size='analytics'
              items={items}
              className='gap-y-4'
            />
          </div>
        </Reveal>
        {USAGE_LEVEL_VISIBLE && !loading && (
          <div className='max-w-md'>
            <UsageLevelCard compact layout='overview' />
          </div>
        )}
      </section>
      {hasModelLimits && (
        <Reveal delay={0.1} className='min-w-0 lg:col-start-2 lg:row-start-1'>
          <ModelDailyBudgetPanel />
        </Reveal>
      )}
      {props.checkin && (
        <Reveal delay={0.12} className='min-w-0 lg:col-start-2 lg:row-start-2'>
          <div data-slot='checkin-column' className='h-full'>
            {props.checkin}
          </div>
        </Reveal>
      )}
      <Reveal
        delay={0.08}
        className={cn(
          'min-w-0',
          props.checkin ? 'lg:col-start-1 lg:row-start-2' : 'lg:col-span-2'
        )}
      >
        <Suspense fallback={<Skeleton className='h-60 w-full rounded-xl' />}>
          <UsageHeatmap
            data={dailyUsageQuery.data?.data ?? []}
            start={dailyRange.start_timestamp}
            end={dailyRange.end_timestamp}
            loading={dailyUsageQuery.isFetching}
            error={dailyUsageQuery.isError}
            onRetry={() => {
              void dailyUsageQuery.refetch()
            }}
          />
        </Suspense>
      </Reveal>
    </section>
  )
}
