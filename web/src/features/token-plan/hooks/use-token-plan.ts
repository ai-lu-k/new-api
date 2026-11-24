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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSecureVerification } from '@/features/auth/secure-verification'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'
import { useAuthStore } from '@/stores/auth-store'

import {
  getTokenPlan,
  getTokenPlanKey,
  type TokenPlanSettingsChange,
  updateTokenPlanSettings,
} from '../api'

export function useTokenPlan() {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const sessionId = useAuthStore((state) => state.auth.session?.sid)
  const queryClient = useQueryClient()
  const verification = useSecureVerification()
  const cancel = verification.cancel
  const current = useRef<AbortController | null>(null)
  const settingsProof = useRef<string | null>(null)
  const [pending, setPending] = useState(false)
  const [secret, setSecret] = useState<{
    value: string
    userId: number | undefined
    sessionId: string | undefined
  } | null>(null)
  const status = useQuery({
    queryKey: ['token-plan', userId, sessionId],
    queryFn: ({ signal }) => getTokenPlan(signal),
    enabled: Boolean(userId),
    refetchInterval: 60_000,
    retry: false,
  })

  const settings = useMutation({
    mutationFn: (input: {
      change: TokenPlanSettingsChange
      signal: AbortSignal
    }) => {
      const proof = settingsProof.current
      if (!proof) throw new DOMException('Aborted', 'AbortError')
      return updateTokenPlanSettings(input.change, proof, input.signal)
    },
    meta: { errorToast: false },
  })

  useEffect(
    () => () => {
      const previous = current.current
      current.current = null
      settingsProof.current = null
      previous?.abort()
      cancel()
      setSecret(null)
      setPending(false)
    },
    [userId, sessionId, cancel]
  )

  const perform = async (
    operation: 'read' | 'rotate' | 'settings',
    change?: TokenPlanSettingsChange
  ) => {
    if (current.current) return false
    const controller = new AbortController()
    current.current = controller
    setPending(true)
    try {
      const proof = await verification.requestVerification({
        scope:
          operation === 'settings'
            ? 'token_plan.settings'
            : `token_plan.key.${operation}`,
        description:
          operation === 'settings'
            ? t(
                'Verify to change your Token Plan continuation and automatic coupon settings.'
              )
            : undefined,
      })
      if (!proof || current.current !== controller) return false
      if (operation === 'settings') {
        settingsProof.current = proof.proof_token
        const saved = await settings.mutateAsync({
          change: change ?? {},
          signal: controller.signal,
        })
        if (current.current !== controller) return false
        queryClient.setQueryData(['token-plan', userId, sessionId], saved)
        return true
      }
      const value = await getTokenPlanKey(
        operation,
        proof.proof_token,
        controller.signal
      )
      if (current.current !== controller) return false
      setSecret({ value, userId, sessionId })
      void queryClient.invalidateQueries({
        queryKey: ['token-plan', userId, sessionId],
      })
      return true
    } catch (error) {
      if (current.current !== controller) return false
      if (operation === 'rotate' || operation === 'settings') {
        setSecret(null)
        void queryClient.invalidateQueries({
          queryKey: ['token-plan', userId, sessionId],
        })
      }
      const failure = AuthOperationError.from(error)
      if (failure.code !== 'AUTH_CANCELLED') handleServerError(failure)
      return false
    } finally {
      if (current.current === controller) {
        current.current = null
        settingsProof.current = null
        setPending(false)
      }
    }
  }

  return {
    status,
    pending,
    perform,
    key:
      secret?.userId === userId && secret?.sessionId === sessionId
        ? (secret?.value ?? '')
        : '',
    clearKey: () => setSecret(null),
    verificationDialogProps: verification.dialogProps,
  }
}
