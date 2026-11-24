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
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'

import { getRegistrationReward, retryReward } from '../api'

// Failed reward writes remain retryable after account creation; verification
// itself happens before account creation.
export function RewardVerification() {
  const { t } = useTranslation()
  const identity = useAuthStore(
    (state) => `${state.auth.user?.id}:${state.auth.session?.sid}`
  )
  const state = useQuery({
    queryKey: ['registration-reward', identity],
    queryFn: getRegistrationReward,
  })
  const client = useQueryClient()
  const retry = useMutation({
    mutationFn: retryReward,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['registration-reward'] })
      void client.invalidateQueries({ queryKey: ['referral-overview'] })
    },
  })
  if (!state.data?.exists || state.data.required || state.data.issued) {
    return null
  }
  return (
    <Button disabled={retry.isPending} onClick={() => retry.mutate()}>
      {t('Retry reward issuance')}
    </Button>
  )
}
