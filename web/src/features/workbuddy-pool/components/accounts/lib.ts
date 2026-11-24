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
import type { HubAccount } from './types'

/** Why the pool is or is not routing to one account, in the hub's own order. */
export type AccountStateKind =
  | 'ready'
  | 'disabled'
  | 'credential'
  | 'reserve'
  | 'dailyTokens'
  | 'dailyCredits'
  | 'breaker'
  | 'degrade'
  | 'cooldown'
  | 'expired'

export type AccountSummary = {
  total: number
  enabled: number
  ready: number
  creditsAvailable: number
  creditsTotal: number
  cooldown: number
  needRelogin: number
  tokenExpired: number
}

export const ACCOUNT_STATE_VARIANTS: Record<
  AccountStateKind,
  'success' | 'warning' | 'danger' | 'neutral'
> = {
  ready: 'success',
  disabled: 'neutral',
  credential: 'danger',
  expired: 'danger',
  breaker: 'danger',
  reserve: 'warning',
  dailyTokens: 'warning',
  dailyCredits: 'warning',
  degrade: 'warning',
  cooldown: 'warning',
}

/** The hub's rule for "can take traffic right now". */
export function isAccountUsable(account: HubAccount): boolean {
  if (!account.enabled) return false
  if (account.reserveBlocked) return false
  if (account.dailyLimitBlocked) return false
  if (account.creditLimitReached) return false
  return true
}

export function accountState(account: HubAccount): AccountStateKind {
  if (!account.enabled) return 'disabled'
  if (account.tokenExpired || account.needRelogin) return 'credential'
  if (account.reserveBlocked) return 'reserve'
  if (account.dailyLimitBlocked) return 'dailyTokens'
  if (account.creditLimitReached) return 'dailyCredits'
  if (account.breakerFor) return 'breaker'
  if (account.degradeFor) return 'degrade'
  if (account.inCooldown) return 'cooldown'
  if (account.expiresIn === 'expired') return 'expired'
  return 'ready'
}

export function summarizeAccounts(accounts: HubAccount[]): AccountSummary {
  const summary: AccountSummary = {
    total: accounts.length,
    enabled: 0,
    ready: 0,
    creditsAvailable: 0,
    creditsTotal: 0,
    cooldown: 0,
    needRelogin: 0,
    tokenExpired: 0,
  }
  for (const account of accounts) {
    const remain = Number(account.credits?.remain ?? 0)
    summary.creditsTotal += remain
    if (account.enabled) summary.enabled += 1
    if (isAccountUsable(account)) {
      summary.ready += 1
      summary.creditsAvailable += remain
    }
    if (account.inCooldown) summary.cooldown += 1
    if (account.needRelogin) summary.needRelogin += 1
    if (account.tokenExpired) summary.tokenExpired += 1
  }
  return summary
}

/**
 * Disabled accounts sink, noted accounts win ties, heavier weights lead, and
 * everything else keeps the hub's order so the list does not jump on refresh.
 */
export function sortAccounts(accounts: HubAccount[]): HubAccount[] {
  return accounts
    .map((account, index) => ({ account, index }))
    .sort((left, right) => {
      if (left.account.enabled !== right.account.enabled) {
        return left.account.enabled ? -1 : 1
      }
      const leftNote = left.account.note ? 0 : 1
      const rightNote = right.account.note ? 0 : 1
      if (leftNote !== rightNote) return leftNote - rightNote
      const leftWeight = Number(left.account.weight || 1) || 1
      const rightWeight = Number(right.account.weight || 1) || 1
      if (leftWeight !== rightWeight) return rightWeight - leftWeight
      return left.index - right.index
    })
    .map((entry) => entry.account)
}

/** Clamped percentage, so a stale reading cannot overfill the bar. */
export function percentOf(remain: number, size: number): number {
  if (!Number.isFinite(remain) || !Number.isFinite(size) || size <= 0) return 0
  return Math.min(100, Math.max(0, (remain / size) * 100))
}

export function creditPercent(account: HubAccount): number {
  return percentOf(
    Number(account.credits?.remain ?? 0),
    Number(account.credits?.size ?? 0)
  )
}

/** "13 days" reads as "13d" inside a row; the raw value stays in the tooltip. */
export function expiryShort(expiresIn: string): string {
  return String(expiresIn || '')
    .replace(/\s*days?$/i, 'd')
    .replace(/\s*hours?$/i, 'h')
}

/** The hub prints the status code; the upstream body carries the error code. */
export function errorLabel(lastError: string, detail?: string | null): string {
  const http = /HTTP\s+(\d{3})/.exec(lastError)
  if (!http) return lastError.slice(0, 60)
  const code = /"code"\s*:\s*(\d+)/.exec(detail ?? '')
  if (!code) return `HTTP ${http[1]}`
  return `HTTP ${http[1]} · code:${code[1]}`
}

/** Three days is an emergency, a week is a warning, everything else is quiet. */
export function expiryTone(
  daysLeft?: number | null
): 'danger' | 'warning' | null {
  if (daysLeft === null || daysLeft === undefined) return null
  const days = Number(daysLeft)
  if (Number.isNaN(days)) return null
  if (days <= 3 && days >= 0) return 'danger'
  if (days <= 7 && days >= 0) return 'warning'
  return null
}

/** Field order for the edit dialog and the per-field `accounts.set` calls. */
export const PATCH_FIELDS = [
  'enabled',
  'tasksEnabled',
  'weight',
  'note',
  'disabledModels',
  'proxySlot',
  'dailyTokenLimit',
  'dailyCreditLimit',
  'reserveCredits',
] as const
