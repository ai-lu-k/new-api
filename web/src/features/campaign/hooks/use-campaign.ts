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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { useAuthStore } from '@/stores/auth-store'

import {
  claimCampaignGuestProgress,
  claimCampaignShare,
  getCampaignStatus,
  settleCampaignRanking,
  submitCampaignAnswer,
} from '../api'

export const CAMPAIGN_QUERY_KEY = ['campaign'] as const

export function useCampaignStatus() {
  return useQuery({
    queryKey: CAMPAIGN_QUERY_KEY,
    queryFn: ({ signal }) => getCampaignStatus(signal),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

/**
 * Binds visitor progress once after signing in. The endpoint is a no-op when
 * the browser holds no visitor cookie, so it is safe to call on every visit.
 */
export function useCampaignClaim() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.auth.user)
  const started = useRef(false)
  const mutation = useMutation({
    mutationFn: () => claimCampaignGuestProgress(),
    onSuccess: (status) => {
      queryClient.setQueryData(CAMPAIGN_QUERY_KEY, status)
    },
    meta: { errorToast: false },
  })
  const mutate = useRef(mutation.mutate)
  mutate.current = mutation.mutate
  useEffect(() => {
    if (!user || started.current) return
    started.current = true
    mutate.current()
  }, [user])
  return mutation
}

export function useCampaignSubmit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: { challengeId: string; answer: string }) =>
      submitCampaignAnswer(variables.challengeId, variables.answer),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CAMPAIGN_QUERY_KEY })
    },
    meta: { errorToast: false },
  })
}

export function useCampaignShare() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => claimCampaignShare(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CAMPAIGN_QUERY_KEY })
    },
    meta: { errorToast: false },
  })
}

/**
 * The administrator's one-off ranking payout. Kept as a mutation rather than a
 * side effect of saving settings so the payout only ever happens on an explicit
 * click; the server still rejects a second attempt.
 */
export function useCampaignSettle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => settleCampaignRanking(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CAMPAIGN_QUERY_KEY })
    },
    meta: { errorToast: false },
  })
}
