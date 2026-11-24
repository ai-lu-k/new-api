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
import { requireServerSuccess } from '@/lib/server-error-message'

import { hubGet } from '../../api'
import type { AnalyticsRealm, AnalyticsWindow } from './types'

/**
 * Every Analytics query key starts here, so the tab's reads stay apart from the
 * other WorkBuddy areas. The tab is read-only, so nothing ever invalidates it.
 */
const ANALYTICS_QUERY_ROOT = ['workbuddy', 'analytics'] as const

/**
 * The hub only honours `since`/`until` inside a custom range: with any other
 * `range` value it silently answers for all history. Every windowed call here
 * therefore sends `range=custom` together with the bounds.
 */
export type AnalyticsWindowParams = {
  realm: AnalyticsRealm
  range: 'custom'
  since: number
  until: number
}

export function analyticsWindowParams(
  realm: AnalyticsRealm,
  since: number,
  until: number
): AnalyticsWindowParams {
  return { realm, range: 'custom', since, until }
}

export const analyticsKeys = {
  usage: (params: AnalyticsWindowParams) =>
    [
      ...ANALYTICS_QUERY_ROOT,
      'usage',
      params.realm,
      params.since,
      params.until,
    ] as const,
  series: (params: AnalyticsWindowParams) =>
    [
      ...ANALYTICS_QUERY_ROOT,
      'series',
      params.realm,
      params.since,
      params.until,
    ] as const,
  perf: (params: AnalyticsWindowParams) =>
    [
      ...ANALYTICS_QUERY_ROOT,
      'perf',
      params.realm,
      params.since,
      params.until,
    ] as const,
  byAccount: (realm: AnalyticsRealm, window: AnalyticsWindow) =>
    [...ANALYTICS_QUERY_ROOT, 'by-account', realm, window] as const,
  remaining: (realm: AnalyticsRealm, window: AnalyticsWindow) =>
    [...ANALYTICS_QUERY_ROOT, 'remaining', realm, window] as const,
  recent: (
    realm: AnalyticsRealm,
    window: AnalyticsWindow,
    page: number,
    limit: number
  ) => [...ANALYTICS_QUERY_ROOT, 'recent', realm, window, page, limit] as const,
  /** Shared with the accounts tab on purpose: one read feeds both pages. */
  accounts: () => ['workbuddy', 'accounts', 'all'] as const,
}

/**
 * One read-only hub call. A refused call rejects with the hub's own wording so
 * the section can show it; an empty body stays `undefined` and the section
 * renders its empty state instead of inventing figures.
 */
export async function readHub<T>(
  key: string,
  params?: Record<string, unknown>
): Promise<T | undefined> {
  const response = requireServerSuccess(await hubGet<T>(key, params))
  return response.data
}
