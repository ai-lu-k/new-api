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
import { motion, useAnimationControls, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber } from '@/lib/format'
import { MOTION_DURATION, MOTION_EASE, MOTION_TRANSITION } from '@/lib/motion'
import { cn } from '@/lib/utils'

import { useInViewOnce } from '../hooks/use-in-view-once'
import {
  CHART_LABEL_EVERY,
  formatDayLabel,
  type DailyTokens,
} from '../lib/figures'

export type GrowthChartProps = {
  days: DailyTokens[]
  /** What the picture says, for assistive tech: the range, the peak, the day. */
  label: string
}

/**
 * The day's bucket that is still counting up. A hatch rather than a paler fill,
 * so it reads as "not complete" without relying on colour alone.
 */
const PARTIAL_FILL =
  'bg-[repeating-linear-gradient(135deg,var(--foreground)_0_2px,transparent_2px_5px)]'

/**
 * The bars grow from the baseline the first time the plot is read: one
 * `--motion-base` step per bar, 8ms apart. With 31 days that would run past
 * the 400ms the contract allows, so the step is compressed to whatever fits and
 * a full month still lands inside the budget. A refresh of the same plot only
 * fades (140ms); it never replays the growth.
 */
const BAR_STAGGER_S = 0.008
const GROWTH_BUDGET_S = 0.4

function barStagger(count: number): number {
  if (count < 2) return 0
  const budget = (GROWTH_BUDGET_S - MOTION_DURATION.base) / (count - 1)
  return Math.min(BAR_STAGGER_S, Math.max(0, budget))
}

export function GrowthChart(props: GrowthChartProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const shouldReduce = useReducedMotion()
  const controls = useAnimationControls()
  const [grown, setGrown] = useState(false)
  // The bars grow when the plot is actually on screen, not when it mounts: the
  // home page fills in its figures after mount, and a mount-time trigger played
  // the whole month while the plot was still above the fold (t≈206–490ms), so a
  // reader scrolling down met 31 finished bars. `useInViewOnce` also waits for
  // the layout to stop moving, which is what made that early match possible.
  const { ref: plotRef, inView } = useInViewOnce(0.25)
  const signature = props.days
    .map((day) => `${day.date}:${day.tokens}`)
    .join('|')
  const seen = useRef(signature)
  const stagger = barStagger(props.days.length)

  useEffect(() => {
    if (!inView) return
    setGrown(true)
  }, [inView])

  // New numbers in the same plot: fade them in instead of growing them again.
  useEffect(() => {
    if (seen.current === signature) return
    seen.current = signature
    if (shouldReduce) return
    void controls.start({
      opacity: [0.65, 1],
      transition: MOTION_TRANSITION.fast,
    })
  }, [signature, shouldReduce, controls])

  let max = 0
  let peakIndex = -1
  for (const [index, day] of props.days.entries()) {
    max = Math.max(max, day.tokens)
    if (
      day.tokens > 0 &&
      (peakIndex < 0 || day.tokens > props.days[peakIndex].tokens)
    ) {
      peakIndex = index
    }
  }

  /** What the tones are allowed to say: the busiest day, and the day still
   * counting. Nothing repaints a value the height already tells. */
  function barTone(day: DailyTokens): string {
    if (day.partial) return PARTIAL_FILL
    if (day === props.days[peakIndex]) return 'bg-destructive'
    return 'bg-foreground'
  }

  const bars = props.days.map((day, index) => {
    const share = max > 0 ? day.tokens / max : 0
    const height = day.tokens > 0 ? Math.max(2, Math.round(share * 100)) : 0
    const className = cn('block w-full max-w-[8px] sm:max-w-4', barTone(day))
    const style = { height: `${height}%`, transformOrigin: 'bottom' }

    return (
      <div
        key={day.date}
        className='relative flex h-full min-w-0 flex-1 items-end justify-center'
      >
        {shouldReduce ? (
          <span
            data-slot='home-chart-bar'
            data-partial={day.partial ? '' : undefined}
            className={className}
            style={style}
          />
        ) : (
          <motion.span
            data-slot='home-chart-bar'
            data-partial={day.partial ? '' : undefined}
            className={className}
            style={style}
            initial={false}
            animate={{ scaleY: grown ? 1 : 0 }}
            transition={{
              duration: MOTION_DURATION.base,
              ease: MOTION_EASE.out,
              delay: index * stagger,
            }}
          />
        )}
        {index === peakIndex && (
          <div
            aria-hidden='true'
            data-slot='home-chart-peak'
            className='pointer-events-none absolute bottom-full left-1/2 z-10 -translate-x-1/2'
          >
            <div className='border-foreground bg-background flex items-center gap-1 border px-1.5 py-0.5 text-[10px] leading-[1.3] font-medium whitespace-nowrap tabular-nums'>
              <span className='bg-destructive size-1.5' aria-hidden='true' />
              {formatCompactNumber(day.tokens, locale)}
              <span className='text-muted-foreground'>
                {formatDayLabel(day.date)}
              </span>
            </div>
          </div>
        )}
      </div>
    )
  })

  const plotClassName =
    'border-foreground relative mt-8 flex h-[120px] items-end gap-[3px] border-b sm:h-[170px] sm:gap-1.5'

  return (
    <div data-slot='home-chart'>
      {shouldReduce ? (
        <div role='img' aria-label={props.label} className={plotClassName}>
          {bars}
        </div>
      ) : (
        <motion.div
          ref={plotRef}
          role='img'
          aria-label={props.label}
          className={plotClassName}
          initial={false}
          animate={controls}
        >
          {bars}
        </motion.div>
      )}

      {/* Labels sit on their own row under the plot. The row repeats the
          plot's flex grid, so a label is centred on its own column by
          construction instead of by a percentage the gaps would bend. */}
      <div aria-hidden='true' className='mt-2 flex gap-[3px] sm:gap-1.5'>
        {props.days.map((day, index) => (
          <div key={day.date} className='flex min-w-0 flex-1 justify-center'>
            {index % CHART_LABEL_EVERY === 0 ? (
              <span className='text-muted-foreground text-[9px] leading-[1.4] whitespace-nowrap tabular-nums sm:text-[10px]'>
                {formatDayLabel(day.date)}
              </span>
            ) : null}
          </div>
        ))}
      </div>

      {/* The plot cannot rely on colour alone, so the key names every tone the
          picture uses and nothing else. */}
      <div
        data-slot='home-chart-key'
        className='text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] leading-[1.4]'
      >
        <span className='flex items-center gap-1.5'>
          <span className='bg-destructive size-2' aria-hidden='true' />
          {t('Busiest day')}
        </span>
        <span className='flex items-center gap-1.5'>
          <span className={cn('size-2', PARTIAL_FILL)} aria-hidden='true' />
          {t('Today, still counting')}
        </span>
      </div>
    </div>
  )
}
