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

import type { Feedback } from './types'

type Result<T = undefined> = { success: boolean; message?: string; data?: T }

export async function submitFeedback(payload: {
  content: string
  contact?: string
  anonymous: boolean
}): Promise<Result> {
  const res = await api.post('/api/feedback/', payload)
  return res.data
}

/** The messages the signed-in user signed, newest first. */
export async function getOwnFeedback(): Promise<Result<Feedback[]>> {
  const res = await api.get('/api/feedback/self')
  return res.data
}

/** Every message, for administrators. `status` 0 means any. */
export async function getAllFeedback(status: number): Promise<
  Result<{ items: Feedback[]; total: number }> & { open?: number }
> {
  const res = await api.get('/api/feedback/', {
    params: { p: 1, page_size: 100, ...(status ? { status } : {}) },
  })
  return res.data
}

export async function updateFeedback(
  id: number,
  payload: { status: number; reply: string }
): Promise<Result<Feedback>> {
  const res = await api.put(`/api/feedback/${id}`, payload)
  return res.data
}
