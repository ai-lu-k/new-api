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

import type {
  CampaignRankingSettlement,
  CampaignShareResult,
  CampaignStatus,
  CampaignSubmitResult,
} from './types'

export async function getCampaignStatus(
  signal?: AbortSignal
): Promise<CampaignStatus> {
  const response = await api.get('/api/campaign', { signal })
  return requireServerSuccess(response.data).data as CampaignStatus
}

export async function submitCampaignAnswer(
  challengeId: string,
  answer: string,
  signal?: AbortSignal
): Promise<CampaignSubmitResult> {
  const response = await api.post(
    '/api/campaign/submit',
    { challenge_id: challengeId, answer },
    { signal }
  )
  return requireServerSuccess(response.data).data as CampaignSubmitResult
}

export async function claimCampaignGuestProgress(
  signal?: AbortSignal
): Promise<CampaignStatus> {
  const response = await api.post('/api/campaign/claim', {}, { signal })
  return requireServerSuccess(response.data).data as CampaignStatus
}

export async function claimCampaignShare(
  signal?: AbortSignal
): Promise<CampaignShareResult> {
  const response = await api.post('/api/campaign/share', {}, { signal })
  return requireServerSuccess(response.data).data as CampaignShareResult
}

/**
 * The administrator's one-off ranking payout. The server rejects it unless the
 * event has ended and nothing has been settled yet, so the UI never has to own
 * that decision — it only decides whether the button looks clickable.
 */
export async function settleCampaignRanking(
  signal?: AbortSignal
): Promise<CampaignRankingSettlement> {
  const response = await api.post('/api/campaign/admin/settle', {}, { signal })
  return requireServerSuccess(response.data).data as CampaignRankingSettlement
}
