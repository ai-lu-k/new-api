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
import dayjs from '@/lib/dayjs'

import type { HomeRankingsSnapshot } from '../types'

/**
 * What a figure that could not be read renders as. A zero would read as a
 * measured zero, which is a different statement.
 */
export const MISSING_FIGURE = '—'

/** Bars the 30-day chart draws: the last 31 calendar days, today included. */
export const CHART_DAY_COUNT = 31

/**
 * Window the throughput block's speed figure covers: the same 30 days as the
 * growth chart, so all three figures in that block describe one period.
 */
export const THROUGHPUT_WINDOW_HOURS = 24 * 30

/** Requests in flight, on average: Little's law over the window. */
export function estimatedConcurrency(
  requests: number | null,
  days: number,
  latencyMs: number | null
): number | null {
  if (requests == null || latencyMs == null) return null
  if (requests <= 0 || latencyMs <= 0 || days <= 0) return null
  const perSecond = requests / (days * 24 * 60 * 60)
  return perSecond * (latencyMs / 1000)
}

/** Days between two axis labels under the chart. */
export const CHART_LABEL_EVERY = 3

export type DailyTokens = {
  /** Calendar day, `2026-11-06`. */
  date: string
  tokens: number
  /** The day being read right now: its bucket only counts up to this moment. */
  partial: boolean
}

/** A figure, or null when it is absent or not a number. */
export function figureOrNull(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return value
}

/** The day an edge of a `perf-metrics` window falls on, given in epoch seconds. */
export function formatWindowDay(seconds: number): string {
  if (!seconds) return MISSING_FIGURE
  return dayjs(seconds * 1000).format('YYYY-MM-DD')
}

/** `2026-11-06` as the axis writes it: `11-06`. */
export function formatDayLabel(date: string): string {
  return date.slice(5)
}

/**
 * Requests over the period across every board the rankings API returns (text
 * models, images, decisions). Null when no board has any request: the caller
 * then shows a dash instead of a measured zero.
 */
export function totalRequests(snapshot?: HomeRankingsSnapshot): number | null {
  if (!snapshot) return null
  const rows = [
    ...(snapshot.models ?? []),
    ...(snapshot.image_models ?? []),
    ...(snapshot.decision_models ?? []),
  ]
  let total = 0
  for (const row of rows) total += row.total_requests ?? 0
  return total > 0 ? total : null
}

/**
 * Token volume per calendar day, oldest first.
 *
 * The series is summed per day and then laid out over the last `count` days
 * ending on the newest day the API reported, so the chart always has the same
 * number of bars. Days the series does not cover stay at zero — an empty bar,
 * not an estimate. The newest bucket is marked partial when it is today.
 */
export function dailyTokens(
  points: { ts: string; tokens: number }[] = [],
  count = CHART_DAY_COUNT,
  now: Date = new Date()
): DailyTokens[] {
  const tokensByDate = new Map<string, number>()
  for (const point of points) {
    const date = point.ts.slice(0, 10)
    tokensByDate.set(date, (tokensByDate.get(date) ?? 0) + point.tokens)
  }

  const reported = [...tokensByDate.keys()].sort()
  const today = dayjs(now).format('YYYY-MM-DD')
  const lastDay = reported.at(-1) ?? today

  const days: DailyTokens[] = []
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = dayjs(lastDay).subtract(offset, 'day').format('YYYY-MM-DD')
    days.push({
      date,
      tokens: tokensByDate.get(date) ?? 0,
      partial: date === today,
    })
  }
  return days
}

/** The busiest bucket and the total, for the figures printed beside the chart. */
export function summarizeDays(days: DailyTokens[]): {
  peak: DailyTokens | null
  total: number
} {
  let peak: DailyTokens | null = null
  let total = 0
  for (const day of days) {
    total += day.tokens
    if (day.tokens > 0 && (peak === null || day.tokens > peak.tokens)) {
      peak = day
    }
  }
  return { peak, total }
}
