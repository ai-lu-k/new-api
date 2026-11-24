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
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ResetCouponsPanel } from '@/features/reset-coupons'
import {
  PlanUsageOverview,
  PlanUsageTrendPanel,
  PlanUsageUsers,
  type PlanTrendUser,
} from '@/features/token-plan-statistics'
import { useAuthStore } from '@/stores/auth-store'

import { TOKEN_PLAN_TABS, type TokenPlanTab } from './tabs'

function isTokenPlanTab(value: unknown): value is TokenPlanTab {
  return (
    typeof value === 'string' &&
    (TOKEN_PLAN_TABS as readonly string[]).includes(value)
  )
}

export function TokenPlanAdmin(props: {
  tab: TokenPlanTab
  onTabChange: (tab: TokenPlanTab) => void
}) {
  const { t } = useTranslation()
  const identity = useAuthStore(
    (state) => `${state.auth.user?.id}:${state.auth.session?.sid}`
  )
  // A user inspected on one section stays selected while the administrator
  // moves between sections; nothing is sent to the server until a grant is
  // previewed and confirmed.
  const [trendUser, setTrendUser] = useState<PlanTrendUser | null>(null)
  const [grantRecipient, setGrantRecipient] = useState<PlanTrendUser | null>(
    null
  )
  // Sections load on first visit and stay mounted, so switching back keeps
  // search, paging and results while unvisited sections issue no requests.
  const [visited, setVisited] = useState<ReadonlySet<TokenPlanTab>>(
    () => new Set<TokenPlanTab>([props.tab])
  )
  useEffect(() => {
    setVisited((previous) =>
      previous.has(props.tab) ? previous : new Set(previous).add(props.tab)
    )
  }, [props.tab])
  const onTabChange = props.onTabChange
  const showTrend = useCallback(
    (user: PlanTrendUser) => {
      setTrendUser(user)
      onTabChange('trend')
    },
    [onTabChange]
  )
  const grantCoupons = useCallback(
    (user: PlanTrendUser) => {
      setGrantRecipient(user)
      onTabChange('coupons')
    },
    [onTabChange]
  )
  const loaded = (tab: TokenPlanTab) => visited.has(tab) || tab === props.tab

  return (
    <SectionPageLayout pageIndex={<>{t('Admin area')} / 09</>}>
      <SectionPageLayout.Title>{t('Token Plan')}</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t('Allowances, cycles and reset coupons granted to ordinary users.')}
      </SectionPageLayout.Description>
      <SectionPageLayout.Content>
        <Tabs
          value={props.tab}
          onValueChange={(value) => {
            if (isTokenPlanTab(value)) onTabChange(value)
          }}
        >
          {/* Same primitive as `TabSwitch` (sliding indicator + direction
              aware panel cross), but the panels stay mounted on purpose:
              switching back keeps each section's filters and page, and an
              unvisited section still issues no request (contract §9.1). */}
          <TabsList
            variant='line'
            className='relative max-w-full overflow-x-auto'
          >
            <TabsTrigger value='overview'>{t('Usage overview')}</TabsTrigger>
            <TabsTrigger value='users'>{t('User details')}</TabsTrigger>
            <TabsTrigger value='trend'>{t('Usage trend')}</TabsTrigger>
            <TabsTrigger value='coupons'>{t('Voucher management')}</TabsTrigger>
          </TabsList>
          <TabsContent value='overview' keepMounted data-tab-switch-panel=''>
            {loaded('overview') && <PlanUsageOverview identity={identity} />}
          </TabsContent>
          <TabsContent value='users' keepMounted data-tab-switch-panel=''>
            {loaded('users') && (
              <PlanUsageUsers
                identity={identity}
                onSelectUser={showTrend}
                onGrantCoupons={grantCoupons}
              />
            )}
          </TabsContent>
          <TabsContent value='trend' keepMounted data-tab-switch-panel=''>
            {loaded('trend') && (
              <PlanUsageTrendPanel
                identity={identity}
                user={trendUser}
                onClearUser={() => setTrendUser(null)}
              />
            )}
          </TabsContent>
          <TabsContent value='coupons' keepMounted data-tab-switch-panel=''>
            {loaded('coupons') && (
              <ResetCouponsPanel
                recipient={grantRecipient}
                onClearRecipient={() => setGrantRecipient(null)}
              />
            )}
          </TabsContent>
        </Tabs>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
