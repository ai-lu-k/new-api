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
import { requireServerSuccess } from '@/lib/server-error-message'

export interface PlanUserUsage {
  user_id: number
  username: string
  display_name: string
  status: number
  activated: boolean
  wallet_fallback: boolean
  level: number
  base_quota: number
  multiplier: number
  total_quota: number
  used_quota: number
  reserved_quota: number
  remaining_quota: number
  wallet_used_quota: number
  week_start: number
  resets_at: number
  personal_cycle: boolean
  coupon_cycle: boolean
}
export interface PlanOverview {
  users: number
  activated_users: number
  total_quota: number
  used_quota: number
  reserved_quota: number
  remaining_quota: number
  wallet_used_quota: number
  as_of: number
}
export interface PlanUsageTotals {
  requests: number
  free_used: number
  wallet_used: number
}
export interface PlanUsageDay {
  date: string
  requests: number
  free_used: number | null
  wallet_used: number | null
}
export interface PlanUsageTrend {
  days: PlanUsageDay[]
  total: PlanUsageTotals
  undated: PlanUsageTotals
}
export async function getPlanStatistics<T>(
  resource: 'overview' | 'users' | 'trend',
  params: Record<string, string | number>,
  signal: AbortSignal
): Promise<T> {
  const response = await api.get<{ success: boolean; data: T }>(
    `/api/token-plan/statistics/${resource}`,
    { params, signal }
  )
  return requireServerSuccess(response.data).data
}
