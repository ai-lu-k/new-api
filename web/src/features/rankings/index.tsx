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
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'
import { Skeleton } from '@/components/ui/skeleton'
import { AboutContent } from '@/features/about'
import { useStatus } from '@/hooks/use-status'
import { parseHeaderNavModulesFromStatus } from '@/lib/nav-modules'

import { ExpenseLedger, ModelsSection, RankingsHero } from './components'
import { useRankings } from './hooks/use-rankings'
import type { RankingPeriod } from './types'

const VALID_PERIODS = new Set<RankingPeriod>(['today', 'week', 'month', 'year'])

/**
 * One page, three blocks: the site's traffic, what it costs, and what it is.
 * Everything used to sit behind a three-way switch; a reader scrolls now
 * instead of choosing.
 */
export function Rankings() {
  const { t } = useTranslation()
  const search = useSearch({ from: '/rankings/' })
  const navigate = useNavigate()

  const period: RankingPeriod = VALID_PERIODS.has(
    search.period as RankingPeriod
  )
    ? (search.period as RankingPeriod)
    : 'month'

  // The About block follows the site's About switch.
  const { status } = useStatus()
  const showAbout =
    parseHeaderNavModulesFromStatus(status as Record<string, unknown> | null)
      ?.about !== false

  const rankingsQuery = useRankings(period)
  const snapshot = rankingsQuery.data?.data

  const handlePeriodChange = (next: RankingPeriod) => {
    navigate({
      to: '/rankings',
      search: (prev) => ({ ...prev, period: next, section: undefined }),
      viewTransition: false,
    })
  }

  return (
    <PublicLayout showMainContainer={false}>
      <div className='relative'>
        <PageTransition className='relative mx-auto w-full max-w-[1280px] space-y-12 px-3 pb-10 sm:px-6 sm:pb-12 xl:px-8'>
          <RankingsHero />

          {rankingsQuery.isLoading && <RankingsLoading />}
          {!rankingsQuery.isLoading && !snapshot && (
            <ErrorState
              title={t('Unable to load rankings')}
              description={
                rankingsQuery.error instanceof Error
                  ? rankingsQuery.error.message
                  : t('Unable to load rankings data')
              }
              onRetry={() => {
                void rankingsQuery.refetch()
              }}
            />
          )}
          {!rankingsQuery.isLoading && snapshot && (
            <ModelsSection
              history={snapshot.models_history}
              imageHistory={snapshot.image_models_history}
              audioHistory={snapshot.audio_models_history}
              decisionHistory={snapshot.decision_models_history}
              period={period}
              onPeriodChange={handlePeriodChange}
            />
          )}

          <ExpenseLedger />

          {showAbout && <AboutContent />}
        </PageTransition>
      </div>
    </PublicLayout>
  )
}

function RankingsLoading() {
  return (
    <div className='space-y-6'>
      <Skeleton className='h-[420px] w-full' />
      <Skeleton className='h-[360px] w-full' />
    </div>
  )
}
