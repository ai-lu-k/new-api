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

/** Every console call answers in the site's usual envelope. */
export type HubEnvelope<T> = {
  success: boolean
  message?: string
  data?: T
}

/**
 * Reads one whitelisted WorkBuddy hub call. The key names the call, never a
 * path: the server owns the mapping and rejects anything else.
 */
export async function hubGet<T>(
  key: string,
  params?: Record<string, unknown>
): Promise<HubEnvelope<T>> {
  const res = await api.get(`/api/workbuddy/call/${key}`, { params })
  return res.data
}

/** Writes one whitelisted WorkBuddy hub call. */
export async function hubPost<T>(
  key: string,
  body?: unknown
): Promise<HubEnvelope<T>> {
  const res = await api.post(`/api/workbuddy/call/${key}`, body ?? {})
  return res.data
}

export type HubConnection = {
  enabled: boolean
  configured: boolean
  base_url: string
  reachable?: boolean
  error?: string
  health?: {
    ok?: boolean
    realm?: string
    accounts?: number
    accounts_ready?: number
    accounts_by_realm?: Record<string, number>
    accounts_ready_by_realm?: Record<string, number>
    models_ready?: Record<string, Record<string, number>>
    api_key_required?: boolean
    [key: string]: unknown
  }
}

/** Whether the console can reach the hub at all, plus the hub's own health. */
export async function getHubStatus(): Promise<HubEnvelope<HubConnection>> {
  const res = await api.get('/api/workbuddy/status')
  return res.data
}

export type HubConfig = {
  base_url: string
  enabled: boolean
  password_set: boolean
  default_base_url: string
  environment_password: boolean
}

export async function getHubConfig(): Promise<HubEnvelope<HubConfig>> {
  const res = await api.get('/api/workbuddy/config')
  return res.data
}

/** Saves the hub address and panel password, applied without a restart. */
export async function updateHubConfig(input: {
  base_url?: string
  panel_password?: string
  enabled?: boolean
}): Promise<HubEnvelope<HubConfig>> {
  const res = await api.put('/api/workbuddy/config', input)
  return res.data
}
