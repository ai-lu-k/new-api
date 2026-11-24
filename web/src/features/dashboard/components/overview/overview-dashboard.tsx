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
import './overview-typography.css'
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
import { SectionHeading } from '@/components/section-heading'
import { Button } from '@/components/ui/button'
import { getApiKeys } from '@/features/keys/api'
import { ApiKeysMutateDrawer } from '@/features/keys/components/api-keys-mutate-drawer'
import {
  ApiKeysProvider,
  useApiKeys,
} from '@/features/keys/components/api-keys-provider'
import { CheckinCalendarCard } from '@/features/profile/components/checkin-calendar-card'
import { useStatus } from '@/hooks/use-status'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { useDashboardContentVisibility } from '../../hooks/use-status-data'
import { AnnouncementsPanel } from './announcements-panel'
import { ApiInfoPanel } from './api-info-panel'
import { FAQPanel } from './faq-panel'
import { MyKeys } from './my-keys'
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

function OverviewPage() {
  const { t } = useTranslation()
  const { open, setOpen, refreshTrigger } = useApiKeys()
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

  const apiKeysQuery = useQuery({
    queryKey: ['dashboard', 'overview', 'api-keys', refreshTrigger],
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
  const showContentPanels = showApiInfoPanel || showFAQPanel || showUptimePanel

  return (
    <SectionPageLayout
      stackActionsOnMobile
      pageIndex={<>{t('Personal workspace')} / 01</>}
    >
      <SectionPageLayout.Title>{t('Overview')}</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t('Balance, connections, and recent activity at a glance.')}
      </SectionPageLayout.Description>
      <SectionPageLayout.Actions>
        <Button variant='outline' render={<Link to='/wallet' />}>
          {t('Top-up')}
        </Button>
        <Button onClick={() => setOpen('create')}>{t('Create API Key')}</Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='overview-typography flex flex-col gap-6'>
          <SummaryCards
            checkin={
              checkinEnabled && (
                <CheckinCalendarCard
                  compact
                  showSummary
                  calendarInDialog
                  checkinEnabled
                  turnstileEnabled={Boolean(
                    status?.turnstile_check && turnstileSiteKey
                  )}
                  turnstileSiteKey={turnstileSiteKey}
                  geetestCaptchaId={
                    typeof status?.geetest_captcha_id === 'string'
                      ? status.geetest_captcha_id
                      : ''
                  }
                />
              )
            }
          />
          {showSetupBanner && (
            <div>
              <SetupBanner steps={startSteps} />
            </div>
          )}
          <div className='grid min-w-0 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1.83fr)_minmax(0,1fr)]'>
            <RecentRequests compact />
            <div
              className='min-w-0 space-y-4'
              data-slot='overview-tools-column'
            >
              <MyKeys
                keys={apiKeys}
                total={apiKeysQuery.data?.total ?? 0}
                loading={apiKeysQuery.isPending}
              />
            </div>
          </div>
          {showAnnouncementsPanel && <AnnouncementsPanel />}
          {showContentPanels && (
            <section className='space-y-5'>
              <SectionHeading as='h2' title={t('Connections and help')} />
              <CardStaggerContainer className='grid grid-cols-1 items-start gap-5 lg:grid-cols-3'>
                {showApiInfoPanel && (
                  <CardStaggerItem>
                    <ApiInfoPanel />
                  </CardStaggerItem>
                )}
                {showFAQPanel && (
                  <CardStaggerItem>
                    <FAQPanel />
                  </CardStaggerItem>
                )}
                {showUptimePanel && (
                  <CardStaggerItem>
                    <UptimePanel />
                  </CardStaggerItem>
                )}
              </CardStaggerContainer>
            </section>
          )}
        </div>
        {open === 'create' && (
          <ApiKeysMutateDrawer
            open
            onOpenChange={(visible) => !visible && setOpen(null)}
          />
        )}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

export function OverviewDashboard() {
  return (
    <ApiKeysProvider>
      <OverviewPage />
    </ApiKeysProvider>
  )
}
