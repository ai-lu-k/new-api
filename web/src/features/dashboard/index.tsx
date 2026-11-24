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
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { Eye, EyeOff } from 'lucide-react'
import { useState, useCallback, useMemo, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import {
  sharedElementName,
  useSharedName,
} from '@/components/motion/use-shared-name'
import { FadeIn } from '@/components/page-transition'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ROLE } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { ModelsChartPreferences } from './components/models/models-chart-preferences'
import { ModelsFilter } from './components/models/models-filter-dialog'
import { OverviewDashboard } from './components/overview/overview-dashboard'
import { DEFAULT_TIME_GRANULARITY } from './constants'
import {
  buildDefaultDashboardFilters,
  getDefaultDays,
  getSavedChartPreferences,
  getSavedGranularity,
  saveChartPreferences,
} from './lib'
import {
  type DashboardSectionId,
  DASHBOARD_DEFAULT_SECTION,
  DASHBOARD_SECTION_IDS,
} from './section-registry'
import type {
  DashboardChartPreferences,
  DashboardFilters,
  QuotaDataItem,
  UserChartsFilters,
} from './types'

const route = getRouteApi('/_authenticated/dashboard/$section')

const LOG_STAT_CARD_FALLBACK_KEYS = [
  'count',
  'quota',
  'tokens',
  'average-rpm',
  'average-tpm',
] as const

const LazyLogStatCards = lazy(() =>
  import('./components/models/log-stat-cards').then((m) => ({
    default: m.LogStatCards,
  }))
)

const LazyModelCharts = lazy(() =>
  import('./components/models/model-charts').then((m) => ({
    default: m.ModelCharts,
  }))
)

const LazyConsumptionDistributionChart = lazy(() =>
  import('./components/models/consumption-distribution-chart').then((m) => ({
    default: m.ConsumptionDistributionChart,
  }))
)

const LazyPerformanceOverview = lazy(() =>
  import('./components/models/performance-overview').then((m) => ({
    default: m.PerformanceOverview,
  }))
)

const LazyUserCharts = lazy(() =>
  import('./components/users/user-charts').then((m) => ({
    default: m.UserCharts,
  }))
)

const LazyFlowCharts = lazy(() =>
  import('./components/flow/flow-charts').then((m) => ({
    default: m.FlowCharts,
  }))
)

function LogStatCardsFallback() {
  // The lazy band lands one frame after the navigation, so the skeleton claims
  // the same name as the loaded row: the overview → models handoff morphs on the
  // first visit instead of dropping out of the transition.
  const bandName = useSharedName(sharedElementName('card', 'model-usage'))

  return (
    <div
      {...bandName}
      className='grid min-w-0 grid-cols-2 gap-y-4 lg:grid-cols-5 lg:divide-x'
    >
      {LOG_STAT_CARD_FALLBACK_KEYS.map((key) => (
        <div key={key} className='min-w-0 pe-4 not-first:ps-4'>
          <Skeleton className='h-3.5 w-16' />
          <Skeleton className='mt-2 h-7 w-24' />
        </div>
      ))}
    </div>
  )
}

/** Reserves the block's heading and body so a chart does not shift the page. */
function SectionPanelFallback(props: { placeholderClassName: string }) {
  return (
    <div className='border-t-foreground flex min-w-0 flex-col border-t'>
      <div className='py-3'>
        <Skeleton className='h-6 w-40' />
      </div>
      <Skeleton className={cn('w-full', props.placeholderClassName)} />
    </div>
  )
}

const SECTION_META: Record<DashboardSectionId, { titleKey: string }> = {
  overview: {
    titleKey: 'Overview',
  },
  models: {
    titleKey: 'Model Call Analytics',
  },
  flow: {
    titleKey: 'Flow',
  },
  users: {
    titleKey: 'User Analytics',
  },
}

export function Dashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const params = route.useParams()
  const userRole = useAuthStore((state) => state.auth.user?.role)
  const activeSection = (params.section ??
    DASHBOARD_DEFAULT_SECTION) as DashboardSectionId

  const [modelData, setModelData] = useState<QuotaDataItem[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [chartPreferences, setChartPreferences] =
    useState<DashboardChartPreferences>(() => getSavedChartPreferences())
  const [modelFilters, setModelFilters] = useState<DashboardFilters>(() =>
    buildDefaultDashboardFilters(getSavedChartPreferences())
  )
  const [userChartsFilters, setUserChartsFilters] = useState<UserChartsFilters>(
    () => {
      const granularity = getSavedGranularity()
      return {
        timeGranularity: granularity,
        selectedRange: getDefaultDays(granularity),
        topUserLimit: 10,
      }
    }
  )
  const [flowSensitiveVisible, setFlowSensitiveVisible] = useState(true)

  const handleFilterChange = useCallback((filters: DashboardFilters) => {
    setModelFilters(filters)
  }, [])

  const handleResetFilters = useCallback(() => {
    setModelFilters(buildDefaultDashboardFilters(chartPreferences))
  }, [chartPreferences])

  const handleDataUpdate = useCallback(
    (data: QuotaDataItem[], loading: boolean) => {
      setModelData(data)
      setDataLoading(loading)
    },
    []
  )

  const handleChartPreferencesChange = useCallback(
    (preferences: DashboardChartPreferences) => {
      setChartPreferences(preferences)
      setModelFilters(buildDefaultDashboardFilters(preferences))
      saveChartPreferences(preferences)
    },
    []
  )

  const meta = SECTION_META[activeSection] ?? SECTION_META.overview
  const isAdmin = Boolean(userRole && userRole >= ROLE.ADMIN)
  const visibleSections = useMemo(
    () =>
      DASHBOARD_SECTION_IDS.filter(
        (section) => section !== 'overview' && (section !== 'users' || isAdmin)
      ),
    [isAdmin]
  )
  const handleSectionChange = useCallback(
    (section: string) => {
      void navigate({
        to: '/dashboard/$section',
        params: { section: section as DashboardSectionId },
      })
    },
    [navigate]
  )
  const showSectionTabs =
    activeSection !== 'overview' && visibleSections.length > 1
  const modelActions =
    activeSection === 'models' ? (
      <>
        <ModelsChartPreferences
          preferences={chartPreferences}
          onPreferencesChange={handleChartPreferencesChange}
        />
        <ModelsFilter
          preferences={chartPreferences}
          currentFilters={modelFilters}
          onFilterChange={handleFilterChange}
          onReset={handleResetFilters}
        />
      </>
    ) : null
  const flowActions =
    activeSection === 'flow' ? (
      <>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='ghost'
                size='icon'
                onClick={() => setFlowSensitiveVisible((prev) => !prev)}
                aria-label={
                  flowSensitiveVisible
                    ? t('Hide sensitive data')
                    : t('Show sensitive data')
                }
                className='text-muted-foreground hover:text-foreground size-8'
              />
            }
          >
            {flowSensitiveVisible ? <Eye /> : <EyeOff />}
          </TooltipTrigger>
          <TooltipContent>
            {flowSensitiveVisible
              ? t('Hide sensitive data')
              : t('Show sensitive data')}
          </TooltipContent>
        </Tooltip>
        <ModelsFilter
          preferences={chartPreferences}
          currentFilters={modelFilters}
          onFilterChange={handleFilterChange}
          onReset={handleResetFilters}
          titleKey='Flow Filters'
          descriptionKey='Filter the traffic flow view by time range and user.'
        />
      </>
    ) : null
  const sectionActions = modelActions ?? flowActions

  if (activeSection === 'overview') {
    return <OverviewDashboard />
  }

  return (
    <SectionPageLayout pageIndex={<>{t('Personal workspace')} / 04</>}>
      <SectionPageLayout.Title>{t(meta.titleKey)}</SectionPageLayout.Title>
      {/* Every section carries one line of description: without it the header
          shrinks on a switch and the tabs jump up under the pointer. */}
      <SectionPageLayout.Description>
        {activeSection === 'flow'
          ? t('How traffic is split from token to group to model.')
          : t('Aggregated usage metrics and trend charts.')}
      </SectionPageLayout.Description>
      <SectionPageLayout.Content>
        <div className='space-y-3 sm:space-y-4'>
          <div className='flex flex-wrap items-center justify-between gap-1.5 sm:gap-2'>
            {showSectionTabs ? (
              <Tabs value={activeSection} onValueChange={handleSectionChange}>
                <TabsList className='relative max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto'>
                  {/* The black block is one element that travels between the
                      tabs; the labels sit above it and only swap colour. */}
                  {visibleSections.map((section) => (
                    <TabsTrigger
                      key={section}
                      value={section}
                      className='data-active:text-background relative z-10 data-active:bg-transparent!'
                    >
                      {t(SECTION_META[section].titleKey)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            ) : (
              <div />
            )}
            {sectionActions != null && (
              <div className='flex shrink-0 flex-wrap items-center gap-1.5 sm:gap-2'>
                {sectionActions}
              </div>
            )}
          </div>
          {/* Keyed by the section, so a switch mounts a new panel and it
              arrives with the tab entrance (220ms fade, 4px rise) instead of
              replacing the previous one between two frames. */}
          <div
            key={activeSection}
            data-tab-switch-panel=''
            className='space-y-3 sm:space-y-4'
          >
            {activeSection === 'models' && (
              <>
                <FadeIn>
                  <Suspense fallback={<LogStatCardsFallback />}>
                    <LazyLogStatCards
                      filters={modelFilters}
                      onDataUpdate={handleDataUpdate}
                    />
                  </Suspense>
                </FadeIn>
                {isAdmin && (
                  <FadeIn delay={0.05}>
                    <Suspense
                      fallback={
                        <SectionPanelFallback placeholderClassName='h-12' />
                      }
                    >
                      <LazyPerformanceOverview />
                    </Suspense>
                  </FadeIn>
                )}
                <FadeIn delay={0.1}>
                  <Suspense
                    fallback={
                      <SectionPanelFallback placeholderClassName='h-96' />
                    }
                  >
                    <LazyConsumptionDistributionChart
                      data={modelData}
                      loading={dataLoading}
                      defaultChartType={
                        chartPreferences.consumptionDistributionChart
                      }
                      timeGranularity={
                        modelFilters.time_granularity ||
                        DEFAULT_TIME_GRANULARITY
                      }
                    />
                  </Suspense>
                </FadeIn>
                <FadeIn delay={0.15}>
                  <Suspense
                    fallback={
                      <SectionPanelFallback placeholderClassName='h-96' />
                    }
                  >
                    <LazyModelCharts
                      data={modelData}
                      loading={dataLoading}
                      defaultChartTab={chartPreferences.modelAnalyticsChart}
                      timeGranularity={
                        modelFilters.time_granularity ||
                        DEFAULT_TIME_GRANULARITY
                      }
                    />
                  </Suspense>
                </FadeIn>
              </>
            )}
            {activeSection === 'users' && (
              <FadeIn>
                <Suspense
                  fallback={
                    <SectionPanelFallback placeholderClassName='h-96' />
                  }
                >
                  <LazyUserCharts
                    filters={userChartsFilters}
                    onFiltersChange={setUserChartsFilters}
                  />
                </Suspense>
              </FadeIn>
            )}
            {activeSection === 'flow' && (
              <FadeIn>
                <Suspense
                  fallback={
                    <SectionPanelFallback placeholderClassName='h-[560px]' />
                  }
                >
                  <LazyFlowCharts
                    filters={modelFilters}
                    sensitiveVisible={flowSensitiveVisible}
                  />
                </Suspense>
              </FadeIn>
            )}
          </div>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
