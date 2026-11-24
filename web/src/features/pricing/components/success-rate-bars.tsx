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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { getSuccessRateDotClass } from '@/features/performance-metrics/lib/format'
import type { SuccessRatePoint } from '@/features/performance-metrics/types'
import { cn } from '@/lib/utils'

/** One bar per hour of the reported window, oldest first. */
const STATUS_SLOTS = Array.from({ length: 24 }, (_, slot) => slot)

export type SuccessRateSamples = {
  /** Start of the window, so each hourly point lands in its own slot. */
  window_start?: number
  recent_success_series?: SuccessRatePoint[]
}

/**
 * The last day's success rate as one bar per hour: green where requests went
 * through, gray where there was no traffic to judge. Hours are placed from the
 * window start, including the current partial hour.
 */
export function SuccessRateBars(props: {
  samples: SuccessRateSamples | undefined
  className?: string
  /** Width of one bar; the card and the table row need different sizes. */
  barClassName?: string
}) {
  const { t } = useTranslation()
  const windowStart = props.samples?.window_start
  const series = props.samples?.recent_success_series
  const hours = useMemo(() => {
    const ratesByHour = new Map<number, number>()
    for (const point of series ?? []) {
      ratesByHour.set(point.ts, point.success_rate)
    }
    return STATUS_SLOTS.map((slot) => {
      const hourStart =
        windowStart == null ? undefined : windowStart + slot * 3600
      return {
        key: hourStart ?? `slot-${slot}`,
        rate: hourStart == null ? undefined : ratesByHour.get(hourStart),
      }
    })
  }, [series, windowStart])
  const label = t(
    'Recent success-rate samples; gray bars indicate missing data.'
  )

  return (
    <span
      role='img'
      aria-label={label}
      title={label}
      className={cn('flex items-center gap-px', props.className)}
    >
      {hours.map((hour) => {
        const rate = hour.rate
        const known =
          rate != null && Number.isFinite(rate) && rate >= 0 && rate <= 100
        return (
          <span
            key={hour.key}
            aria-hidden
            className={cn(
              'h-full shrink-0 rounded-xs',
              props.barClassName ?? 'w-[3px]',
              known && rate != null
                ? getSuccessRateDotClass(rate)
                : 'bg-muted-foreground/15'
            )}
          />
        )
      })}
    </span>
  )
}
