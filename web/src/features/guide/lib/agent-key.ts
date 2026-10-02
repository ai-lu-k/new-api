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
import { t } from 'i18next'

import { createApiKey, fetchTokenKey, searchApiKeys } from '@/features/keys/api'
import { API_KEY_STATUS } from '@/features/keys/constants'
import type { ApiKey } from '@/features/keys/types'
import { createServerError } from '@/lib/server-error-message'

/** What stands in for the key until the user has one. */
export const KEY_PLACEHOLDER = 'YOUR_API_KEY'

/** Enough of a key to recognise it by, never enough to use it. */
export function maskKey(key: string): string {
  return `${key.slice(0, 5)}…${key.slice(-4)}`
}

/** The account's enabled, unrestricted Auto-group key of this exact name. */
async function findAgentKey(name: string): Promise<ApiKey | undefined> {
  const result = await searchApiKeys({ keyword: name, p: 1, size: 50 })
  if (!result.success) {
    throw createServerError(result, t('Failed to load API keys'))
  }
  return (result.data?.items ?? []).find(
    (key) =>
      key.name === name &&
      key.status === API_KEY_STATUS.ENABLED &&
      key.group === 'auto' &&
      key.unlimited_quota &&
      key.expired_time === -1 &&
      !key.model_limits_enabled &&
      !key.allow_ips
  )
}

/**
 * Return the key a coding client should use, creating it on first use. The
 * key sits in the Auto group so that it reaches every model, and is named
 * after the client so that the account owner can find and revoke it.
 */
export async function ensureAgentKey(name: string): Promise<string> {
  let key = await findAgentKey(name)
  if (!key) {
    const created = await createApiKey({
      name,
      remain_quota: 0,
      expired_time: -1,
      unlimited_quota: true,
      model_limits_enabled: false,
      model_limits: '',
      allow_ips: '',
      group: 'auto',
      auto_groups: [],
      cross_group_retry: true,
    })
    if (!created.success) {
      throw createServerError(created, t('Failed to prepare the API key'))
    }
    key = await findAgentKey(name)
  }
  if (!key) throw new Error(t('Failed to prepare the API key'))

  const revealed = await fetchTokenKey(key.id)
  if (!revealed.success || !revealed.data?.key) {
    throw createServerError(revealed, t('Failed to prepare the API key'))
  }
  return `sk-${revealed.data.key}`
}
