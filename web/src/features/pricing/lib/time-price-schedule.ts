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
import { readTimeTokenPricing } from './billing-expression/display'
import { compileBillingExpression } from './billing-expression/parser'
import { evaluateBillingCondition } from './billing-expression/runtime'
import { visitExpression } from './billing-expression/types'

export type TimePriceSchedule = {
  timezone: string
  days: {
    date: Date
    segments: { start: number; end: number; tier: number }[]
  }[]
  ids: string[]
  labels: string[]
}

/** A calendar projection, never a second billing engine. Unknown or sub-hour rules keep the rule table. */
export function getTimePriceSchedule(
  source: string,
  now: Date,
  weekOffset = 0
): TimePriceSchedule | null {
  const compiled = compileBillingExpression(source)
  const pricing = readTimeTokenPricing(source)
  if (
    compiled.status !== 'ready' ||
    !pricing ||
    pricing.tiers.some((tier) => tier.conditions.length > 0)
  ) {
    return null
  }
  // Request multipliers may depend on unknown parameters; don't present them as scheduled final prices.
  if (compiled.requestRules.length > 0) return null
  const zones = new Set<string>()
  let supported = true
  for (const tier of pricing.tiers) {
    for (const { condition } of tier.timeConditions) {
      visitExpression(condition, (node) => {
        if (node.kind === 'call') {
          if (
            !['hour', 'weekday', 'day', 'month'].includes(node.name) ||
            node.args[0]?.kind !== 'literal' ||
            typeof node.args[0].value !== 'string'
          ) {
            supported = false
          } else zones.add(node.args[0].value.trim() || 'UTC')
        }
        if (
          node.kind === 'binary' &&
          !['&&', '||', '==', '!=', '<', '<=', '>', '>='].includes(
            node.operator
          )
        ) {
          supported = false
        }
        if (
          node.kind === 'literal' &&
          typeof node.value === 'number' &&
          !Number.isInteger(node.value)
        ) {
          supported = false
        }
      })
    }
  }
  const timezone = [...zones][0]
  if (!supported || zones.size !== 1 || timezone === 'Local') return null
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
    const parts = Object.fromEntries(
      formatter.formatToParts(now).map((part) => [part.type, part.value])
    )
    const today = new Date(
      Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
    )
    today.setUTCDate(
      today.getUTCDate() - ((today.getUTCDay() + 6) % 7) + weekOffset * 7
    )
    const days: TimePriceSchedule['days'] = []
    for (let day = 0; day < 7; day++) {
      const date = new Date(today)
      date.setUTCDate(date.getUTCDate() + day)
      const segments: TimePriceSchedule['days'][number]['segments'] = []
      for (let hour = 0; hour < 24; hour++) {
        const wallClock = date.getTime() + hour * 3_600_000
        let instant = wallClock
        // Convert wall time in the billing timezone to an absolute instant, including date rollover.
        for (let attempt = 0; attempt < 3; attempt++) {
          const values = Object.fromEntries(
            formatter
              .formatToParts(new Date(instant))
              .map((part) => [part.type, part.value])
          )
          const represented = Date.UTC(
            Number(values.year),
            Number(values.month) - 1,
            Number(values.day),
            Number(values.hour),
            Number(values.minute)
          )
          const correction = wallClock - represented
          if (correction === 0) break
          instant += correction
          if (attempt === 2) return null // A skipped DST hour can't be shown faithfully in this simplified grid.
        }
        let index = -1
        for (let tier = 0; tier < pricing.tiers.length; tier++) {
          let matches = true
          for (const rule of pricing.tiers[tier].timeConditions) {
            const result = evaluateBillingCondition(
              compiled,
              rule.condition,
              new Date(instant)
            )
            if (result === null) return null
            if (result !== rule.matches) {
              matches = false
              break
            }
          }
          if (matches) {
            index = tier
            break
          }
        }
        if (index < 0) return null
        const previous = segments.at(-1)
        if (previous?.tier === index) previous.end = hour + 1
        else segments.push({ start: hour, end: hour + 1, tier: index })
      }
      days.push({ date, segments })
    }
    return {
      timezone,
      days,
      ids: pricing.tiers.map((tier) => JSON.stringify(tier.timeConditions)),
      labels: pricing.tiers.map((tier) => tier.label),
    }
  } catch {
    return null
  }
}

export function timePriceTierLabel(
  label: string,
  t: (key: string) => string
): string {
  if (label === 'peak') return t('Peak pricing')
  if (label === 'off_peak') return t('Off-peak pricing')
  return label
}
