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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getHubStatus } from './api'
import { AccountsTab } from './components/accounts-tab'
import { AgentsTab } from './components/agents-tab'
import { AnalyticsTab } from './components/analytics-tab'
import { GatewayTab } from './components/gateway-tab'
import { LogsTab } from './components/logs-tab'
import { SettingsTab } from './components/settings-tab'
import { TasksTab } from './components/tasks-tab'

export type WorkBuddyTab =
  | 'gateway'
  | 'accounts'
  | 'tasks'
  | 'analytics'
  | 'agents'
  | 'settings'
  | 'logs'

/**
 * Tab order follows the hub's own dashboard, so an operator who knows the old
 * panel finds the same things in the same places.
 */
const TABS: { key: WorkBuddyTab; label: string }[] = [
  { key: 'gateway', label: 'Gateway' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'tasks', label: 'Tasks and rewards' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'agents', label: 'Agent config' },
  { key: 'settings', label: 'Settings' },
  { key: 'logs', label: 'Runtime logs' },
]

/**
 * The WorkBuddy console: the WorkBuddy hub's own dashboard, rebuilt inside
 * new-api so it shares this site's session, permissions and layout instead of
 * asking for a second password. The hub still owns the accounts and the
 * scheduler; this page reads and drives it through /api/workbuddy.
 */
export function WorkBuddyPool(props: { tab?: WorkBuddyTab }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<WorkBuddyTab>(props.tab ?? 'gateway')
  const status = useQuery({
    queryKey: ['workbuddy-hub-status'],
    queryFn: async () => requireServerSuccess(await getHubStatus()),
    refetchInterval: 60_000,
  })
  const connection = status.data?.data
  const offline = status.isSuccess && connection && !connection.reachable

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <span className='inline-flex min-w-0 items-center gap-2'>
          <span className='truncate'>{t('WorkBuddy')}</span>
          <Badge variant='outline' className='shrink-0'>
            Root
          </Badge>
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t(
          'The WorkBuddy account pool, its request log and its scheduler, controlled from this site. Accounts keep running in the gateway; this page only reads and drives it.'
        )}
      </SectionPageLayout.Description>
      <SectionPageLayout.Content>
        {offline && (
          <div className='bg-card mb-4 rounded-xl border border-dashed px-4 py-3 text-sm'>
            <p className='font-medium'>
              {t('The WorkBuddy gateway is unreachable')}
            </p>
            <p className='text-muted-foreground mt-1'>
              {connection?.error ||
                t('Check the address and panel password on the Settings tab.')}
            </p>
          </div>
        )}
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as WorkBuddyTab)}
        >
          <TabsList className='flex-wrap'>
            {TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {t(tab.label)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value='gateway' className='space-y-6'>
            <GatewayTab />
          </TabsContent>
          <TabsContent value='accounts' className='space-y-6'>
            <AccountsTab />
          </TabsContent>
          <TabsContent value='tasks' className='space-y-6'>
            <TasksTab />
          </TabsContent>
          <TabsContent value='analytics' className='space-y-6'>
            <AnalyticsTab />
          </TabsContent>
          <TabsContent value='agents' className='space-y-6'>
            <AgentsTab />
          </TabsContent>
          <TabsContent value='settings' className='space-y-6'>
            <SettingsTab />
          </TabsContent>
          <TabsContent value='logs' className='space-y-6'>
            <LogsTab />
          </TabsContent>
        </Tabs>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
