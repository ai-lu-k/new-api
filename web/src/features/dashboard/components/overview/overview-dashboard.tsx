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
import { ArrowRight, Check, Circle } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import {
  CardStaggerContainer,
  CardStaggerItem,
} from '@/components/page-transition'
import { getApiKeys } from '@/features/keys/api'
import { CheckinCalendarCard } from '@/features/profile/components/checkin-calendar-card'
import { UsageLevelCard } from '@/features/usage-level/components/usage-level-card'
import { useStatus } from '@/hooks/use-status'
import { ROLE } from '@/lib/roles'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { useDashboardContentVisibility } from '../../hooks/use-status-data'
import { AccountIdentity } from './account-identity'
import { AnnouncementsPanel } from './announcements-panel'
import { ApiInfoPanel } from './api-info-panel'
import { FAQPanel } from './faq-panel'
import { MyKeys } from './my-keys'
import { PerformanceHealthPanel } from './performance-health-panel'
import { RecentRequests } from './recent-requests'
import { SummaryCards } from './summary-cards'
import { UptimePanel } from './uptime-panel'

interface StartStep {
  title: string
  to: '/keys' | '/wallet' | '/playground'
  completed: boolean
}

/**
 * One line listing what a new account still has to do. It goes away by
 * itself once every step is done.
 */
function SetupBanner(props: { steps: StartStep[] }) {
  const { t } = useTranslation()
  const completed = props.steps.filter((step) => step.completed).length

  return (
    <section
      aria-label={t('Get started')}
      className='bg-card flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border px-4 py-2.5 text-sm'
    >
      <span className='font-medium'>{t('Get started')}</span>
      <span className='text-muted-foreground text-xs tabular-nums'>
        {t('Setup progress: {{completed}}/{{total}}', {
          completed,
          total: props.steps.length,
        })}
      </span>
      <ol className='flex flex-wrap items-center gap-x-4 gap-y-1'>
        {props.steps.map((step) => (
          <li key={step.to}>
            {step.completed ? (
              <span className='text-muted-foreground flex items-center gap-1.5'>
                <Check className='text-success size-3.5' aria-hidden='true' />
                <span className='line-through'>{step.title}</span>
              </span>
            ) : (
              <Link
                to={step.to}
                className='hover:text-primary flex items-center gap-1.5 underline-offset-4 hover:underline'
              >
                <Circle
                  className='text-muted-foreground size-3.5'
                  aria-hidden='true'
                />
                {step.title}
              </Link>
            )}
          </li>
        ))}
      </ol>
      <Link
        to='/'
        className='text-muted-foreground hover:text-foreground ms-auto flex items-center gap-1'
      >
        {t('Quick Start')}
        <ArrowRight className='size-3.5' aria-hidden='true' />
      </Link>
    </section>
  )
}

export function OverviewDashboard() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const {
    apiInfo: showApiInfoPanel,
    announcements: showAnnouncementsPanel,
    faq: showFAQPanel,
    uptimeKuma: showUptimePanel,
  } = useDashboardContentVisibility()

  const requestCount = Number(user?.request_count ?? 0)
  const remainQuota = Number(user?.quota ?? 0)
  const usedQuota = Number(user?.used_quota ?? 0)
  const isAdmin = Boolean(user?.role && user.role >= ROLE.ADMIN)

  const apiKeysQuery = useQuery({
    queryKey: ['dashboard', 'overview', 'api-keys'],
    queryFn: async () => {
      const result = requireServerSuccess(await getApiKeys({ p: 1, size: 10 }))
      return {
        items: result.data?.items ?? [],
        total: result.data?.total ?? 0,
      }
    },
    staleTime: 60 * 1000,
  })
  const apiKeys = apiKeysQuery.data?.items ?? []
  const hasKey = apiKeys.length > 0

  const { status } = useStatus()
  const checkinEnabled = status?.checkin_enabled === true
  const turnstileSiteKey =
    typeof status?.turnstile_site_key === 'string'
      ? status.turnstile_site_key
      : ''

  const startSteps = useMemo<StartStep[]>(
    () => [
      { title: t('Create API Key'), to: '/keys', completed: hasKey },
      {
        title: t('Add credits'),
        to: '/wallet',
        completed: remainQuota > 0 || usedQuota > 0,
      },
      {
        title: t('Send a request'),
        to: '/playground',
        completed: requestCount > 0,
      },
    ],
    [hasKey, remainQuota, requestCount, t, usedQuota]
  )

  // Nothing is said until the keys are known, so the banner does not flash
  // at someone who finished long ago.
  const showSetupBanner =
    apiKeysQuery.isFetched &&
    Boolean(user) &&
    startSteps.some((step) => !step.completed)
  const showLeftContentPanels =
    isAdmin || showApiInfoPanel || showAnnouncementsPanel || showFAQPanel
  const showContentPanels = showLeftContentPanels || showUptimePanel

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Overview')}</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t('Monitor balance, usage, and request volume')}
      </SectionPageLayout.Description>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-4'>
          <AccountIdentity />
          {showSetupBanner && <SetupBanner steps={startSteps} />}

          <SummaryCards />
          <UsageLevelCard />

          <div
            className={cn(
              'grid gap-4',
              checkinEnabled && 'xl:grid-cols-[minmax(0,1fr)_22rem]'
            )}
          >
            <div
              className={cn(
                'grid content-start gap-4',
                !checkinEnabled && 'lg:grid-cols-2'
              )}
            >
              <RecentRequests />
              <MyKeys
                keys={apiKeys}
                total={apiKeysQuery.data?.total ?? 0}
                loading={apiKeysQuery.isPending}
              />
            </div>
            {checkinEnabled && (
              <CheckinCalendarCard
                checkinEnabled
                turnstileEnabled={Boolean(
                  status?.turnstile_check && turnstileSiteKey
                )}
                turnstileSiteKey={turnstileSiteKey}
              />
            )}
          </div>

          {showContentPanels && (
            <CardStaggerContainer
              className={cn(
                'grid grid-cols-1 gap-4',
                showLeftContentPanels &&
                  showUptimePanel &&
                  'xl:grid-cols-[minmax(0,1fr)_22rem]'
              )}
            >
              {showLeftContentPanels && (
                <div
                  className={cn(
                    'grid min-w-0 grid-cols-1 gap-4',
                    (showApiInfoPanel ||
                      showAnnouncementsPanel ||
                      showFAQPanel) &&
                      'lg:grid-cols-2'
                  )}
                >
                  {isAdmin && (
                    <CardStaggerItem className='lg:col-span-2'>
                      <PerformanceHealthPanel />
                    </CardStaggerItem>
                  )}
                  {showApiInfoPanel && (
                    <CardStaggerItem>
                      <ApiInfoPanel />
                    </CardStaggerItem>
                  )}
                  {showAnnouncementsPanel && (
                    <CardStaggerItem>
                      <AnnouncementsPanel />
                    </CardStaggerItem>
                  )}
                  {showFAQPanel && (
                    <CardStaggerItem>
                      <FAQPanel />
                    </CardStaggerItem>
                  )}
                </div>
              )}
              {showUptimePanel && (
                <CardStaggerItem>
                  <UptimePanel />
                </CardStaggerItem>
              )}
            </CardStaggerContainer>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
