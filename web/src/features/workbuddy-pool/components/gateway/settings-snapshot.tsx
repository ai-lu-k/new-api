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
import type { TFunction } from 'i18next'
import { SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TitledCard } from '@/components/ui/titled-card'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { gatewayKeys, readHub } from './gateway-queries'
import type {
  WorkBuddyConsoleState,
  WorkBuddyGatewayHealth,
  WorkBuddyPricing,
} from './gateway-types'
import { GatewayQueryState } from './query-state'

function intervalLabel(
  pricing: WorkBuddyPricing | undefined,
  t: TFunction
): string {
  if (!pricing) return '—'
  if (!pricing.interval_minutes) return t('Manual only')
  return t('Every {{minutes}} minutes', {
    minutes: formatNumber(pricing.interval_minutes),
  })
}

function consoleLabel(
  state: WorkBuddyConsoleState | undefined,
  t: TFunction
): string {
  if (!state) return t('Not reported')
  if (!state.supported) return t('Not supported on this host')
  if (state.visible) return t('Shown')
  return t('Hidden')
}

function SwitchValue(props: {
  enabled: boolean | undefined
  t: TFunction
}): React.JSX.Element {
  if (props.enabled === undefined) {
    return <span className='text-muted-foreground'>—</span>
  }
  return (
    <Badge variant={props.enabled ? 'secondary' : 'outline'}>
      {props.enabled ? props.t('On') : props.t('Off')}
    </Badge>
  )
}

/**
 * The gateway-level switches that change how traffic is priced and served.
 * Editing belongs to the Settings tab, so this panel only reports them.
 */
export function GatewaySettingsSnapshot(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const pricing = useQuery({
    queryKey: gatewayKeys.pricing,
    queryFn: () => readHub<WorkBuddyPricing>('pricing'),
    refetchInterval: 60_000,
  })
  const health = useQuery({
    queryKey: gatewayKeys.health,
    queryFn: () => readHub<WorkBuddyGatewayHealth>('health'),
    refetchInterval: 60_000,
  })
  const consoleState = useQuery({
    queryKey: gatewayKeys.console,
    queryFn: () => readHub<WorkBuddyConsoleState>('console.state'),
    refetchInterval: 60_000,
  })

  return (
    <TitledCard
      title={t('Gateway settings')}
      icon={<SlidersHorizontal />}
      iconTone='neutral'
      description={t(
        'The switches that decide whether prices are fetched and whether a key is required. They are edited on the Settings tab.'
      )}
      action={
        <Button
          variant='outline'
          size='sm'
          render={<Link to='/workbuddy' search={{ tab: 'settings' }} />}
        >
          {t('Open settings')}
        </Button>
      }
    >
      <GatewayQueryState
        isPending={pricing.isPending}
        isError={pricing.isError}
        onRetry={() => void pricing.refetch()}
      >
        <dl className='grid gap-3 text-sm sm:grid-cols-2'>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Price refresh')}
            </dt>
            <dd>
              <SwitchValue enabled={pricing.data?.enabled} t={t} />
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Price estimation master switch')}
            </dt>
            <dd>
              <SwitchValue enabled={pricing.data?.master_enabled} t={t} />
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Refresh interval')}
            </dt>
            <dd className='tabular-nums'>{intervalLabel(pricing.data, t)}</dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('API key required')}
            </dt>
            <dd>
              <SwitchValue enabled={health.data?.api_key_required} t={t} />
            </dd>
          </div>
          <div className='sm:col-span-2'>
            <dt className='text-muted-foreground text-xs'>
              {t('Console window')}
            </dt>
            <dd className='flex flex-wrap items-center gap-2'>
              <span>{consoleLabel(consoleState.data, t)}</span>
              {consoleState.data?.mode != null && (
                <span className='text-muted-foreground text-xs'>
                  {t('mode {{mode}}', { mode: consoleState.data.mode })}
                </span>
              )}
              <span className='text-muted-foreground text-xs tabular-nums'>
                {t('{{policies}} price policies', {
                  policies: formatNumber(pricing.data?.policies ?? 0, locale),
                })}
              </span>
            </dd>
          </div>
        </dl>
      </GatewayQueryState>
    </TitledCard>
  )
}
