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
import { MonitorCog } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { TitledCard } from '@/components/ui/titled-card'

import { gatewayKeys, readHub } from './gateway-queries'
import type { WorkBuddyConsoleState } from './gateway-types'
import { GatewayQueryState } from './query-state'

/**
 * The hub's own console window. Opening, hiding and shutting it down are
 * operations on the host machine that runs the gateway, so this panel only
 * reports the state and says where those actions belong.
 */
export function GatewayConsolePanel(): React.JSX.Element {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: gatewayKeys.console,
    queryFn: () => readHub<WorkBuddyConsoleState>('console.state'),
    refetchInterval: 60_000,
  })
  const state = query.data

  let stateLabel = t('Not reported')
  if (state) {
    if (!state.supported) stateLabel = t('Not supported on this host')
    else stateLabel = state.visible ? t('Shown') : t('Hidden')
  }

  return (
    <TitledCard
      title={t('Host console window')}
      icon={<MonitorCog />}
      iconTone='chart-5'
      description={t(
        'Showing or hiding the gateway window and shutting the gateway down run on the host machine, not through this site.'
      )}
      action={state ? <Badge variant='outline'>{stateLabel}</Badge> : undefined}
    >
      <GatewayQueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
      >
        <dl className='grid gap-3 text-sm sm:grid-cols-2'>
          <div>
            <dt className='text-muted-foreground text-xs'>{t('Window')}</dt>
            <dd>{stateLabel}</dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>{t('Mode')}</dt>
            <dd className='font-mono text-xs'>{state?.mode ?? '—'}</dd>
          </div>
          <p className='text-muted-foreground text-xs leading-relaxed sm:col-span-2'>
            {t(
              'Read-only here on purpose: a restart or a shutdown from this console could interrupt traffic that is still running, so it is left to whoever administers the host.'
            )}
          </p>
        </dl>
      </GatewayQueryState>
    </TitledCard>
  )
}
