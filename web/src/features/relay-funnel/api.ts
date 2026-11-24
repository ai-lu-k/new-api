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
import {
  getServerErrorStatus,
  requireServerSuccess,
} from '@/lib/server-error-message'

import type { FunnelReport, RequestObservation } from './types'

type Response<T> = { success: boolean; message?: string; data: T }

export async function getRequestObservation(requestId: string) {
  try {
    const response = await api.get<Response<RequestObservation>>(
      `/api/relay-observations/${encodeURIComponent(requestId)}`
    )
    return requireServerSuccess(response.data).data
  } catch (error) {
    if (getServerErrorStatus(error) === 404) return null
    throw error
  }
}

export async function getFunnelReport(params: {
  start?: number
  end?: number
  model?: string
}) {
  const response = await api.get<Response<FunnelReport>>(
    '/api/relay-observations',
    {
      params: { ...params, limit: 10000 },
    }
  )
  return requireServerSuccess(response.data).data
}
