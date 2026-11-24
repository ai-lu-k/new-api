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

/** One guard rail as the hub stores it: a global value plus optional overrides. */
export type HubLimitEntry = {
  global: number | null
  intl: number | null
  cn: number | null
}

/** The five guard rails, keyed exactly as the hub's `limits` object. */
export type HubLimits = {
  reserve_credits: HubLimitEntry
  daily_token_limit: HubLimitEntry
  daily_credit_limit: HubLimitEntry
  model_daily_token_limit: HubLimitEntry
  expiring_window_days: HubLimitEntry
}

export type HubLimitKey = keyof HubLimits
export type HubLimitScope = 'global' | 'intl' | 'cn'

/** One per-key egress binding. `key` is only sent when the operator types one. */
export type HubApiKey = {
  id?: string
  name?: string
  realm?: string
  models?: string[]
  accounts?: string[]
  concurrency_limit?: number
  enabled?: boolean
  masked?: string
  key?: string
  created_at?: string
  deleted_at?: string
}

/**
 * The hub's whole settings payload. Only the fields this console renders are
 * typed; the rest of the payload travels untouched because saving is a patch.
 */
export type HubSettings = {
  panel_password_is_default: boolean
  api_key_set: boolean
  api_key_set_by_panel: boolean
  api_key_masked: string
  auth_required: boolean
  api_keys: HubApiKey[]
  deleted_api_keys: HubApiKey[]
  limits: HubLimits
  reserve_credits: number
  daily_token_limit: number
  daily_credit_limit: number
  model_daily_token_limit: number
  pricing_refresh_minutes: number
  credits_refresh_hours: number
  pricing_variant_inherit: boolean
  pricing_enabled: boolean
  auto_switch_product: boolean
  auto_switch_products: string[]
  free_model_credit_fallback: boolean
  enable_anthropic_messages: boolean
  filter_models_by_key: boolean
  reasoning_effort_map: boolean
  models_only_available: boolean
  daily_chat_web: boolean
  daily_chat_web_fallback_activity: boolean
  local_web_tools: boolean
  remaining_priority_enabled: boolean
  egress_backoff_enabled: boolean
  realm_fallback_enabled: boolean
  window_probe: boolean
  affinity_stable_key_enabled: boolean
  update_check_enabled: boolean
  account_max_concurrent: number
  account_max_concurrent_max: number
  version: string
}

/** Scalar settings this console edits; each key is a top-level save field. */
export type HubSettingsScalarKey =
  | 'pricing_enabled'
  | 'pricing_refresh_minutes'
  | 'pricing_variant_inherit'
  | 'enable_anthropic_messages'
  | 'reasoning_effort_map'
  | 'filter_models_by_key'
  | 'models_only_available'
  | 'free_model_credit_fallback'
  | 'auto_switch_product'
  | 'daily_chat_web'
  | 'daily_chat_web_fallback_activity'
  | 'local_web_tools'
  | 'remaining_priority_enabled'
  | 'egress_backoff_enabled'
  | 'realm_fallback_enabled'
  | 'window_probe'
  | 'affinity_stable_key_enabled'
  | 'update_check_enabled'

export type HubSettingsScalarValue = boolean | number

/** Edits waiting to be saved. An absent key means "unchanged". */
export type HubSettingsDraft = {
  values: Partial<Record<HubSettingsScalarKey, HubSettingsScalarValue>>
  limits?: HubLimits
}

export const EMPTY_DRAFT: HubSettingsDraft = { values: {} }

/** Props every scalar-setting section shares: the server value plus the draft. */
export type HubScalarSectionProps = {
  settings: HubSettings
  values: Partial<Record<HubSettingsScalarKey, HubSettingsScalarValue>>
  onChange: (key: HubSettingsScalarKey, value: HubSettingsScalarValue) => void
}

/** The five guard rails in the order the hub documents them. */
export const LIMIT_ROWS: { key: HubLimitKey; label: string }[] = [
  { key: 'reserve_credits', label: 'Reserved credits' },
  { key: 'daily_token_limit', label: 'Daily token limit' },
  { key: 'daily_credit_limit', label: 'Daily credit limit' },
  { key: 'model_daily_token_limit', label: 'Per-model daily token limit' },
  { key: 'expiring_window_days', label: 'Expiring credits first' },
]

export type HubProxySlot = {
  id: string
  name?: string
  url: string
  enabled?: boolean
  ip?: string
  country?: string
  country_code?: string
  ip_type?: string
  isp?: string
  asn?: string
  probed_at?: number
  bound?: number
  label?: string
}

export type HubProxySlotList = { slots: HubProxySlot[] }

export type HubProxyDiscoverCandidate = {
  url: string
  reachable?: boolean
  exit_ip?: string
  country?: string
  country_code?: string
  ip_type?: string
  isp?: string
  asn?: string
  latency_ms?: number
}

export type HubUpdateStatus = {
  current_version: string
  latest_version: string | null
  latest_tag: string
  update_available: boolean
  enabled: boolean
  checking: boolean
  last_attempt: string | null
  last_success: string | null
  last_error: string
  release_url: string
  published_at: string
  install_enabled: boolean
  installation: { state: string; version: string; message: string }
}

export type HubUpdateBackup = {
  version: string
  created_at?: string
  files?: number
  complete?: boolean
  reason?: string
}

export type HubUpdateBackups = {
  current_version?: string
  keep_backups?: number
  rollback_enabled?: boolean
  backups: HubUpdateBackup[]
}
