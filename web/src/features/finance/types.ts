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
/**
 * One calendar month of money in and out. Top-ups are money received; gifts
 * are quota given away, at face value; expenses come from the expense ledger.
 */
export type FinanceMonth = {
  /** "2026-10" */
  month: string
  online_topup: number
  manual_topup: number
  gift_manual: number
  gift_checkin: number
  gift_redemption: number
  gift_event: number
  expenses: number
}

/** The same figures added up over a period that is not one month. */
export type FinanceTotals = Omit<FinanceMonth, 'month'>

/** Money and quota in and out on one Asia/Shanghai calendar day. */
export type FinanceDay = {
  /** "2026-10-14" */
  date: string
  online_topup: number
  manual_topup: number
  expenses: number
  /** Quota given away that day, at face value. */
  gift: number
  /** Token Plan free quota settled that day. History: zero after the cutover. */
  plan_free: number
  /** The part of `consumption` paid from gifted balance, at face value. */
  gift_consumed: number
  /** What users were charged for settled requests that day. */
  consumption: number
  /** Ordinary accounts registered that day. */
  new_users: number
}

export type FinanceDaily = {
  days: FinanceDay[]
}

/** The ordinary users' wallet split, already in the display currency. */
export type FinanceWalletSummary = {
  users: number
  balance: number
  paid: number
  gift: number
  as_of: number
}

export type FinanceWalletUser = {
  id: number
  username: string
  display_name: string
  status: number
  balance: number
  paid: number
  gift: number
}

export type FinanceConsumption = {
  total: number
  /** Token Plan free quota. History: nothing settles it after the cutover. */
  plan_free: number
  /** Part of `wallet` paid from gifted balance, recorded from 2026-11-01 on. */
  gift_consumed: number
  wallet: number
  start: number
  end: number
}

export type FinanceTokenPlan = {
  users: number
  activated_users: number
  total_quota: number
  used_quota: number
  reserved_quota: number
  remaining_quota: number
  wallet_used: number
  as_of: number
}

export type FinanceOperations = {
  wallet: FinanceWalletSummary
  consumption: FinanceConsumption
  token_plan: FinanceTokenPlan
}

/** One funding account. Gateway balances are USD; CommandCode and WorkBuddy
 * use credits, so their figures are the pool's own unit rather than money. */
export type CommandCodePool = {
  observed_days: number
  usage_complete: boolean
  usage_estimated: boolean
  target_estimated: boolean
  window_usage: number
  wallet_balance: number
  unknown_count: number
  stale_count: number
  plans: Array<{
    plan: 'go' | 'goat'
    count: number
    enabled: number
    cost_cny: number
    weekly_cap: number
    available: number
  }>
}

/** WorkBuddy's pool reading. Credits are the pool's own unit: the money the
 * operator paid is the per-account purchase list, not these numbers. */
export type WorkBuddyPool = {
  observed_days: number
  usage_complete: boolean
  window_start: number
  usage_7d: number
  target_3d: number
  balance: number
  expiring_credits: number
  accounts_total: number
  accounts_enabled: number
  /** How many pooled accounts each realm holds; the money stays domestic. */
  realms: Array<{ realm: string; total: number; enabled: number }>
  stale_count: number
}

export type UpstreamAccount = {
  pool?: CommandCodePool
  /** WorkBuddy's pool reading; every amount is credits, not money. */
  workbuddy?: WorkBuddyPool
  id: number
  name: string
  provider:
    | 'openai'
    | 'anthropic'
    | 'newapi'
    | 'commandcode'
    | 'workbuddy'
    | 'codex789'
    | 'openlux'
  base_url: string
  balance_channel_id: number
  manual_balance?: number | null
  manual_balance_updated_at: number
  usage_7d: number
  usage_window_start: number
  usage_window_end: number
  usage_checked_at: number
  usage_status: 'never' | 'ok' | 'error'
  usage_error: string
  remote_balance?: number
  remote_balance_at: number
  balance_error: string
  currency: string
  exchange_rate: number
  topup_count: number
  topup_total: number
  topup_checked_at: number
  created_at: number
  updated_at: number
  balance: number | null
  balance_source: 'api' | 'manual' | 'channel' | 'none' | 'pool'
  balance_updated_at: number
  balance_stale: boolean
  daily_average: number | null
  target_3d: number | null
  gap: number | null
  has_credential: boolean
}

export type UpstreamAccountInput = {
  name: string
  provider:
    | 'openai'
    | 'anthropic'
    | 'newapi'
    | 'commandcode'
    | 'workbuddy'
    | 'codex789'
    | 'openlux'
  base_url: string
  credential: string
  balance_channel_id: number
  manual_balance: number | null
  currency: string
  exchange_rate: number | null
}

/** One payment a new-api gateway recorded for the bound account. */
export type UpstreamTopUp = {
  id: number
  account_id: number
  trade_no: string
  /** Paid in the account's currency. */
  paid: number
  currency: string
  /** CNY per currency unit when the payment was synced. */
  rate: number
  method: string
  status: string
  paid_at: number
  fetched_at: number
}

/** A payment already counted in the monthly spending. */
export type UpstreamBooking = {
  id: number
  account_id: number
  account_name: string
  paid: number
  currency: string
  rate: number
  amount_cny: number
  method: string
  paid_at: number
}

/** One funding account's contribution to the three-day cost line. */
export type FinanceReserveAccount = {
  id: number
  name: string
  provider: string
  /** What the provider billed in its seven-day window. */
  usage_7d: number
  /** The same amount in the display currency. */
  cost: number
  included: boolean
  status: 'ok' | 'stale' | 'never' | 'error' | 'subscription'
  window_end: number
  checked_at: number
}

/** Three days of the seven-day average upstream cost. */
export type FinanceReserveDaily = {
  window_days: number
  horizon_days: number
  window_start: number
  window_end: number
  cost: number
  daily_average: number | null
  target: number | null
  /** How far the balance is below the target; zero when it covers it. */
  gap: number | null
  /** How far the balance is above the target; zero when it does not cover it. */
  excess: number | null
  complete: boolean
  has_reports: boolean
  accounts: FinanceReserveAccount[]
  missing_accounts: string[]
  stale_accounts: string[]
  subscription_accounts: number
}

/** The whole consumable stock converted at the seven-day cost share. */
export type FinanceReserveExtreme = {
  horizon_days: number
  wallet: number
  plan_remaining: number
  face_value: number
  target: number | null
  gap: number | null
  excess: number | null
  complete: boolean
}

/** The cumulative balance compared with both three-day reserve targets. */
export type FinanceReserves = {
  as_of: number
  baseline: {
    amount: number
    scope: 'all_history'
    as_of: number
  }
  daily: FinanceReserveDaily
  extreme: FinanceReserveExtreme
}
