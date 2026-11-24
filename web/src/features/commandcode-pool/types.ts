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
import { z } from 'zod'

/** Every console call answers in the site's usual envelope. */
export type CommandCodePoolEnvelope<T> = {
  success: boolean
  message?: string
  data?: T
}

/** Whether this instance can reach its CommandCode proxy, and the pool size. */
export type CommandCodePoolStatus = {
  enabled: boolean
  configured: boolean
  base_url: string
  reachable?: boolean
  error?: string
  keys_total?: number
  keys_enabled?: number
  api_base?: string
}

/** The proxy address this console talks to; these are new-api's own options. */
export type CommandCodePoolConfig = {
  base_url: string
  enabled: boolean
  default_base_url: string
}

/** One quota window the proxy reads from upstream. */
export type CommandCodeCreditsWindow = {
  name: string
  used: number
  cap: number
  resetsAt?: number | null
  pct?: number
}

export type CommandCodeSubscription = {
  plan?: string | null
  status?: string | null
  createdAt?: number | null
  expiresAt?: number | null
}

/** The proxy's last reading of one key's credits. `error` means it failed. */
export type CommandCodeCredits = {
  plan?: string | null
  creditsRemaining?: number
  /** The ledger split the proxy reads upstream: monthly, purchased and free. */
  credits?: {
    monthly?: number
    purchased?: number
    free?: number
    remaining?: number
  } | null
  windows?: CommandCodeCreditsWindow[]
  fetchedAt?: number
  expiresAt?: number | null
  subscription?: CommandCodeSubscription | null
  /** The worst window percentage the proxy computed; absent on older builds. */
  worstPct?: number | null
  error?: string
}

/** Set by the proxy when it took a key out of rotation on its own. */
export type CommandCodeAutoDisabled = {
  reason: string
  at: number
  until?: number | null
}

export type CommandCodePoolKey = {
  id: string
  label: string
  keyPrefix: string
  weight: number
  enabled: boolean
  priority: number
  createdAt?: number
  lastUsedAt?: number | null
  lastErrorAt?: number | null
  errorCount?: number
  consecutiveFailures?: number
  autoDisabled?: CommandCodeAutoDisabled | null
  cooldownUntil?: number
  /** The proxy reports this as `cooldownUntil > now`, which can be 0 rather
   * than false for a key that never cooled down. */
  cooling?: boolean | number
  credits?: CommandCodeCredits | null
  expiresAt?: number | null
  activeSessions?: number
  /** Requests currently on the wire for this key. */
  inflight?: number
}

/**
 * The load-balancing block. Only `maxRetries` and `cooldownMs` exist on the
 * deployed proxy; the dispatch fields appear once it is upgraded, so the form
 * renders whatever the reply actually carries.
 */
export type CommandCodeLoadBalancing = {
  maxRetries: number
  cooldownMs: number
  strategy?: string
  stickyBy?: string
  expiryFirst?: boolean
}

/**
 * The scheduling settings. `expiryBusyMs` only exists on proxy builds that
 * support expiry-first dispatch, so it is optional and never sent back when the
 * reply does not carry it.
 */
export type CommandCodePoolSettings = {
  mode: string
  failThreshold: number
  sessionTtlMs: number
  creditsRefreshMs: number
  autoDisableExhausted: boolean
  onAllExhausted: string
  expiryBusyMs?: number
}

/** The proxy's own view of its credits polling job. */
export type CommandCodeCreditsRefresh = {
  intervalMs: number
  running: boolean
  lastAt: number
  nextAt: number
  lastDurationMs: number
  lastOk: number
  lastFailed: number
  lastError: string | null
}

/** One entry of the proxy's dispatch order; only usable keys appear here. */
export type CommandCodePoolOrderEntry = {
  id: string
  label?: string
  priority?: number
  inflight?: number
  sessions?: number
  idle?: boolean
  expiresAt?: number | null
}

/** The pool snapshot: keys, load balancing, settings and the refresh state. */
export type CommandCodePoolState = {
  apiBase?: string
  lb: CommandCodeLoadBalancing
  settings: CommandCodePoolSettings
  creditsRefresh: CommandCodeCreditsRefresh
  serverTime?: number
  /** The order the proxy would dispatch in; keys missing here cannot serve. */
  poolOrder?: CommandCodePoolOrderEntry[]
  sessions?: unknown[]
  keys: CommandCodePoolKey[]
}

export type CommandCodeSettingsState = {
  settings: CommandCodePoolSettings
  creditsRefresh: CommandCodeCreditsRefresh
}

export type CommandCodeCreditsRefreshResult = {
  results: { id: string; credits: CommandCodeCredits | null }[]
  creditsRefresh: CommandCodeCreditsRefresh
}

/** What a new key needs before the proxy will accept it. */
export type CommandCodeKeyInput = {
  key: string
  label: string
  weight: number
  priority: number
  enabled: boolean
}

/** The editable half of a stored key. The credential itself is not returned. */
export type CommandCodeKeyPatch = {
  label?: string
  weight?: number
  priority?: number
  enabled?: boolean
}

/** One egress identity the proxy advertises upstream. */
export type CommandCodeOverviewEgress = {
  /** The address the proxy answers on inside its own network. */
  internal?: string
  prefix?: string
  endpoints?: string[]
}

/** One upstream source the proxy serves; `cc` is this console's pool. */
export type CommandCodeOverviewSource = {
  id: string
  name?: string
  subtitle?: string
  icon?: string
  tone?: string
  upstream?: string
  entry?: string
  /** The proxy's own wording for the entry, e.g. the endpoint it accepts. */
  entryLabel?: string
  note?: string
  egress?: CommandCodeOverviewEgress
}

export type CommandCodeOverview = {
  sources: CommandCodeOverviewSource[]
}

/** The upstream key shape the proxy enforces; it is never relaxed here. */
export const COMMAND_CODE_KEY_PATTERN = /^user_[A-Za-z0-9_-]+$/

export const commandCodeKeyFormSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'The upstream key is required.')
    .regex(COMMAND_CODE_KEY_PATTERN, 'The key must start with user_.'),
  label: z.string().trim().max(64, 'The label is too long.'),
  weight: z.number().min(0).max(1000),
  priority: z.number().min(-1000).max(1000),
  enabled: z.boolean(),
})

export type CommandCodeKeyFormValues = z.infer<typeof commandCodeKeyFormSchema>

/**
 * The proxy only writes a label that survives trimming, so an empty one would
 * be accepted by the form and then silently ignored by the proxy.
 */
export const commandCodeKeyEditSchema = commandCodeKeyFormSchema
  .omit({ key: true })
  .extend({
    label: z
      .string()
      .trim()
      .min(1, 'The label must not be empty.')
      .max(64, 'The label is too long.'),
  })

export type CommandCodeKeyEditValues = z.infer<typeof commandCodeKeyEditSchema>
