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
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import type { WorkBuddyAccount } from '../../types'
import { gatewayKeys, readHub } from './gateway-queries'
import {
  isCreditAccountUsable,
  REALM_HOSTS,
  REALM_LABEL_KEYS,
  type WorkBuddyCreditsPayload,
  type WorkBuddyGatewayHealth,
  type WorkBuddyRealmState,
} from './gateway-types'
import { GatewayQueryState } from './query-state'

/** The two exits the hub serves, in the order its own dashboard shows them. */
const PREFERRED_REALMS = ['intl', 'cn']

function realmRank(realm: string): number {
  const index = PREFERRED_REALMS.indexOf(realm)
  return index === -1 ? PREFERRED_REALMS.length : index
}

function collectRealms(
  health: WorkBuddyGatewayHealth | undefined,
  realmState: WorkBuddyRealmState | undefined
): string[] {
  const names = new Set<string>(realmState?.options ?? [])
  for (const name of Object.keys(health?.accounts_by_realm ?? {})) {
    names.add(name)
  }
  for (const name of Object.keys(health?.accounts_ready_by_realm ?? {})) {
    names.add(name)
  }
  if (health?.realm) names.add(health.realm)
  if (realmState?.current) names.add(realmState.current)
  return [...names].sort(
    (left, right) =>
      realmRank(left) - realmRank(right) || left.localeCompare(right)
  )
}

/** An account with no realm recorded follows the international exit. */
function belongsToRealm(accountRealm: string, realm: string): boolean {
  if (!accountRealm) return realm === 'intl'
  return accountRealm === realm
}

type RealmSummary = {
  available: number | null
  total: number | null
  ready: number
  accounts: number
}

function summarizeRealm(
  realm: string,
  accounts: WorkBuddyAccount[],
  health: WorkBuddyGatewayHealth | undefined
): RealmSummary {
  const inRealm = accounts.filter((account) =>
    belongsToRealm(account.realm, realm)
  )
  if (inRealm.length === 0) {
    return {
      available: null,
      total: null,
      ready: health?.accounts_ready_by_realm?.[realm] ?? 0,
      accounts: health?.accounts_by_realm?.[realm] ?? 0,
    }
  }

  let available = 0
  let total = 0
  let ready = 0
  let hasCredits = false
  for (const account of inRealm) {
    const usable = isCreditAccountUsable(account)
    if (usable) ready += 1
    const remain = account.credits?.remain
    if (typeof remain !== 'number') continue
    hasCredits = true
    total += remain
    if (usable) available += remain
  }

  return {
    available: hasCredits ? available : null,
    total: hasCredits ? total : null,
    ready,
    accounts: inRealm.length,
  }
}

/**
 * One card per realm: the credits the gateway can actually spend right now,
 * the total it holds, how many accounts can serve, and how the realm relates
 * to the saved egress.
 */
export function GatewayRealmCards(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const health = useQuery({
    queryKey: gatewayKeys.health,
    queryFn: () => readHub<WorkBuddyGatewayHealth>('health'),
    refetchInterval: 60_000,
  })
  const realmState = useQuery({
    queryKey: gatewayKeys.realm,
    queryFn: () => readHub<WorkBuddyRealmState>('realm'),
    refetchInterval: 60_000,
  })
  // The account list already carries each balance and its guard flags, and it
  // answers in milliseconds. /accounts/credits re-reads every balance from the
  // upstream and takes ~15s, which is far too slow for a card on first paint.
  const credits = useQuery({
    queryKey: gatewayKeys.credits,
    queryFn: () =>
      readHub<WorkBuddyCreditsPayload>('accounts', { realm: 'all' }),
    refetchInterval: 120_000,
  })

  const realms = collectRealms(health.data, realmState.data)
  const accounts = credits.data?.accounts ?? []
  const egressRealm = realmState.data?.current ?? health.data?.realm

  return (
    <GatewayQueryState
      isPending={health.isPending || credits.isPending}
      isError={health.isError || credits.isError}
      onRetry={() => {
        void health.refetch()
        void credits.refetch()
      }}
    >
      <div className='grid gap-3 sm:grid-cols-2'>
        {realms.map((realm) => {
          const summary = summarizeRealm(realm, accounts, health.data)
          const available =
            summary.available == null
              ? '—'
              : formatNumber(summary.available, locale)
          const total =
            summary.total == null ? '—' : formatNumber(summary.total, locale)
          return (
            <Card key={realm} size='sm' className='gap-2'>
              <CardHeader>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='text-sm font-semibold'>
                    {t(REALM_LABEL_KEYS[realm] ?? realm)}
                  </span>
                  <span className='text-muted-foreground font-mono text-xs'>
                    {REALM_HOSTS[realm] ?? realm}
                  </span>
                  {realm === egressRealm && (
                    <Badge variant='secondary'>{t('Default egress')}</Badge>
                  )}
                  {realm === health.data?.realm && (
                    <Badge
                      variant='outline'
                      title={t(
                        'The realm the gateway reports it is serving right now'
                      )}
                    >
                      {t('Current view')}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className='text-muted-foreground text-xs'>
                  {t('Available credits')}
                </p>
                <p className='mt-0.5 text-2xl font-semibold tabular-nums'>
                  {available}
                </p>
                <p className='text-muted-foreground mt-1 text-xs'>
                  {t(
                    '/ {{total}} total credits · {{ready}}/{{accounts}} accounts',
                    {
                      total,
                      ready: formatNumber(summary.ready, locale),
                      accounts: formatNumber(summary.accounts, locale),
                    }
                  )}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </GatewayQueryState>
  )
}
