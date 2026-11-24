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

/** One WorkBuddy account as the hub reports it. */
export type WorkBuddyCheckin = {
  today_checked_in: boolean
  streak_days: number
  daily_credit: number
  today_credit: number
  active: boolean
}

/** One credit package still holding a balance. */
export type WorkBuddyCreditPackage = {
  name: string
  package_code: string
  product_name: string
  sub_product_name: string
  grant_reason: string
  remain: number
  size: number
  used: number
  days_left: number | null
  cycle_start_time: string
  cycle_end_time: string
  expire_time: string
  no_expiry: boolean
  is_expired: boolean
  auto_renew: boolean
  in_usage: boolean
  status: string
}

export type WorkBuddyCredits = {
  remain: number
  used: number
  size: number
  remain_percent: string
  used_percent: string
  is_paid_user: boolean
  updated_at?: number
  updated_iso?: string
  checkin?: WorkBuddyCheckin
  earliest_expiring?: {
    name: string
    package_code: string
    remain: number
    cycle_end_time: string
    days_left: number
  } | null
  packages?: WorkBuddyCreditPackage[]
}

/** Cooldown, breaker or degradation state the hub reports per account. */
export type WorkBuddyAccount = {
  uid: string
  nickname: string
  domain: string
  realm: string
  platform: string
  product: string
  enterpriseId: string
  enabled: boolean
  tasksEnabled: boolean
  weight: number
  note: string
  disabledModels: string[]
  source: string
  apiKey: boolean
  credentialMask: string
  proxySlot: string
  proxy: string
  expiresAt: number
  expiresIn: string
  tokenExpired: boolean
  needRelogin: boolean
  hasRefreshToken: boolean
  lastError: string
  lastErrorDetail: string | null
  inCooldown: boolean
  cooldownFor: string | null
  restrictedFor: string | null
  modelCooldowns: unknown[]
  softStreak: number
  unscopedStreak: number
  breakerFor: string | null
  degradeFor: string | null
  fails: number
  failWindow: number
  lastFailFor: string | null
  addedAt: number
  file: string
  credits: WorkBuddyCredits
  tier?: string
  machineId?: string
  sessionId?: string
  reserveCredits?: number | null
  reserveBlocked?: boolean
  dailyTokenLimit?: number | null
  dailyTokensToday?: number
  dailyCreditLimit?: number | null
  dailyCreditsToday?: number
  dailyLimitBlocked?: boolean
  creditLimitReached?: boolean
  modelDailyTokenLimit?: number | null
  modelDailyTokens?: Record<string, number>
  canCheckin?: boolean
  lastCheckin?: string | null
  canDailyChat?: boolean
  lastDailyChat?: string | null
  canReportActivity?: boolean
  lastActivityReport?: string | null
}

export type WorkBuddyAccountList = { accounts: WorkBuddyAccount[] }

/** Request and token totals for one window. */
export type WorkBuddyUsageTotals = {
  requests: number
  errors: number
  prompt_tokens: number
  completion_tokens: number
  reasoning_tokens: number
  cached_tokens: number
  total_tokens: number
  credit: number
  cost_cny: number
}

export type WorkBuddyUsageByModel = WorkBuddyUsageTotals & {
  accounts: Record<string, number>
}

export type WorkBuddyUsage = WorkBuddyUsageTotals & {
  realm: string
  since: number
  started: number
  usd_cny: number
  cost_missing: Record<string, number>
  by_model: Record<string, WorkBuddyUsageByModel>
  accounts_map?: Record<string, string>
  log_file?: string
}

export type WorkBuddySeriesPoint = {
  at: number
  requests: number
  errors: number
  prompt_tokens: number
  completion_tokens: number
  reasoning_tokens: number
  cached_tokens: number
  total_tokens: number
  credit: number
}

export type WorkBuddyTimeseries = {
  ok: boolean
  realm: string
  bucket_seconds: number
  since: number
  until: number
  credits?: unknown
  series: WorkBuddySeriesPoint[]
}

/** Latency percentiles for one measure. */
export type WorkBuddyPercentiles = {
  avg: number
  p50: number
  p90: number
  p99: number
  max: number
  samples: number
}

export type WorkBuddyPerf = {
  sampled: number
  sample_from: number
  sample_capped: boolean
  success: number
  errors: number
  client_aborted: number
  success_rate_pct: number
  ttft_ms: WorkBuddyPercentiles
  generation_ms: WorkBuddyPercentiles
  wall_ms: WorkBuddyPercentiles
  tokens_per_sec: WorkBuddyPercentiles
  cache_hit_pct: WorkBuddyPercentiles
  by_model: Record<string, WorkBuddyPerfModel>
}

export type WorkBuddyPerfModel = {
  requests: number
  errors: number
  client_aborted: number
  success_rate_pct: number
  cache_hit_pct: number
  ttft_ms: WorkBuddyPercentiles
  generation_ms: WorkBuddyPercentiles
  wall_ms: WorkBuddyPercentiles
  tokens_per_sec: WorkBuddyPercentiles
}

export type WorkBuddyByAccount = {
  account: string
  requests: number
  prompt_tokens: number
  completion_tokens: number
  reasoning_tokens: number
  cached_tokens: number
  total_tokens: number
  models: [string, number][]
}

/** One recorded request. Cost fields describe how the credit figure was priced. */
export type WorkBuddyRecentRow = {
  at: number
  iso: string
  model: string
  stream: boolean
  outcome: string
  elapsed_ms: number
  ttft_ms: number
  gen_ms: number
  prompt_tokens: number
  completion_tokens: number
  reasoning_tokens: number
  cached_tokens: number
  total_tokens: number
  credit: number
  msgs_sha: string
  n_msgs: number
  system_sha: string
  prefix_sha: string
  /** Absent when the request failed before the gateway chose an account. */
  account?: string
  realm: string
  key: string
  key_name?: string
  cost_policy: string
  reasoning_effort: string
  tokens_per_sec: number
  cache_hit_pct: number
  cost_cny?: number
  cost_band?: string
  cost_source?: string
}

export type WorkBuddyRecent = {
  total: number
  page: number
  limit: number
  total_pages: number
  usd_cny: number
  rows: WorkBuddyRecentRow[]
}

/** Per-account, per-model remaining quota inside the hub's rolling window. */
export type WorkBuddyRemainingRow = {
  uid: string
  nickname: string
  realm: string
  model: string
  used: number
  budget: number | null
  budget_min: number | null
  budget_max: number | null
  samples: number
  remaining: number | null
  used_pct: number | null
  window_start: number
  window_iso: string
  reset_at?: number | null
  reset_iso?: string | null
  cooling?: number
  estimated?: number
  segments?: unknown[]
}

export type WorkBuddyRemaining = {
  window_seconds: number
  generated_at: number
  generated_iso: string
  activity_floor: number
  activity_floor_iso: string
  budgets: unknown[]
  models: {
    realm: string
    model: string
    total_remaining: number | null
    budget: number | null
    pairs: number
    available: number
    cooling: number
    unknown: number
    estimated: number
  }[]
  rows: WorkBuddyRemainingRow[]
}

export type WorkBuddyHealth = {
  ok: boolean
  realm: string
  accounts: number
  accounts_ready: number
  accounts_by_realm: Record<string, number>
  accounts_ready_by_realm: Record<string, number>
  accounts_ready_current_realm: number
  models_ready: Record<string, Record<string, number>>
  api_key_required: boolean
  [key: string]: unknown
}
