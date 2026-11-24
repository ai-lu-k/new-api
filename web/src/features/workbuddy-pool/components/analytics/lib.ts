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
import { formatCompactNumber, formatNumber } from '@/lib/format'

import type { WorkBuddyPercentiles } from '../../types'

/** A count as the reader's locale writes it, with the site's usual precision. */
export function formatCount(
  value: number | null | undefined,
  locale: Intl.LocalesArgument
): string {
  return formatNumber(value, locale)
}

/** A token figure that would otherwise be unreadable at a glance. */
export function formatTokens(
  value: number | null | undefined,
  locale: Intl.LocalesArgument
): string {
  return formatCompactNumber(value, locale)
}

/**
 * The hub reports its cost estimate in CNY already, so it is formatted as CNY
 * rather than run through this site's USD-to-display-currency helpers. Small
 * per-request figures keep four decimals so they do not collapse to zero.
 */
export function formatCny(
  value: number | null | undefined,
  locale: Intl.LocalesArgument
): string {
  if (value == null || Number.isNaN(value)) return '-'
  const digits = Math.abs(value) < 1 ? 4 : 2
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value)
  return `¥${formatted}`
}

/** A 0-100 percentage as the hub reports it, never rescaled. */
export function formatRate(
  value: number | null | undefined,
  locale: Intl.LocalesArgument
): string {
  if (value == null || Number.isNaN(value)) return '-'
  return `${formatNumber(value, locale)}%`
}

/**
 * Share of the prompt tokens that the upstream cache served. The hub's own
 * analytics summary computes the same ratio, so the headline and the
 * performance block agree.
 */
export function cacheHitShare(
  cachedTokens: number | null | undefined,
  promptTokens: number | null | undefined
): number | null {
  if (!cachedTokens || !promptTokens) return null
  return (cachedTokens / promptTokens) * 100
}

/** One percentile of a latency or speed block, which may be missing. */
export function percentile(
  block: WorkBuddyPercentiles | null | undefined,
  key: 'avg' | 'p50' | 'p90' | 'p99' | 'max'
): number | null {
  if (!block) return null
  const value = block[key]
  return Number.isFinite(value) ? value : null
}

/** Sample count behind one block, so a percentile is never read bare. */
export function sampleCount(
  block: WorkBuddyPercentiles | null | undefined
): number {
  return block?.samples ?? 0
}

/**
 * A uid's readable name. An account that has been deleted from the pool keeps
 * its usage history, so the uid is shown instead of an empty cell.
 */
export function accountName(
  uid: string | undefined,
  names: Record<string, string>
): string {
  if (!uid) return '-'
  return names[uid] ?? uid.slice(0, 8)
}

/** The busiest models of one account, biggest first. */
export function topModels(
  models: [string, number][],
  limit: number
): [string, number][] {
  return [...models].sort((left, right) => right[1] - left[1]).slice(0, limit)
}

/**
 * Models the hub could not price in this window. Their requests are counted
 * but contribute nothing to the cost estimate, so the headline says so.
 */
export function unpricedRequests(
  costMissing: Record<string, number> | undefined
): number {
  if (!costMissing) return 0
  let total = 0
  for (const count of Object.values(costMissing)) total += count
  return total
}
