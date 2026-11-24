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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { TrafficBucket } from '../lib/traffic'

export type TrafficPoint = TrafficBucket

const WIDTH = 1000
const HEIGHT = 200
const LABEL_COUNT = 7
/** Intervals on the value axis; the labels sit where the gridlines are. */
const GRID_LINES = 3

/** A step a reader can divide by eye: 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(value: number): number {
  if (!(value > 0)) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const norm = value / magnitude
  let step = 10
  if (norm <= 1) step = 1
  else if (norm <= 2) step = 2
  else if (norm <= 2.5) step = 2.5
  else if (norm <= 5) step = 5
  return step * magnitude
}

function compact(value: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact' }).format(value)
}

/** The UTC day a bucket starts on: the same framing the API buckets by. */
function bucketDay(ts: string): string {
  const date = new Date(ts)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

/**
 * The bucket still counting is the one dated today. The line runs through it
 * like any other point, and the column over it is hatched, so a day that is
 * only half over is read as such instead of as a finished day at its full
 * height.
 */
function todayBucket(
  points: TrafficPoint[],
  showToday: boolean
): TrafficPoint | null {
  const last = points.at(-1)
  if (!showToday || !last || last.value <= 0) return null
  return bucketDay(last.ts) === new Date().toISOString().slice(0, 10)
    ? last
    : null
}

/**
 * The public traffic plot: one line, one fill, the accent on the busiest
 * bucket. A month of traffic barely moves, so the vertical scale is anchored
 * under the quiet tenth of the buckets and the caption prints the range it
 * used — a zero base would flatten the whole shape into a straight line.
 */
export function TrafficPlot(props: {
  points: TrafficPoint[]
  peakLabel: string
  /** Set by boards bucketed by day, where the newest bucket can be today. */
  showToday?: boolean
}) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState<number | null>(null)

  const visible = props.points
  // The bucket still counting keeps its place on the line; it only gets a
  // hatched column as well.
  const partial = useMemo(
    () => todayBucket(props.points, props.showToday ?? false),
    [props.points, props.showToday]
  )

  const { x, y, ticks, stepX } = useMemo(() => {
    const values = visible.map((point) => point.value)
    const sorted = [...values].sort((a, b) => a - b)
    const top = sorted.at(-1) ?? 1
    const quiet = sorted[Math.floor(sorted.length * 0.1)] ?? 0
    // A month of traffic barely moves, so the base sits under the quiet tenth
    // of the buckets rather than at zero; both ends are then rounded to a step
    // that divides the axis into readable labels.
    const anchor = Math.max(0, quiet - (top - quiet) * 0.6)
    const step = niceStep((top - anchor) / GRID_LINES)
    const floor = Math.max(0, Math.floor(anchor / step) * step)
    const ceiling = Math.max(
      Math.ceil(top / step) * step,
      floor + step * GRID_LINES
    )
    const span = Math.max(ceiling - floor, 1)
    // Slots, not points: a column at the very edge would be clipped, so every
    // mark sits centred in its own slot.
    const columnCount = Math.max(1, visible.length)
    const stepX = WIDTH / columnCount
    const toY = (value: number) =>
      Math.min(
        HEIGHT,
        Math.max(0, HEIGHT - ((value - floor) / span) * (HEIGHT - 10))
      )
    const gridTicks = Array.from(
      { length: Math.round((ceiling - floor) / step) + 1 },
      (_, index) => {
        const value = floor + index * step
        return { value, y: toY(value) }
      }
    )
    return {
      x: (index: number) => (index + 0.5) * stepX,
      y: toY,
      ticks: gridTicks,
      stepX,
    }
  }, [visible])

  const peak = Math.max(
    0,
    visible.findIndex((point) => point.label === props.peakLabel)
  )

  // The drawing is memoised: moving the pointer must not rebuild the paths, the
  // gradient or the fill, which made the plot flicker while it was read.
  const body = useMemo(() => {
    const line = visible
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`
      )
      .join(' ')

    return (
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio='none'
        className='h-40 w-full sm:h-52'
        role='img'
        aria-label={t('Traffic over the selected period')}
      >
        <defs>
          <linearGradient id='traffic-fill' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0%' stopColor='currentColor' stopOpacity='0.16' />
            <stop offset='100%' stopColor='currentColor' stopOpacity='0' />
          </linearGradient>
          <pattern
            id='traffic-today-hatch'
            width='6'
            height='6'
            patternTransform='rotate(45)'
            patternUnits='userSpaceOnUse'
          >
            <line
              x1='0'
              y1='0'
              x2='0'
              y2='6'
              stroke='currentColor'
              strokeWidth='1.4'
            />
          </pattern>
        </defs>

        {ticks.map((tick) => (
          <line
            key={tick.value}
            x1='0'
            y1={tick.y}
            x2={WIDTH}
            y2={tick.y}
            stroke='currentColor'
            strokeWidth='1'
            vectorEffect='non-scaling-stroke'
            className={
              tick.value === ticks[0].value
                ? 'text-foreground'
                : 'text-foreground/15'
            }
          />
        ))}

        <path
          d={`${line} L${x(visible.length - 1).toFixed(1)},${HEIGHT} L${x(0).toFixed(1)},${HEIGHT} Z`}
          fill='url(#traffic-fill)'
          className='text-foreground'
        />
        <path
          d={line}
          fill='none'
          stroke='currentColor'
          strokeWidth='1.5'
          vectorEffect='non-scaling-stroke'
          className='text-foreground'
        />
        <line
          x1='0'
          y1={HEIGHT}
          x2={WIDTH}
          y2={HEIGHT}
          stroke='currentColor'
          strokeWidth='1'
          vectorEffect='non-scaling-stroke'
          className='text-foreground'
        />
        <circle
          cx={x(peak)}
          cy={y(visible[peak]?.value ?? 0)}
          r='3'
          fill='#e40018'
        />
        {partial && (
          <rect
            data-slot='traffic-today-bar'
            x={x(visible.length - 1) - stepX * 0.22}
            y={y(partial.value)}
            width={stepX * 0.44}
            height={HEIGHT - y(partial.value)}
            fill='url(#traffic-today-hatch)'
            className='text-foreground'
          />
        )}
      </svg>
    )
  }, [visible, partial, ticks, x, y, peak, stepX, t])

  const readout = hovered == null ? null : visible[hovered]

  return (
    <div data-slot='traffic-plot'>
      <div className='mb-2 flex items-baseline justify-end gap-4 text-[10px] tabular-nums'>
        {/* Fixed size so the pointer moving between buckets cannot reflow the
            row — the plot above must not shift while it is being read. */}
        <span className='text-foreground h-3.5 min-w-[9rem] text-right font-medium'>
          {readout ? `${readout.label} · ${compact(readout.value)}` : ''}
        </span>
      </div>

      <div className='flex gap-2'>
        <div
          aria-hidden='true'
          className='text-muted-foreground relative h-40 w-10 shrink-0 text-right text-[10px] tabular-nums sm:h-52'
        >
          {ticks.map((tick) => (
            <span
              key={tick.value}
              data-slot='traffic-axis-label'
              className='absolute right-0 -translate-y-1/2'
              style={{ top: `${(tick.y / HEIGHT) * 100}%` }}
            >
              {compact(tick.value)}
            </span>
          ))}
        </div>

        <div
          className='relative min-w-0 flex-1'
          onPointerLeave={() => setHovered(null)}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            const ratio = (event.clientX - box.left) / box.width
            const index = Math.round(ratio * (visible.length - 1))
            const next = Math.min(visible.length - 1, Math.max(0, index))
            setHovered((current) => (current === next ? current : next))
          }}
        >
          {body}
          {readout && (
            <svg
              aria-hidden='true'
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              preserveAspectRatio='none'
              className='pointer-events-none absolute inset-0 h-40 w-full sm:h-52'
            >
              <line
                x1={x(hovered ?? 0)}
                y1='0'
                x2={x(hovered ?? 0)}
                y2={HEIGHT}
                stroke='currentColor'
                strokeWidth='1'
                strokeDasharray='2 3'
                vectorEffect='non-scaling-stroke'
                className='text-foreground/40'
              />
              <circle
                cx={x(hovered ?? 0)}
                cy={y(readout.value)}
                r='3.5'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.5'
                vectorEffect='non-scaling-stroke'
                className='text-foreground'
              />
            </svg>
          )}
        </div>
      </div>

      <div className='text-muted-foreground mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 pl-12 text-[10px] leading-[1.4]'>
        <span className='flex items-center gap-1.5'>
          <span
            className='border-foreground w-3.5 border-t-[1.5px]'
            aria-hidden='true'
          />
          {t('Total per period')}
        </span>
        <span className='flex items-center gap-1.5'>
          <span
            className='bg-destructive size-[6px] rounded-full'
            aria-hidden='true'
          />
          {t('Busiest period')}
        </span>
        {partial && (
          <span className='flex items-center gap-1.5'>
            <span
              className='text-foreground size-3 bg-[repeating-linear-gradient(135deg,currentColor_0_1.5px,transparent_1.5px_4px)]'
              aria-hidden='true'
            />
            {t('Today, still counting')}
            <span className='tabular-nums'>· {compact(partial.value)}</span>
          </span>
        )}
      </div>

      <div
        aria-hidden='true'
        className='text-muted-foreground mt-3 flex pl-12 text-[10px] tabular-nums'
      >
        {visible.map((point, index) => {
          const stride = Math.max(1, Math.round(visible.length / LABEL_COUNT))
          const last = visible.length - 1
          const nearLast = last - index < stride * 0.6
          if (index !== last && (index % stride !== 0 || nearLast)) return null
          return (
            <span
              key={point.label}
              className='flex-1 whitespace-nowrap first:text-left last:text-right [&:not(:first-child):not(:last-child)]:text-center'
            >
              {point.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}
