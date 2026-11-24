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
import { authRequestOptions, authResult } from '@/lib/secure-verification'

export interface TokenPlanStatus {
  retired?: boolean
  level: number
  base_quota: number
  multiplier: number
  personal_cycle: boolean
  coupon_cycle?: boolean
  coupon_count: number
  coupon_expires_at: number
  total_quota: number
  used_quota: number
  remaining_quota: number
  week_start: number
  resets_at: number
  token_id: number
  masked_key: string
  wallet_fallback: boolean
  auto_reset_coupon: boolean
}

export async function getTokenPlan(
  signal: AbortSignal
): Promise<TokenPlanStatus> {
  const status = await authResult<TokenPlanStatus>(
    api.get('/api/token/plan', { ...authRequestOptions, signal })
  )
  if (status.token_id) return status
  return authResult<TokenPlanStatus>(
    api.post('/api/token/plan', undefined, { ...authRequestOptions, signal })
  )
}

export async function getTokenPlanKey(
  operation: 'read' | 'rotate',
  proof: string,
  signal: AbortSignal
): Promise<string> {
  const result = await authResult<{ key: string }>(
    api.post(
      `/api/token/plan/${operation === 'read' ? 'key' : 'rotate'}`,
      undefined,
      {
        ...authRequestOptions,
        headers: { 'X-Security-Proof': proof },
        singleUseAuthorization: true,
        signal,
      }
    )
  )
  return `sk-${result.key}`
}

export interface TokenPlanSettingsChange {
  walletFallback?: boolean
  autoResetCoupon?: boolean
}

export async function updateTokenPlanSettings(
  change: TokenPlanSettingsChange,
  proof: string,
  signal: AbortSignal
): Promise<TokenPlanStatus> {
  const body: { wallet_fallback?: boolean; auto_reset_coupon?: boolean } = {}
  if (change.walletFallback !== undefined) {
    body.wallet_fallback = change.walletFallback
  }
  if (change.autoResetCoupon !== undefined) {
    body.auto_reset_coupon = change.autoResetCoupon
  }
  return authResult<TokenPlanStatus>(
    api.patch('/api/token/plan/settings', body, {
      ...authRequestOptions,
      headers: { 'X-Security-Proof': proof },
      singleUseAuthorization: true,
      signal,
    })
  )
}

// A voucher's face value is already frozen into the wallet's internal quota
// unit, so what it is worth never moves with the display exchange rate. Opening
// it credits the balance directly; there is no redemption step to confirm.
export interface Voucher {
  id: number
  face_value: number
  status: 'unopened' | 'opened' | 'expired'
  expires_at: number
  opened_at: number
  acknowledged_at: number
  batch_id: number
  source: string
  created_at: number
  /** Why the money arrived, copied from the grant that issued the voucher. */
  reason?: string
}
export interface VoucherOpenResult {
  opened: number[]
  skipped: number[]
  opened_quota: number
  balance: number
}
// Arrivals are owned, still sealed and not yet acknowledged, so the notice can
// reappear on another device until the account marks it as seen.
export const listPendingVouchers = (signal?: AbortSignal) =>
  authResult<{ items: Voucher[] }>(
    api.get('/api/user/vouchers/pending', {
      ...authRequestOptions,
      signal,
    })
  )
// One id opens one voucher; a whole hand opens in a single transaction. The
// server caps a request at fifty, which is also the pending list's own cap.
export const openVouchers = (ids: number[]) =>
  authResult<VoucherOpenResult>(
    api.post(
      '/api/user/vouchers/open',
      { voucher_ids: ids },
      authRequestOptions
    )
  )
// Marks the notice as read. It never opens, spends or extends a voucher.
export const acknowledgeVouchers = (ids: number[]) =>
  authResult<{ acknowledged: number }>(
    api.post(
      '/api/user/vouchers/acknowledge',
      { voucher_ids: ids },
      authRequestOptions
    )
  )
