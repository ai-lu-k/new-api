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
import { useMemo, useState } from 'react'

import { AnalyticsFilterBar } from './analytics/filter-bar'
import { AnalyticsHeadline } from './analytics/headline'
import { AnalyticsPerAccount } from './analytics/per-account-usage'
import { AnalyticsPerformancePanel } from './analytics/performance-panel'
import {
  analyticsKeys,
  analyticsWindowParams,
  readHub,
} from './analytics/queries'
import { AnalyticsRecentRequests } from './analytics/recent-requests'
import { AnalyticsRemaining } from './analytics/remaining-quota'
import {
  ALL_MODELS,
  windowBounds,
  type AnalyticsAccountList,
  type AnalyticsFilters,
  type AnalyticsRealm,
  type AnalyticsWindow,
  type HubUsage,
} from './analytics/types'
import { AnalyticsSeriesChart } from './analytics/usage-series-chart'

/** A day of history is the most useful default for a pool this size. */
const INITIAL_FILTERS: AnalyticsFilters = {
  realm: 'all',
  window: '24h',
  model: ALL_MODELS,
}

/**
 * The hub's analytics page: what the pool served, how fast, who spent it, and
 * what is left. Every call here is a read; the tab has no action that could
 * change a live account.
 */
export function AnalyticsTab(): React.JSX.Element {
  const [filters, setFilters] = useState<AnalyticsFilters>(INITIAL_FILTERS)
  const [page, setPage] = useState(1)
  // The window ends when it was chosen. Anchoring it keeps the query key stable
  // across renders, so switching the model filter does not silently move the
  // window under the figures that are already on screen.
  const bounds = useMemo(
    () => windowBounds(filters.window, Math.floor(Date.now() / 1000)),
    [filters.window]
  )
  const params = useMemo(
    () => analyticsWindowParams(filters.realm, bounds.since, bounds.until),
    [filters.realm, bounds]
  )
  const usage = useQuery({
    queryKey: analyticsKeys.usage(params),
    queryFn: () => readHub<HubUsage>('usage', params),
  })
  const accounts = useQuery({
    queryKey: analyticsKeys.accounts(),
    queryFn: () => readHub<AnalyticsAccountList>('accounts', { realm: 'all' }),
  })
  const names = useMemo(() => {
    const map: Record<string, string> = {}
    for (const account of accounts.data?.accounts ?? []) {
      if (account.nickname) map[account.uid] = account.nickname
    }
    return map
  }, [accounts.data])
  const models = useMemo(
    () => Object.keys(usage.data?.by_model ?? {}).sort(),
    [usage.data]
  )

  const changeRealm = (realm: AnalyticsRealm): void => {
    setFilters((current) => ({ ...current, realm }))
    setPage(1)
  }
  const changeWindow = (window: AnalyticsWindow): void => {
    setFilters((current) => ({ ...current, window }))
    setPage(1)
  }
  const changeModel = (model: string): void => {
    setFilters((current) => ({ ...current, model }))
  }

  return (
    <div className='space-y-4'>
      <AnalyticsFilterBar
        filters={filters}
        models={models}
        since={bounds.since}
        until={bounds.until}
        onRealmChange={changeRealm}
        onWindowChange={changeWindow}
        onModelChange={changeModel}
      />
      <AnalyticsHeadline model={filters.model} params={params} />
      <AnalyticsSeriesChart filters={filters} params={params} />
      <div className='grid gap-4 xl:grid-cols-2'>
        <AnalyticsPerformancePanel model={filters.model} params={params} />
        <AnalyticsPerAccount
          realm={filters.realm}
          window={filters.window}
          model={filters.model}
          names={names}
        />
      </div>
      <AnalyticsRemaining
        realm={filters.realm}
        window={filters.window}
        model={filters.model}
        names={names}
      />
      <AnalyticsRecentRequests
        realm={filters.realm}
        window={filters.window}
        model={filters.model}
        page={page}
        names={names}
        onPageChange={setPage}
      />
    </div>
  )
}
