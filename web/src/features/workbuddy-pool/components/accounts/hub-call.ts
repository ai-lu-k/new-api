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
import i18next from 'i18next'

import { hubPost } from '../../api'

type HubEnvelope = { success: boolean; message?: string; data?: unknown }

/** The hub explains its own refusals; keep that wording instead of inventing one. */
export function refusalMessage(response: HubEnvelope): string {
  return (
    response.message || i18next.t('The WorkBuddy gateway refused this request.')
  )
}

/**
 * One POST to a whitelisted hub key. The hub answers 200 with `success: false`
 * when it refuses, so a business failure has to be raised here.
 */
export async function writeHub<T>(
  key: string,
  body?: unknown
): Promise<T | undefined> {
  const response = await hubPost<T>(key, body)
  if (!response.success) throw new Error(refusalMessage(response))
  return response.data
}
