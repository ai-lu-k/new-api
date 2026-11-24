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
export type ExpenseColumn = {
  label: string
  segments: Array<{ name: string; amount: number }>
}

const WIDTH = 1000
const HEIGHT = 220
const GRID_LINES = 3

/** Three marks, ranked by what the line costs: solid ink, hatched ink, and a
 * bordered outline. No hue is used, so the block still reads in one ink. */
type Mark = 'solid' | 'hatch' | 'outline'

function markFor(rank: number): Mark {
  if (rank === 0) return 'solid'
  if (rank === 1) return 'hatch'
  return 'outline'
}

const MARK_FILL: Record<Mark, string> = {
  solid: 'currentColor',
  hatch: 'url(#expense-hatch)',
  outline: 'none',
}

const MARK_SWATCH: Record<Mark, string> = {
  solid: 'bg-foreground size-3',
  hatch:
    'text-foreground size-3 bg-[repeating-linear-gradient(135deg,currentColor_0_1.5px,transparent_1.5px_4px)]',
  outline: 'border-foreground size-3 border',
}

/** Round the axis to a readable step so the labels are money, not fractions
 * of the tallest month. */
function niceAxis(value: number, divisions: number): number {
  if (value <= 0) return divisions * 10
  const raw = value / divisions
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / magnitude
  let step = 10
  if (norm <= 1) step = 1
  else if (norm <= 2) step = 2
  else if (norm <= 2.5) step = 2.5
  else if (norm <= 5) step = 5
  return step * magnitude * divisions
}

/**
 * Monthly expenses as stacked columns. Items are ranked once across the whole
 * range, so the same expense keeps the same mark in every month instead of
 * swapping style from column to column.
 */
export function ExpensePlot(props: {
  columns: ExpenseColumn[]
  order: string[]
  label: string
  formatValue: (value: number) => string
}) {
  const totals = props.columns.map((column) =>
    column.segments.reduce((sum, segment) => sum + segment.amount, 0)
  )
  const top = niceAxis(Math.max(...totals, 0), GRID_LINES)
  const slot = props.columns.length > 0 ? WIDTH / props.columns.length : WIDTH
  const barWidth = Math.min(slot * 0.42, 64)
  const y = (value: number) => HEIGHT - (value / top) * HEIGHT

  const rankOf = new Map(props.order.map((name, index) => [name, index]))

  return (
    <div data-slot='expense-plot'>
      <div className='flex gap-3'>
        <div
          className='text-muted-foreground flex w-14 shrink-0 flex-col justify-between text-right text-[10px] tabular-nums'
          style={{ height: '14rem' }}
          aria-hidden='true'
        >
          {Array.from({ length: GRID_LINES + 1 }, (_, index) => (
            <span key={index}>
              {props.formatValue((top / GRID_LINES) * (GRID_LINES - index))}
            </span>
          ))}
        </div>

        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio='none'
          className='h-56 flex-1'
          role='img'
          aria-label={props.label}
        >
          <defs>
            <pattern
              id='expense-hatch'
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
                strokeWidth='2'
              />
            </pattern>
          </defs>

          {Array.from({ length: GRID_LINES + 1 }, (_, index) => {
            const value = (top / GRID_LINES) * (GRID_LINES - index)
            return (
              <line
                key={index}
                x1='0'
                y1={y(value)}
                x2={WIDTH}
                y2={y(value)}
                stroke='currentColor'
                strokeWidth='1'
                vectorEffect='non-scaling-stroke'
                className={
                  index === GRID_LINES
                    ? 'text-foreground'
                    : 'text-foreground/15'
                }
              />
            )
          })}

          {props.columns.map((column, columnIndex) => {
            const centre = slot * (columnIndex + 0.5)
            let cursor = 0
            const stack = [...column.segments].sort(
              (a, b) => (rankOf.get(a.name) ?? 99) - (rankOf.get(b.name) ?? 99)
            )
            return (
              <g key={column.label}>
                {stack.map((segment) => {
                  const mark = markFor(rankOf.get(segment.name) ?? 99)
                  const bottom = y(cursor)
                  cursor += segment.amount
                  const upper = y(cursor)
                  const height = Math.max(bottom - upper, 0.5)
                  return (
                    <rect
                      key={segment.name}
                      x={centre - barWidth / 2}
                      y={upper}
                      width={barWidth}
                      height={height}
                      fill={MARK_FILL[mark]}
                      stroke='currentColor'
                      strokeWidth={mark === 'outline' ? 1 : 0}
                      vectorEffect='non-scaling-stroke'
                      className='text-foreground'
                    >
                      <title>{`${segment.name} · ${props.formatValue(segment.amount)}`}</title>
                    </rect>
                  )
                })}
              </g>
            )
          })}
        </svg>
      </div>

      <div
        aria-hidden='true'
        className='text-muted-foreground mt-2 flex pl-[68px] text-[11px] tabular-nums'
      >
        {props.columns.map((column) => (
          <span key={column.label} className='flex-1 text-center'>
            {column.label}
          </span>
        ))}
      </div>

      <div className='text-muted-foreground mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] leading-[1.4]'>
        {props.order.map((name, index) => {
          const mark = markFor(index)
          return (
            <span key={name} className='flex items-center gap-1.5'>
              <span aria-hidden='true' className={MARK_SWATCH[mark]} />
              {name}
            </span>
          )
        })}
      </div>
    </div>
  )
}
