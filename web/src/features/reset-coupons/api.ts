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
import { requireServerSuccess } from '@/lib/server-error-message'

// A batch is the record of one grant. The vouchers themselves are issued in the
// same transaction, so there is no partial or resumable state to report.
export interface VoucherBatch {
  id: number
  admin_id: number
  request_id: string
  face_value: number
  face_value_yuan: number
  validity_days: number
  expires_at: number
  reason: string
  audience: string
  recipient_count: number
  created_at: number
  status: string
}
export interface VoucherGrant {
  request_id: string
  audience: string
  user_ids: number[]
  face_value_yuan: number
  validity_days: number
  reason: string
  audience_digest?: string
}
export interface VoucherGrantPreview {
  recipients: number
  vouchers: number
  face_value: number
  total_face_value: number
  face_value_yuan: number
  total_yuan: number
  expires_at: number
  audience_digest: string
}
export type ReferralRewardStatus = 'pending' | 'issued'
export type ReferralRewardStatusFilter = '' | 'pending' | 'issued' | 'abnormal'
export interface AdminReferralReward {
  id: number
  inviter_id: number
  invitee_id: number
  inviter: string
  invitee: string
  status: ReferralRewardStatus
  pending_reason:
    | ''
    | 'email_unverified'
    | 'reward_verification_required'
    | 'token_plan_retired'
  note: '' | 'inviter_disabled'
  inviter_ordinal: number
  inviter_reward_yuan: number
  invitee_reward_yuan: number
  created_at: number
  issued_at: number
  invitee_voucher_status: string
  inviter_voucher_status: string
  invitee_voucher_expires_at: number
  inviter_voucher_expires_at: number
}
export const listVoucherBatches = (page: number, signal: AbortSignal) =>
  authResult<{ items: VoucherBatch[]; total: number }>(
    api.get('/api/admin/vouchers/batches', {
      ...authRequestOptions,
      params: { page },
      signal,
    })
  )
export const previewVoucherGrant = (data: VoucherGrant) =>
  authResult<VoucherGrantPreview>(
    api.post('/api/admin/vouchers/preview', data, authRequestOptions)
  )
export const createVoucherGrant = (data: VoucherGrant) =>
  authResult<VoucherBatch>(
    api.post('/api/admin/vouchers/grant', data, authRequestOptions)
  )
export const listReferralRewards = (
  page: number,
  size: number,
  status: ReferralRewardStatusFilter,
  signal: AbortSignal
) =>
  authResult<{ items: AdminReferralReward[]; total: number }>(
    api.get('/api/reset-coupons/referrals', {
      ...authRequestOptions,
      params: { page, size, status },
      signal,
    })
  )
export const reissueReferralReward = (id: number) =>
  authResult<AdminReferralReward>(
    api.post(
      `/api/reset-coupons/referrals/${id}/reissue`,
      undefined,
      authRequestOptions
    )
  )

export interface RegistrationRewardRecord {
  user_id: number
  inviter_id: number
  reason: string
  verified_at: number
  issued_at: number
  created_at: number
}

export async function listRegistrationRewards(
  page: number,
  signal?: AbortSignal
): Promise<{ items: RegistrationRewardRecord[]; total: number }> {
  const res = await api.get('/api/reset-coupons/registration-rewards', {
    params: { page },
    signal,
  })
  return requireServerSuccess(res.data).data
}
