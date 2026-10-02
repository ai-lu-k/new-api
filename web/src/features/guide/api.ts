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

import type { SetupModel } from './lib/agents'

export type DshSetupCode = {
  code: string
  /** Unix seconds after which the code can no longer be redeemed. */
  expires_at: number
}

/** Prepare this account's DSH key and get a one-time code for the setup script. */
export async function createDshSetupCode(): Promise<{
  success: boolean
  message?: string
  data?: DshSetupCode
}> {
  const res = await api.post('/api/dsh_setup/code')
  return res.data
}

export type SetupCatalog = {
  /** Whether this account can use the Auto group, i.e. one key for every model. */
  auto_group: boolean
  default_model: string
  models: SetupModel[]
}

/** The models the quick-start guides should offer this account. */
export async function getSetupCatalog(): Promise<{
  success: boolean
  message?: string
  data?: SetupCatalog
}> {
  const res = await api.get('/api/dsh_setup/models')
  return res.data
}
