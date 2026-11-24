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

import { getPerfMetricsSummary } from '@/features/performance-metrics/api'
import { useRankings } from '@/features/rankings/hooks/use-rankings'
import { requireServerSuccess } from '@/lib/server-error-message'

import type { ModelPerfBadgeData } from '../components/model-perf-badge'

/**
 * Live usage figures for the model list: latency, throughput and success over
 * the last day, tokens over the last week for text models, and calls over the
 * last week for image models. Any of them may be missing (a new site, or
 * rankings switched off); callers show a dash then.
 */
export function useModelStats() {
  const perfQuery = useQuery({
    queryKey: ['perf-metrics-summary', 24],
    queryFn: async () => requireServerSuccess(await getPerfMetricsSummary(24)),
    staleTime: 60 * 1000,
    retry: false,
  })
  const rankingsQuery = useRankings('week')

  const perf = useMemo(() => {
    const map = new Map<string, ModelPerfBadgeData>()
    for (const model of perfQuery.data?.data?.models ?? []) {
      map.set(model.model_name, {
        ...model,
        window_start: perfQuery.data?.data.window_start,
        window_end: perfQuery.data?.data.window_end,
      })
    }
    return map
  }, [perfQuery.data])

  // Decision models rank on their own board, so the text board never carries
  // them; their week is read from that board instead.
  const weeklyTokens = useMemo(() => {
    const map = new Map<string, number>()
    for (const model of rankingsQuery.data?.data?.models ?? []) {
      map.set(model.model_name, model.total_tokens)
    }
    for (const model of rankingsQuery.data?.data?.decision_models ?? []) {
      map.set(model.model_name, model.total_tokens)
    }
    return map
  }, [rankingsQuery.data])

  // Image and decision models are also counted in calls; the image board keeps
  // that figure for pictures, the decision board for evaluations.
  const weeklyCalls = useMemo(() => {
    const map = new Map<string, number>()
    for (const model of rankingsQuery.data?.data?.image_models ?? []) {
      map.set(model.model_name, model.total_requests)
    }
    for (const model of rankingsQuery.data?.data?.decision_models ?? []) {
      if (model.total_requests !== undefined) {
        map.set(model.model_name, model.total_requests)
      }
    }
    return map
  }, [rankingsQuery.data])

  return useMemo(
    () => ({ perf, weeklyTokens, weeklyCalls }),
    [perf, weeklyTokens, weeklyCalls]
  )
}

export type ModelStats = ReturnType<typeof useModelStats>

/**
 * Table rows are memoized and do not re-render when the figures arrive, so
 * cells read them from this context instead of from their column.
 */
export const ModelStatsContext = createContext<ModelStats>({
  perf: new Map(),
  weeklyTokens: new Map(),
  weeklyCalls: new Map(),
})

export function useModelStatsContext(): ModelStats {
  return useContext(ModelStatsContext)
}
