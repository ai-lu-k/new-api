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

import { commandCodePoolKeys, getPoolStatus } from './api'
import { AccountsTab } from './components/accounts-tab'
import { GatewayTab } from './components/gateway-tab'
import { SettingsTab } from './components/settings-tab'

export type CommandCodePoolTab = 'gateway' | 'accounts' | 'settings'

const TABS: { key: CommandCodePoolTab; label: string }[] = [
  { key: 'gateway', label: 'Gateway' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'settings', label: 'Settings' },
]

/**
 * The CommandCode console: the key pool of a CommandCode proxy, read and
 * driven from this site. The proxy keeps the keys, the load balancing state and
 * the credits; this page forwards a fixed set of its admin calls through
 * /api/commandcode-pool.
 */
export function CommandCodePool(props: { tab?: CommandCodePoolTab }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<CommandCodePoolTab>(props.tab ?? 'gateway')
  const status = useQuery({
    queryKey: commandCodePoolKeys.status,
    queryFn: async () => requireServerSuccess(await getPoolStatus()),
    refetchInterval: 60_000,
  })
  const connection = status.data?.data
  const offline = status.isSuccess && connection && !connection.reachable

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <span className='inline-flex min-w-0 items-center gap-2'>
          <span className='truncate'>{t('CommandCode')}</span>
          <Badge variant='outline' className='shrink-0'>
            Root
          </Badge>
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t(
          'The CommandCode key pool, its credits and its scheduling, controlled from this site. Keys keep running in the proxy; this page only reads and drives it.'
        )}
      </SectionPageLayout.Description>
      <SectionPageLayout.Content>
        {offline && (
          <div className='bg-card mb-4 rounded-xl border border-dashed px-4 py-3 text-sm'>
            <p className='font-medium'>
              {t('The CommandCode proxy is unreachable')}
            </p>
            <p className='text-muted-foreground mt-1'>
              {connection?.error ||
                t('Check the proxy address on the Settings tab.')}
            </p>
          </div>
        )}
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as CommandCodePoolTab)}
        >
          <TabsList className='flex-wrap'>
            {TABS.map((item) => (
              <TabsTrigger key={item.key} value={item.key}>
                {t(item.label)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value='gateway' className='space-y-6'>
            <GatewayTab />
          </TabsContent>
          <TabsContent value='accounts' className='space-y-6'>
            <AccountsTab />
          </TabsContent>
          <TabsContent value='settings' className='space-y-6'>
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
