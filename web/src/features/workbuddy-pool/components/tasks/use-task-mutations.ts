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
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { hubPost } from '../../api'
import { invalidateAccountState, invalidateScheduler } from './invalidate'
import type {
  WorkBuddyClaimInput,
  WorkBuddyClaimResult,
  WorkBuddyRunInput,
  WorkBuddyRunResult,
  WorkBuddyScheduler,
  WorkBuddySchedulerTriggerResult,
  WorkBuddyUidInput,
  WorkBuddyWelfareResult,
} from './types'

/**
 * Claims one finished task for one account. The hub answers 200 with `ok:false`
 * when the upstream has not settled the progress yet, so the refusal is shown
 * with the hub's own wording instead of a generic failure.
 */
export function useClaimTask(): UseMutationResult<
  WorkBuddyClaimResult,
  Error,
  WorkBuddyClaimInput
> {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: WorkBuddyClaimInput) => {
      const response = requireServerSuccess(
        await hubPost<WorkBuddyClaimResult>('tasks.claim', {
          uid: input.uid,
          code: input.code,
        })
      )
      return response.data ?? { ok: false }
    },
    onSuccess: async (data) => {
      if (data.ok) {
        toast.success(
          t('Reward claimed, +{{credit}} credits', { credit: data.credit ?? 0 })
        )
      } else {
        toast.error(data.msg || t('The hub refused this claim'))
      }
      await invalidateAccountState(queryClient)
    },
    onError: (error) =>
      handleServerError(error, t('Could not claim this reward')),
  })
}

/** Runs the hub's automatic task runner, optionally claiming as it goes. */
export function useRunTasks(): UseMutationResult<
  WorkBuddyRunResult,
  Error,
  WorkBuddyRunInput
> {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: WorkBuddyRunInput) => {
      const response = requireServerSuccess(
        await hubPost<WorkBuddyRunResult>('tasks.run', input)
      )
      return response.data ?? { ok: false }
    },
    onSuccess: async (data) => {
      if (data.ok) {
        toast.success(
          t('Tasks finished for {{accounts}} accounts, +{{credit}} credits', {
            accounts: data.accounts_count ?? 0,
            credit: data.credit_added ?? 0,
          })
        )
      } else {
        toast.error(data.msg || t('The hub could not run the tasks'))
      }
      await invalidateAccountState(queryClient)
    },
    onError: (error) => handleServerError(error, t('Could not run the tasks')),
  })
}

/** Redeems streak tiers and spends the lottery chances on live accounts. */
export function useStreakBonus(): UseMutationResult<
  WorkBuddyWelfareResult,
  Error,
  WorkBuddyUidInput
> {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: WorkBuddyUidInput) => {
      const response = requireServerSuccess(
        await hubPost<WorkBuddyWelfareResult>('tasks.streak-bonus', input)
      )
      return response.data ?? { ok: false }
    },
    onSuccess: async (data) => {
      if (data.ok) {
        toast.success(data.msg || t('Streak bonus finished'))
      } else {
        toast.error(data.msg || t('The hub could not redeem the streak bonus'))
      }
      await invalidateAccountState(queryClient)
    },
    onError: (error) =>
      handleServerError(error, t('Could not redeem the streak bonus')),
  })
}

/** Collects a finished cat trip, or sends the cat travelling. */
export function useCatTravel(): UseMutationResult<
  WorkBuddyWelfareResult,
  Error,
  WorkBuddyUidInput
> {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: WorkBuddyUidInput) => {
      const response = requireServerSuccess(
        await hubPost<WorkBuddyWelfareResult>('tasks.travel', input)
      )
      return response.data ?? { ok: false }
    },
    onSuccess: async (data) => {
      if (data.ok) {
        toast.success(data.msg || t('Cat travel finished'))
      } else {
        toast.error(data.msg || t('The hub could not settle the cat travel'))
      }
      await invalidateAccountState(queryClient)
    },
    onError: (error) =>
      handleServerError(error, t('Could not settle the cat travel')),
  })
}

/** Pauses or resumes the background scheduler. */
export function useSchedulerToggle(): UseMutationResult<
  WorkBuddyScheduler,
  Error,
  void
> {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response = requireServerSuccess(
        await hubPost<WorkBuddyScheduler>('scheduler.toggle', {})
      )
      return response.data ?? { enabled: false }
    },
    onSuccess: async (data) => {
      if (data.enabled) {
        toast.success(t('Scheduler enabled'))
      } else {
        toast.success(t('Scheduler paused'))
      }
      await invalidateScheduler(queryClient)
    },
    onError: (error) =>
      handleServerError(error, t('Could not switch the scheduler')),
  })
}

/** Runs one scheduler patrol right now, on live accounts. */
export function useSchedulerTrigger(): UseMutationResult<
  WorkBuddySchedulerTriggerResult,
  Error,
  void
> {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response = requireServerSuccess(
        await hubPost<WorkBuddySchedulerTriggerResult>('scheduler.trigger', {})
      )
      return response.data ?? { ok: false }
    },
    onSuccess: async (data) => {
      if (data.ok) {
        toast.success(data.msg || t('Scheduler patrol started'))
      } else {
        toast.error(data.msg || t('The hub could not start a patrol'))
      }
      await invalidateScheduler(queryClient)
      await invalidateAccountState(queryClient)
    },
    onError: (error) => handleServerError(error, t('Could not start a patrol')),
  })
}
