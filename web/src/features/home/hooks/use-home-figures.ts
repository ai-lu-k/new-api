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
import { useMemo } from 'react'

import { getPerfMetricsSummary } from '@/features/performance-metrics/api'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { useRankings } from '@/features/rankings/hooks/use-rankings'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  THROUGHPUT_WINDOW_HOURS,
  dailyTokens,
  figureOrNull,
  summarizeDays,
  totalRequests,
} from '../lib/figures'
import type { HomeRankingsSnapshot } from '../types'

export type HomeFigures = ReturnType<typeof useHomeFigures>

/**
 * Every public figure the home page prints.
 *
 * Each source is the endpoint the number actually comes from, read through the
 * query key the rest of the site already uses, so opening the home page and
 * then the pricing or rankings page costs one request per source, not two.
 * A figure that is absent, failed or zero-because-there-is-no-data stays null
 * and is rendered as a dash.
 */
export function useHomeFigures() {
  const pricing = usePricingData()

  // Same key as the pricing cards and the dashboard's traffic panels.
  const performance = useQuery({
    queryKey: ['perf-metrics-summary', 24],
    queryFn: async () => requireServerSuccess(await getPerfMetricsSummary(24)),
    staleTime: 60 * 1000,
    retry: false,
    meta: { errorToast: false },
  })

  // The throughput block reports a day of the last 30 days, so its speed is
  // read over that same window instead of the 24 hours above.
  const monthPerformance = useQuery({
    queryKey: ['perf-metrics-summary', THROUGHPUT_WINDOW_HOURS],
    queryFn: async () =>
      requireServerSuccess(
        await getPerfMetricsSummary(THROUGHPUT_WINDOW_HOURS)
      ),
    staleTime: 60 * 1000,
    retry: false,
    meta: { errorToast: false },
  })

  const week = useRankings('week')
  const month = useRankings('month')

  const weekSnapshot = week.data?.data as HomeRankingsSnapshot | undefined
  const monthSnapshot = month.data?.data as HomeRankingsSnapshot | undefined

  const days = useMemo(
    () => dailyTokens(monthSnapshot?.models_history?.points),
    [monthSnapshot]
  )
  const { peak, total: totalTokens } = useMemo(
    () => summarizeDays(days),
    [days]
  )

  const summary = performance.data?.data.summary
  const monthSummary = monthPerformance.data?.data.summary

  return {
    modelCount: pricing.models.length > 0 ? pricing.models.length : null,
    modelLoading: pricing.isLoading,
    successRate: figureOrNull(summary?.success_rate),
    avgLatencyMs: figureOrNull(monthSummary?.avg_latency_ms),
    windowStart: performance.data?.data.window_start,
    windowEnd: performance.data?.data.window_end,
    weekRequests: totalRequests(weekSnapshot),
    monthRequests: totalRequests(monthSnapshot),
    days,
    totalTokens: totalTokens > 0 ? totalTokens : null,
    peakTokens: peak?.tokens ?? null,
    peakDate: peak?.date ?? null,
  }
}
