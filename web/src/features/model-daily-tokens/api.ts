import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

export type ModelDailyBudget = {
  model: string
  limit: number
  used: number
  remaining: number
  unlimited: boolean
  resets_at: number
}
export type ModelDailyBudgets = {
  models: ModelDailyBudget[]
  updated_at: number
  resets_at: number
  timezone: string
}
export async function getModelDailyBudgets() {
  const response = await api.get<{ success: boolean; data: ModelDailyBudgets }>(
    '/api/user/self/model-daily-tokens'
  )
  return requireServerSuccess(response.data).data
}
