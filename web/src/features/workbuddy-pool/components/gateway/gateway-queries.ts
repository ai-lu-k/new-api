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
import { requireServerSuccess } from '@/lib/server-error-message'

import { hubGet } from '../../api'

/**
 * Every Gateway query key starts with this prefix, so a single invalidation
 * after `pricing.refresh` refreshes whatever the tab is showing.
 */
export const GATEWAY_QUERY_ROOT = ['workbuddy', 'gateway'] as const

export const gatewayKeys = {
  health: [...GATEWAY_QUERY_ROOT, 'health'] as const,
  realm: [...GATEWAY_QUERY_ROOT, 'realm'] as const,
  credits: [...GATEWAY_QUERY_ROOT, 'credits'] as const,
  pricing: [...GATEWAY_QUERY_ROOT, 'pricing'] as const,
  updates: [...GATEWAY_QUERY_ROOT, 'updates'] as const,
  console: [...GATEWAY_QUERY_ROOT, 'console'] as const,
  recent: [...GATEWAY_QUERY_ROOT, 'recent'] as const,
}

/**
 * One read-only hub call. A refused call rejects with the hub's own wording so
 * the query's error state can show it; an empty body stays `undefined` and the
 * panel renders its empty state instead of inventing data.
 */
export async function readHub<T>(
  key: string,
  params?: Record<string, unknown>
): Promise<T | undefined> {
  const response = requireServerSuccess(await hubGet<T>(key, params))
  return response.data
}
