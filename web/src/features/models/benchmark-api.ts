import type { BenchmarkModel } from '@/features/pricing/lib/benchmark'
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

export type BenchmarkMappings = {
  revision: string
  models: BenchmarkModel[]
  sources: string[]
}

export const benchmarkMappingsKey = ['models', 'benchmark-mappings'] as const

export async function getBenchmarkMappings(): Promise<BenchmarkMappings> {
  const response = await api.get<{ success: boolean; data: BenchmarkMappings }>(
    '/api/models/benchmark'
  )
  return requireServerSuccess(response.data).data
}

export async function saveBenchmarkMapping(request: {
  revision: string
  model?: BenchmarkModel
  delete_id?: string
}): Promise<BenchmarkMappings> {
  const response = await api.put<{ success: boolean; data: BenchmarkMappings }>(
    '/api/models/benchmark',
    request
  )
  return requireServerSuccess(response.data).data
}
