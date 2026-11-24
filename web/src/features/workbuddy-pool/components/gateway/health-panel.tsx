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
import { Activity } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { TitledCard } from '@/components/ui/titled-card'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatTimestampToDate } from '@/lib/format'

import { gatewayKeys, readHub } from './gateway-queries'
import {
  countReadyAccounts,
  REALM_LABEL_KEYS,
  type WorkBuddyGatewayHealth,
} from './gateway-types'
import { GatewayQueryState } from './query-state'

function realmBreakdown(perRealm: Record<string, number>): string {
  return Object.entries(perRealm)
    .map(([realm, count]) => `${realm}: ${count}`)
    .join(', ')
}

/**
 * What the gateway itself reports: reachability, the serving realm, how many
 * accounts can take traffic, and how many accounts can serve each model.
 */
export function GatewayHealthPanel(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const query = useQuery({
    queryKey: gatewayKeys.health,
    queryFn: () => readHub<WorkBuddyGatewayHealth>('health'),
    refetchInterval: 60_000,
  })
  const health = query.data
  const models = Object.entries(health?.models_ready ?? {})

  return (
    <TitledCard
      title={t('Gateway health')}
      icon={<Activity />}
      iconTone='info'
      description={t(
        'Reported by the gateway itself: the exit it serves, the accounts that can take traffic, and the credential it presents upstream.'
      )}
      action={
        health ? (
          <Badge variant={health.ok ? 'secondary' : 'destructive'}>
            {health.ok ? t('Healthy') : t('Not healthy')}
          </Badge>
        ) : undefined
      }
    >
      <GatewayQueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
      >
        <dl className='grid gap-3 text-sm sm:grid-cols-2'>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Current realm')}
            </dt>
            <dd>
              {health?.realm
                ? t(REALM_LABEL_KEYS[health.realm] ?? health.realm)
                : '—'}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>{t('Accounts')}</dt>
            <dd className='tabular-nums'>
              {t('{{ready}} ready of {{total}}', {
                ready: formatNumber(health?.accounts_ready ?? 0, locale),
                total: formatNumber(health?.accounts ?? 0, locale),
              })}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('API key required')}
            </dt>
            <dd>{health?.api_key_required ? t('Yes') : t('No')}</dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Key accounts')}
            </dt>
            <dd className='tabular-nums'>
              {t('{{bound}} bound, {{ready}} ready', {
                bound: formatNumber(health?.key_accounts_bound ?? 0, locale),
                ready: formatNumber(health?.key_accounts_ready ?? 0, locale),
              })}
            </dd>
          </div>
          <div className='sm:col-span-2'>
            <dt className='text-muted-foreground text-xs'>
              {t('Gateway credential')}
            </dt>
            <dd className='flex flex-wrap items-center gap-2'>
              <span className='font-mono text-xs'>
                {health?.uid ?? t('Not reported')}
              </span>
              {health?.domain != null && (
                <span className='text-muted-foreground text-xs'>
                  {health.domain}
                </span>
              )}
              {health?.expires_at != null && (
                <span className='text-muted-foreground text-xs tabular-nums'>
                  {t('expires {{time}}', {
                    time: formatTimestampToDate(health.expires_at),
                  })}
                </span>
              )}
            </dd>
          </div>
          <div className='sm:col-span-2'>
            <dt className='text-muted-foreground text-xs'>
              {t('Accounts that can serve each model')}
            </dt>
            <dd className='mt-1 flex flex-wrap gap-1.5'>
              {models.length === 0 && (
                <span className='text-muted-foreground text-xs'>
                  {t('No model is being served right now')}
                </span>
              )}
              {models.map(([model, perRealm]) => (
                <span
                  key={model}
                  title={realmBreakdown(perRealm)}
                  className='bg-muted/60 rounded-md px-1.5 py-0.5 font-mono text-xs tabular-nums'
                >
                  {model} · {formatNumber(countReadyAccounts(perRealm), locale)}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </GatewayQueryState>
    </TitledCard>
  )
}
