import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import type { ReferralOverview } from './types'

export async function getReferralOverview(): Promise<ReferralOverview> {
  const res = await api.get('/api/user/referral')
  const response = requireServerSuccess(res.data)
  return response.data as ReferralOverview
}

// Dismissal is remembered on the account, so the banner stays closed on every
// device until a new campaign ships.
export async function dismissReferralBanner(): Promise<void> {
  const res = await api.post('/api/user/referral/banner', {})
  requireServerSuccess(res.data)
}

export interface RegistrationRewardState {
  exists: boolean
  required: boolean
  verified: boolean
  issued: boolean
}

export async function getRegistrationReward(): Promise<RegistrationRewardState> {
  const res = await api.get('/api/user/registration-reward')
  return requireServerSuccess(res.data).data as RegistrationRewardState
}

export async function retryReward(): Promise<void> {
  const res = await api.post('/api/user/registration-reward/retry', {})
  requireServerSuccess(res.data)
}
