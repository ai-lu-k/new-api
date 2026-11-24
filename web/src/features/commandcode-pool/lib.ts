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
import type {
  CommandCodeCredits,
  CommandCodeCreditsWindow,
  CommandCodePoolKey,
  CommandCodePoolOrderEntry,
} from './types'

export function findWindow(
  credits: CommandCodeCredits | null | undefined,
  name: string
): CommandCodeCreditsWindow | undefined {
  const windows = credits?.windows ?? []
  return windows.find((window) => window.name === name)
}

/** The plan the proxy reported, or the subscription's plan as a fallback. */
export function planOf(key: CommandCodePoolKey): string {
  return key.credits?.plan || key.credits?.subscription?.plan || ''
}

export type CommandCodePoolSummary = {
  total: number
  enabled: number
  cooling: number
  autoDisabled: number
  plans: { plan: string; count: number }[]
  creditsRemaining: number | null
  weeklyUsed: number | null
  weeklyCap: number | null
}

/**
 * Rolls the pool up for the overview card. Credit totals are skipped rather
 * than counted as zero when no key has a reading, so an unread pool is not
 * presented as an empty one.
 */
export function summarizePool(
  keys: CommandCodePoolKey[]
): CommandCodePoolSummary {
  let enabled = 0
  let cooling = 0
  let autoDisabled = 0
  const plans = new Map<string, number>()
  let creditsRemaining: number | null = null
  let weeklyUsed: number | null = null
  let weeklyCap: number | null = null

  for (const key of keys) {
    if (key.enabled) enabled++
    if (key.cooling) cooling++
    if (key.autoDisabled) autoDisabled++

    const plan = planOf(key)
    if (plan) plans.set(plan, (plans.get(plan) ?? 0) + 1)

    if (typeof key.credits?.creditsRemaining === 'number') {
      creditsRemaining = (creditsRemaining ?? 0) + key.credits.creditsRemaining
    }

    const weekly = findWindow(key.credits, 'weekly')
    if (weekly) {
      weeklyUsed = (weeklyUsed ?? 0) + weekly.used
      weeklyCap = (weeklyCap ?? 0) + weekly.cap
    }
  }

  return {
    total: keys.length,
    enabled,
    cooling,
    autoDisabled,
    plans: [...plans.entries()]
      .map(([plan, count]) => ({ plan, count }))
      .sort((a, b) => b.count - a.count || a.plan.localeCompare(b.plan)),
    creditsRemaining,
    weeklyUsed,
    weeklyCap,
  }
}

/**
 * Milliseconds are stored as they are but edited in a friendlier unit, because
 * an operator reads "6 hours" faster than 21600000.
 */
export function millisecondsToUnit(ms: number, unitMs: number): number {
  if (!Number.isFinite(ms)) return 0
  return Math.round((ms / unitMs) * 100) / 100
}

export function unitToMilliseconds(value: number, unitMs: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.round(value * unitMs)
}

export const MILLISECONDS_PER_SECOND = 1000
export const MILLISECONDS_PER_MINUTE = 60 * MILLISECONDS_PER_SECOND

/** The dispatch strategies the proxy accepts, as label keys for the UI. */
export const COMMAND_CODE_STRATEGIES: { value: string; label: string }[] = [
  { value: 'weighted', label: 'Weighted' },
  { value: 'round-robin', label: 'Round robin' },
  { value: 'random', label: 'Random' },
  { value: 'weighted-random', label: 'Weighted random' },
  { value: 'sticky', label: 'Sticky' },
  { value: 'least-recent', label: 'Least recently used' },
  { value: 'failover', label: 'Failover' },
]

/** What the proxy keeps sessions pinned to. */
export const COMMAND_CODE_STICKY_BY: { value: string; label: string }[] = [
  { value: 'client-key', label: 'By API key' },
  { value: 'ip', label: 'By client IP' },
  { value: 'none', label: 'No affinity' },
]

/** The scheduling modes: per-session affinity or per-request dispatch. */
export const COMMAND_CODE_MODES: { value: string; label: string }[] = [
  { value: 'session', label: 'Session affinity' },
  { value: 'request', label: 'Per request' },
]

/** What happens when no key in the pool can serve. */
export const COMMAND_CODE_ALL_EXHAUSTED: { value: string; label: string }[] = [
  { value: 'error', label: 'Return an error' },
  { value: 'best-effort', label: 'Keep trying the best key' },
]

/** A label key for an enum value, falling back to the raw value. */
export function labelFor(
  options: { value: string; label: string }[],
  value: string
): string {
  return options.find((option) => option.value === value)?.label ?? value
}

/**
 * Why the proxy took a key out of rotation on its own. The proxy reports the
 * reason as a code, so unknown codes are shown verbatim rather than guessed.
 */
const AUTO_DISABLED_REASONS: Record<string, string> = {
  'quota-exhausted': 'Credits exhausted',
  disabled: 'Credential rejected',
  forbidden: 'Access forbidden',
}

export function autoDisabledReasonLabel(reason: string): string {
  return AUTO_DISABLED_REASONS[reason] ?? reason
}

/**
 * Lists keys in the order the proxy would dispatch in. `poolOrder` only holds
 * keys that can serve right now, so anything missing from it sorts after them
 * and keeps the order the proxy listed it in.
 */
export function orderPoolKeys(
  keys: CommandCodePoolKey[],
  poolOrder: CommandCodePoolOrderEntry[] | undefined
): CommandCodePoolKey[] {
  const rank = new Map(
    (poolOrder ?? []).map((entry, index) => [entry.id, index])
  )
  return [...keys].sort((a, b) => {
    const left = rank.get(a.id)
    const right = rank.get(b.id)
    if (left === undefined && right === undefined) return 0
    if (left === undefined) return 1
    if (right === undefined) return -1
    return left - right
  })
}
