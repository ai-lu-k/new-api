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
import type { WorkBuddyAccountList, WorkBuddyHealth } from '../../types'

/** `/health` also reports the credential the gateway itself presents upstream. */
export type WorkBuddyGatewayHealth = WorkBuddyHealth & {
  uid?: string
  domain?: string
  credential_file?: string
  expires_at?: number
  key_accounts_bound?: number
  key_accounts_ready?: number
}

/** `/realm`: the saved egress and every realm the hub can serve. */
export type WorkBuddyRealmState = {
  current: string
  options: string[]
}

/**
 * `/accounts/credits` answers with the full account records plus the guard
 * flags the credit totals are computed from, and a busy marker for a fetch
 * that is already running upstream.
 */
export type WorkBuddyCreditsPayload = WorkBuddyAccountList & { busy?: boolean }

/** One model's resolved price source. */
export type WorkBuddyPricingSource = {
  id: string
  label: string
  via: string
  inherited_from: string | null
}

/** A model the price fetcher could not price. */
export type WorkBuddyPricingGap = {
  model: string
  reason: string
  candidates?: string[]
}

export type WorkBuddyPricingGapSummary = {
  total: number
  or_missing: number
  variant_unmatched: number
  aliases: number
  variants_enabled?: boolean
}

/** `/pricing`: the fetch schedule and which policy is in effect per model. */
export type WorkBuddyPricing = {
  interval_minutes: number
  enabled: boolean
  master_enabled: boolean
  running: boolean
  last_run: number | null
  last_run_label: string
  next_run: number | null
  next_run_label: string
  last_error: string | null
  last_models: number
  policies: number
  models: number
  current_at_label: string
  current: Record<string, WorkBuddyPricingSource>
  gaps: WorkBuddyPricingGap[]
  gap_summary: WorkBuddyPricingGapSummary
}

export type WorkBuddyUpdateInstallation = {
  state: string
  version: string
  message: string
}

/** `/updates`: versions and the installer's state; the Settings tab acts on it. */
export type WorkBuddyUpdates = {
  current_version: string
  latest_version: string | null
  latest_tag: string
  update_available: boolean
  enabled: boolean
  checking: boolean
  last_attempt: number | null
  last_success: number | null
  last_error: string
  release_url: string
  published_at: string
  install_enabled: boolean
  installation: WorkBuddyUpdateInstallation
}

/** `/console/state`: the hub's own window, when it runs as a desktop app. */
export type WorkBuddyConsoleState = {
  supported: boolean
  mode: string
  visible: boolean
}

/** Realm ids the hub reports, as i18n keys. */
export const REALM_LABEL_KEYS: Record<string, string> = {
  intl: 'Global',
  cn: 'China',
}

/** The upstream host each realm talks to, shown under its name. */
export const REALM_HOSTS: Record<string, string> = {
  intl: 'www.workbuddy.ai',
  cn: 'copilot.tencent.com',
}

/** How the hub resolved a model's price, as i18n keys. */
export const PRICE_VIA_LABEL_KEYS: Record<string, string> = {
  direct: 'Same-name match',
  override: 'Manual override',
  variant: 'Inherited from base model',
}

/** How many accounts can serve one model, summed over the realms it runs in. */
export function countReadyAccounts(
  perRealm: Record<string, number> | undefined
): number {
  if (!perRealm) return 0
  return Object.values(perRealm).reduce((sum, count) => sum + count, 0)
}

/**
 * The hub's own rule for which accounts count towards "available credits":
 * enabled, and not stopped by the reserve or a daily/credit limit guard.
 */
export function isCreditAccountUsable(account: {
  enabled: boolean
  reserveBlocked?: boolean
  dailyLimitBlocked?: boolean
  creditLimitReached?: boolean
}): boolean {
  return (
    account.enabled &&
    !account.reserveBlocked &&
    !account.dailyLimitBlocked &&
    !account.creditLimitReached
  )
}
