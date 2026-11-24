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
import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useMemo } from 'react'

import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  indexBenchmarkModels,
  type BenchmarkDimension,
  type BenchmarkModality,
  type BenchmarkModel,
  type BenchmarkSnapshot,
} from '../lib/benchmark'

export function useBenchmark() {
  const query = useQuery({
    queryKey: ['benchmark'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: BenchmarkSnapshot }>(
        '/api/benchmark'
      )
      const data = requireServerSuccess(res.data).data
      if (
        !data ||
        !Array.isArray(data.models) ||
        !Array.isArray(data.dimensions) ||
        data.models.some(
          (model) =>
            !Array.isArray(model.aliases) || !Array.isArray(model.tiers)
        )
      ) {
        throw new Error('Benchmark scores unavailable')
      }
      return data
    },
    staleTime: 30 * 60 * 1000,
    meta: { errorToast: false },
  })
  const models = useMemo(
    () => indexBenchmarkModels(query.data?.models ?? []),
    [query.data]
  )
  return { ...query, models }
}

export const BenchmarkContext = createContext<{
  models: ReadonlyMap<string, BenchmarkModel>
  modality: BenchmarkModality
  dimension: string
  dimensions: BenchmarkDimension[]
  /** The published leaderboard's version, as the server names it. */
  version?: string
  onDimensionChange?: (dimension: string) => void
}>({
  models: new Map(),
  modality: 'text',
  dimension: 'overall',
  dimensions: [],
})

export function useBenchmarkColumn() {
  return useContext(BenchmarkContext)
}
