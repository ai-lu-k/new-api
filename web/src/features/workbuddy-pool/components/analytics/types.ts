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
import type {
  WorkBuddyByAccount,
  WorkBuddyPercentiles,
  WorkBuddyRemaining,
  WorkBuddyRemainingRow,
  WorkBuddyUsage,
  WorkBuddyUsageByModel,
} from '../../types'

/** Which slice of the account pool a read covers. */
export type AnalyticsRealm = 'all' | 'cn' | 'intl'

/** Preset window. The hub takes epoch seconds, so bounds are derived per request. */
export type AnalyticsWindow = '1h' | '6h' | '24h' | '7d'

/** The page's filter state, kept in component state and in every query key. */
export type AnalyticsFilters = {
  realm: AnalyticsRealm
  window: AnalyticsWindow
  model: string
}

/** The hub's own nickname and region record for one account. */
export type UsageAccountRef = {
  nickname?: string
  realm?: string
}

/**
 * One `/usage` `by_model` entry. The hub leaves out `errors` per model, so the
 * shared totals type cannot be used unchanged here.
 */
export type UsageByModel = Omit<
  WorkBuddyUsageByModel,
  'errors' | 'accounts'
> & {
  accounts?: Record<string, number>
}

/** `/usage` as the hub actually sends it. */
export type HubUsage = Omit<WorkBuddyUsage, 'accounts_map' | 'by_model'> & {
  accounts_map?: Record<string, UsageAccountRef>
  by_model: Record<string, UsageByModel>
}

/** `/usage/by-account` answers with a bare list. */
export type HubByAccount = { accounts: WorkBuddyByAccount[] }

/**
 * `/usage/remaining` sends boolean `cooling` and `estimated` flags per row, and
 * any latency block can be null for a bucket that only ever saw failures. The
 * per-model summary keeps the numeric counters the shared type declares.
 */
export type RemainingRow = Omit<
  WorkBuddyRemainingRow,
  'cooling' | 'estimated'
> & {
  cooling?: boolean
  estimated?: boolean
}

export type HubRemaining = Omit<WorkBuddyRemaining, 'rows'> & {
  rows: RemainingRow[]
}

/** One latency, speed or cache block of the performance report. */
export type PerfBlock = {
  requests: number
  errors: number
  client_aborted: number
  success_rate_pct: number
  ttft_ms: WorkBuddyPercentiles | null
  generation_ms: WorkBuddyPercentiles | null
  wall_ms: WorkBuddyPercentiles | null
  tokens_per_sec: WorkBuddyPercentiles | null
  cache_hit_pct: WorkBuddyPercentiles | null
}

/** `/usage/perf`: the aggregate block plus one block per model. */
export type HubPerf = PerfBlock & {
  sampled: number
  sample_from: number
  sample_capped: boolean
  success: number
  by_model: Record<string, PerfBlock>
}

/**
 * `/accounts` reduced to what this tab joins on. The accounts tab reads the
 * same call with its own, much larger record type; this tab only needs a name
 * for a uid that appears in the usage log.
 */
export type AnalyticsAccountRef = {
  uid: string
  nickname?: string
}

export type AnalyticsAccountList = { accounts: AnalyticsAccountRef[] }

/** One row of the per-model performance table. */
export type PerfModelRow = {
  model: string
  block: PerfBlock
}

/** Query state a section renders, kept free of react-query types. */
export type SectionQuery<T> = {
  data: T | undefined
  isLoading: boolean
  isError: boolean
  errorMessage?: string
  retry: () => void
}

/** Empty model value: the filter is off and every model is shown. */
export const ALL_MODELS = ''

/**
 * A select needs a real value for its "every model" entry; an empty string is
 * reserved for "nothing chosen", so the option carries this sentinel and the
 * filter state stays `ALL_MODELS`.
 */
export const ALL_MODELS_OPTION = '__all_models__'

export const REALM_OPTIONS: { value: AnalyticsRealm; label: string }[] = [
  { value: 'all', label: 'All realms' },
  { value: 'cn', label: 'CN (domestic)' },
  { value: 'intl', label: 'INTL (international)' },
]

export const WINDOW_OPTIONS: {
  value: AnalyticsWindow
  label: string
  seconds: number
}[] = [
  { value: '1h', label: '1 hour', seconds: 3_600 },
  { value: '6h', label: '6 hours', seconds: 21_600 },
  { value: '24h', label: '24 hours', seconds: 86_400 },
  { value: '7d', label: '7 days', seconds: 604_800 },
]

/** Epoch-second bounds for one preset, ending at `nowSeconds`. */
export function windowBounds(
  preset: AnalyticsWindow,
  nowSeconds: number
): { since: number; until: number } {
  const match = WINDOW_OPTIONS.find((option) => option.value === preset)
  const seconds = match ? match.seconds : 86_400
  const until = Math.floor(nowSeconds)
  return { since: until - seconds, until }
}
