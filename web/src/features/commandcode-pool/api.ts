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
import { api } from '@/lib/api'

import type {
  CommandCodeCredits,
  CommandCodeCreditsRefreshResult,
  CommandCodeKeyInput,
  CommandCodeKeyPatch,
  CommandCodeLoadBalancing,
  CommandCodeOverview,
  CommandCodePoolConfig,
  CommandCodePoolEnvelope,
  CommandCodePoolKey,
  CommandCodePoolSettings,
  CommandCodePoolState,
  CommandCodePoolStatus,
  CommandCodeSettingsState,
} from './types'

const ROOT = '/api/commandcode-pool'

/** Query key prefix; every pool read and write invalidates under it. */
export const COMMAND_CODE_POOL_QUERY_ROOT = ['commandcode-pool'] as const

export const commandCodePoolKeys = {
  status: [...COMMAND_CODE_POOL_QUERY_ROOT, 'status'] as const,
  config: [...COMMAND_CODE_POOL_QUERY_ROOT, 'config'] as const,
  pool: [...COMMAND_CODE_POOL_QUERY_ROOT, 'pool'] as const,
  overview: [...COMMAND_CODE_POOL_QUERY_ROOT, 'overview'] as const,
  lb: [...COMMAND_CODE_POOL_QUERY_ROOT, 'lb'] as const,
  settings: [...COMMAND_CODE_POOL_QUERY_ROOT, 'settings'] as const,
}

export async function getPoolStatus(): Promise<
  CommandCodePoolEnvelope<CommandCodePoolStatus>
> {
  const res = await api.get(`${ROOT}/status`)
  return res.data
}

export async function getPoolConfig(): Promise<
  CommandCodePoolEnvelope<CommandCodePoolConfig>
> {
  const res = await api.get(`${ROOT}/config`)
  return res.data
}

/** Saves the proxy address and whether the console may use it. */
export async function updatePoolConfig(input: {
  base_url?: string
  enabled?: boolean
}): Promise<CommandCodePoolEnvelope<CommandCodePoolConfig>> {
  const res = await api.put(`${ROOT}/config`, input)
  return res.data
}

/** The whole pool: keys, load balancing, settings and the refresh state. */
export async function getPoolState(): Promise<
  CommandCodePoolEnvelope<CommandCodePoolState>
> {
  const res = await api.get(`${ROOT}/pool`)
  return res.data
}

export async function getLoadBalancing(): Promise<
  CommandCodePoolEnvelope<CommandCodeLoadBalancing>
> {
  const res = await api.get(`${ROOT}/lb`)
  return res.data
}

/** Where the proxy sends traffic and which endpoints it exposes. */
export async function getPoolOverview(): Promise<
  CommandCodePoolEnvelope<CommandCodeOverview>
> {
  const res = await api.get(`${ROOT}/overview`)
  return res.data
}

export async function updateLoadBalancing(input: {
  strategy?: string
  stickyBy?: string
  maxRetries?: number
  cooldownMs?: number
  expiryFirst?: boolean
}): Promise<CommandCodePoolEnvelope<CommandCodeLoadBalancing>> {
  const res = await api.put(`${ROOT}/lb`, input)
  return res.data
}

export async function getPoolSettings(): Promise<
  CommandCodePoolEnvelope<CommandCodeSettingsState>
> {
  const res = await api.get(`${ROOT}/settings`)
  return res.data
}

/**
 * Saves the scheduling settings. Only the fields passed are changed; `alerts`
 * is deliberately never sent, because it has its own proxy endpoint.
 */
export async function updatePoolSettings(
  input: Partial<CommandCodePoolSettings>
): Promise<CommandCodePoolEnvelope<CommandCodeSettingsState>> {
  const res = await api.put(`${ROOT}/settings`, input)
  return res.data
}

export async function createPoolKey(
  input: CommandCodeKeyInput
): Promise<CommandCodePoolEnvelope<CommandCodePoolKey>> {
  const res = await api.post(`${ROOT}/keys`, input)
  return res.data
}

export async function updatePoolKey(
  id: string,
  input: CommandCodeKeyPatch
): Promise<CommandCodePoolEnvelope<CommandCodePoolKey>> {
  const res = await api.patch(`${ROOT}/keys/${encodeURIComponent(id)}`, input)
  return res.data
}

export async function deletePoolKey(
  id: string
): Promise<CommandCodePoolEnvelope<null>> {
  const res = await api.delete(`${ROOT}/keys/${encodeURIComponent(id)}`)
  return res.data
}

/** Re-reads one key's credits from upstream; slow, it waits for the provider. */
export async function getKeyCredits(
  id: string
): Promise<CommandCodePoolEnvelope<CommandCodeCredits>> {
  const res = await api.get(`${ROOT}/keys/${encodeURIComponent(id)}/credits`)
  return res.data
}

/** Re-reads every key's credits; the proxy does one upstream call per key. */
export async function refreshAllCredits(): Promise<
  CommandCodePoolEnvelope<CommandCodeCreditsRefreshResult>
> {
  const res = await api.post(`${ROOT}/keys/refresh-credits`, {})
  return res.data
}
