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
import type { WorkBuddyAccount, WorkBuddyCredits } from '../../types'

/**
 * The hub reports `tier` as the upstream billing summary, not as a label, so the
 * shared account type is narrowed here instead of being edited.
 */
export type HubTier = {
  paid?: boolean
  package?: string
  package_code?: string
  trial?: number
  checked_at?: number
  source?: string
}

export type HubAccount = Omit<WorkBuddyAccount, 'tier' | 'credits'> & {
  tier?: HubTier | null
  credits?: WorkBuddyCredits
}

export type HubAccountList = {
  accounts: HubAccount[]
  storage?: string
  usable?: number
}

/** One `/accounts/set` body; the hub takes a single field per call. */
export type AccountPatch = {
  enabled?: boolean
  tasksEnabled?: boolean
  weight?: number
  note?: string
  disabledModels?: string[]
  proxySlot?: string
  dailyTokenLimit?: number | null
  dailyCreditLimit?: number | null
  reserveCredits?: number | null
}

/** Per-account outcome the hub returns for refresh, check-in and daily chat. */
export type HubTaskResult = {
  uid?: string
  nickname?: string
  ok?: boolean
  error?: string
  msg?: string
  credit?: number
}

export type HubTaskResponse = {
  results?: HubTaskResult[]
}

export type HubTestRow = {
  uid?: string
  nickname?: string
  ok?: boolean
  network?: boolean
  model?: string
  reply?: string
  error?: string
  status?: number
  elapsed_ms?: number
}

export type HubTestResponse = HubTestRow & {
  results?: HubTestRow[]
  summary?: {
    tested?: number
    passed?: number
    failed?: number
    elapsed_ms?: number
    model?: string
    networkDown?: boolean
  }
  network?: { ok?: boolean; error?: string }
}

export type HubCreditsResponse = {
  accounts?: HubAccount[]
  busy?: boolean
}

export type HubCreditsDetail = {
  ok?: boolean
  uid?: string
  nickname?: string
  realm?: string
  credits?: WorkBuddyCredits
}

/** One line of `/accounts/credits/grants`, which reports every account at once. */
export type HubGrantRow = {
  uid: string
  nickname?: string
  realm?: string
  name?: string
  product?: string
  grant_reason?: string
  size?: number
  remain?: number
  used?: number
  create_iso?: string
  expire_iso?: string
  days_left?: number | null
  no_expiry?: boolean
  status?: string
}

export type HubGrants = {
  rows?: HubGrantRow[]
  summary?: { count?: number; size?: number; remain?: number; used?: number }
}

export type HubImportOutcome = (string | { uid: string; reason?: string })[]

export type HubImportResult = {
  added?: HubImportOutcome
  updated?: HubImportOutcome
  skipped?: HubImportOutcome
  invalid?: HubImportOutcome
}

export type HubImportResponse = {
  result?: HubImportResult
}

export type HubLoginStart = {
  state?: string
  authUrl?: string
  ok?: boolean
}

export type HubLoginPoll = {
  status?: string
  message?: string
  account?: { nickname?: string }
}

export type HubExportDoc = {
  format?: string
  version?: number
  exportedAt?: string
  count?: number
  accounts?: unknown[]
}
