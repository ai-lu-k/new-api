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
import {
  type CSSProperties,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { SECTION_FRAME_CLASSNAME } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { SectionHeading } from '@/components/section-heading'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { DailyQuotaItem } from '../../types'
import { OverviewCard } from './overview-card'

const DAY_SECONDS = 86_400
// Asia/Shanghai has no daylight saving time, so a fixed offset keeps the
// calendar identical for every viewer and matches the server's day boundary.
const SHANGHAI_OFFSET_SECONDS = 8 * 3_600
const CELL_SIZE = 8
const CELL_GAP = 3
const WEEK_ROWS = 7
// A day with no usage is a quiet fill, not an outlined box: the border would
// draw a grid of empty cells that reads as data. Dark mode needs stronger
// steps, since the muted zero cell is already dark there.
const LEVEL_CLASSES = [
  'bg-muted',
  'bg-foreground/25 dark:bg-foreground/40',
  'bg-foreground/45 dark:bg-foreground/55',
  'bg-foreground/70 dark:bg-foreground/75',
  'bg-foreground',
]

type Metric = 'tokens' | 'quota'

interface HeatmapColumn {
  start: number
  days: (number | null)[]
}

interface HeatmapMonth {
  key: string
  column: number
  span: number
  label: string
}

interface UsageHeatmapProps {
  data: DailyQuotaItem[]
  start: number
  end: number
  loading: boolean
  error: boolean
  onRetry: () => void
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Start of the Asia/Shanghai calendar day that contains the timestamp. */
function shanghaiDayStart(tsSec: number): number {
  const shifted = tsSec + SHANGHAI_OFFSET_SECONDS
  const dayStart =
    shifted - (((shifted % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS)
  return dayStart - SHANGHAI_OFFSET_SECONDS
}

/** ISO week order with Monday first. */
function shanghaiWeekday(tsSec: number): number {
  const date = new Date((tsSec + SHANGHAI_OFFSET_SECONDS) * 1000)
  return (date.getUTCDay() + 6) % 7
}

function shanghaiDateKey(tsSec: number): string {
  const date = new Date((tsSec + SHANGHAI_OFFSET_SECONDS) * 1000)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function shanghaiMonthKey(tsSec: number): string {
  const date = new Date((tsSec + SHANGHAI_OFFSET_SECONDS) * 1000)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`
}

function levelFor(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0
  const ratio = value / max
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

/** Build week columns (Monday first) and month labels for the range. */
function buildCalendar(startSec: number, endSec: number, locale?: string) {
  const startDay = shanghaiDayStart(startSec)
  const endDay = shanghaiDayStart(endSec)
  const gridStart = startDay - shanghaiWeekday(startDay) * DAY_SECONDS

  const columns: HeatmapColumn[] = []
  for (let day = gridStart; day <= endDay; day += DAY_SECONDS) {
    const offset = Math.round((day - gridStart) / DAY_SECONDS)
    const columnIndex = Math.floor(offset / WEEK_ROWS)
    const column = columns[columnIndex] ?? { start: day, days: [] }
    // Leading days only complete the first week; they are outside the range.
    column.days.push(day < startDay ? null : day)
    columns[columnIndex] = column
  }
  const lastColumn = columns.at(-1)
  if (lastColumn) {
    while (lastColumn.days.length < WEEK_ROWS) lastColumn.days.push(null)
  }

  const monthFormatter = new Intl.DateTimeFormat(locale, {
    month: 'short',
    timeZone: 'Asia/Shanghai',
  })
  const months: HeatmapMonth[] = []
  for (const [index, column] of columns.entries()) {
    const firstDay = column.days.find((day) => day !== null)
    if (firstDay == null) continue
    const key = shanghaiMonthKey(firstDay)
    const previous = months.at(-1)
    if (previous && previous.key === key) {
      previous.span += 1
      continue
    }
    months.push({
      key,
      column: index,
      span: 1,
      label: monthFormatter.format(new Date(firstDay * 1000)),
    })
  }

  // A month that only shows a sliver of columns cannot fit its label.
  return { columns, months: months.filter((month) => month.span >= 3) }
}

/** Daily usage calendar with per-day tooltips and fixed period totals. */
export function UsageHeatmap(props: UsageHeatmapProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const heatmapId = useId()
  const [metric, setMetric] = useState<Metric>('tokens')
  const [hoveredDay, setHoveredDay] = useState<number | null>(null)
  const [focusedDay, setFocusedDay] = useState<number | null>(null)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const calendarRef = useRef<HTMLDivElement>(null)
  const metricRef = useRef<HTMLDivElement>(null)
  const today = shanghaiDayStart(Date.now() / 1000)
  // The window is the range that was asked for, not the days that happen to
  // have data: a quiet day keeps its own empty cell, so the calendar always
  // spans the same period and the caption above it stays true.
  const windowStart = useMemo(
    () => shanghaiDayStart(props.start),
    [props.start]
  )
  const defaultDay = Math.max(
    windowStart,
    Math.min(today, shanghaiDayStart(props.end))
  )
  const activeDay = hoveredDay ?? focusedDay ?? selectedDay
  const hasHistory = props.data.length > 0

  const { columns, months } = useMemo(
    () => buildCalendar(windowStart, props.end, locale),
    [windowStart, props.end, locale]
  )
  // The ribbon: one column per week, seven days tall, cell size taken from the
  // card width so a long history fills it instead of hugging one corner.
  const weekdayGutter = 32 + 8
  const calendarInset =
    weekdayGutter + 4 + Math.max(0, columns.length - 1) * CELL_GAP
  const cellSize = `clamp(${CELL_SIZE}px, calc((100cqw - ${calendarInset}px) / ${Math.max(1, columns.length)}), 18px)`
  const byDate = useMemo(() => {
    const map = new Map<string, DailyQuotaItem>()
    for (const item of props.data) map.set(item.date, item)
    return map
  }, [props.data])
  const maxValue = useMemo(() => {
    let max = 0
    for (const item of byDate.values()) {
      const value =
        metric === 'tokens' ? (item.token_used ?? 0) : (item.quota ?? 0)
      if (value > max) max = value
    }
    return max
  }, [byDate, metric])
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'Asia/Shanghai',
      }),
    [locale]
  )
  const weekdayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        timeZone: 'Asia/Shanghai',
      }),
    [locale]
  )

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    let width = element.clientWidth
    let followLatest = true
    const resize = () => {
      width = element.clientWidth
      if (followLatest) element.scrollLeft = element.scrollWidth
    }
    const trackScroll = () => {
      // A resize can emit scroll before ResizeObserver; retain the prior intent.
      if (element.clientWidth !== width) return
      followLatest =
        element.scrollWidth - element.clientWidth - element.scrollLeft <= 1
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    element.addEventListener('scroll', trackScroll, { passive: true })
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', trackScroll)
    }
  }, [hasHistory, windowStart, props.end])

  // Keep touch inspection until the next outside interaction. Metric changes
  // deliberately retain the inspected date so the two values can be compared.
  useEffect(() => {
    if (selectedDay === null) return
    const resetOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (
        calendarRef.current?.contains(event.target) ||
        metricRef.current?.contains(event.target)
      ) {
        return
      }
      setSelectedDay(null)
      setHoveredDay(null)
      setFocusedDay(null)
      if (
        document.activeElement instanceof HTMLElement &&
        calendarRef.current?.contains(document.activeElement)
      ) {
        document.activeElement.blur()
      }
    }
    document.addEventListener('pointerdown', resetOutside)
    return () => document.removeEventListener('pointerdown', resetOutside)
  }, [selectedDay])

  // This card needs two fractional digits; the shared compact formatter fixes one.
  const tokenFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: 2,
      }),
    [locale]
  )
  const title = t('Daily activity')
  const valueOf = (day: number): number => {
    const item = byDate.get(shanghaiDateKey(day))
    return metric === 'tokens' ? (item?.token_used ?? 0) : (item?.quota ?? 0)
  }
  const formatValue = (value: number): string =>
    metric === 'tokens'
      ? `${formatNumber(value, locale)} ${t('Tokens')}`
      : formatQuota(value)
  const formatDisplayValue = (value: number): string =>
    metric === 'tokens'
      ? `${tokenFormatter.format(value)} ${t('Tokens')}`
      : formatQuota(value)
  const summary = useMemo(() => {
    const firstDate = shanghaiDateKey(windowStart)
    const lastDate = shanghaiDateKey(props.end)
    let tokens = 0
    let quota = 0
    let activeDays = 0
    for (const [date, item] of byDate) {
      if (date < firstDate || date > lastDate) continue
      const dayTokens = item.token_used ?? 0
      const dayQuota = item.quota ?? 0
      tokens += dayTokens
      quota += dayQuota
      if (dayTokens > 0 || dayQuota > 0) activeDays += 1
    }
    return { tokens, quota, activeDays }
  }, [byDate, windowStart, props.end])
  const windowDays =
    Math.round((shanghaiDayStart(props.end) - windowStart) / DAY_SECONDS) + 1
  const shortDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        timeZone: 'Asia/Shanghai',
      }),
    [locale]
  )
  const dayRangeLabel = `${shortDateFormatter.format(new Date(windowStart * 1000))} – ${shortDateFormatter.format(new Date(shanghaiDayStart(props.end) * 1000))}`
  let footerLabel = `${t('Active days')} · ${formatNumber(summary.activeDays, locale)}`
  let footerValue = `${t('Total')} ${formatDisplayValue(summary[metric])}`
  if (!hasHistory) {
    footerValue = '—'
    footerLabel = t('No activity yet')
    if (props.loading) footerLabel = t('Loading...')
    else if (props.error) footerLabel = t('Failed to load')
  }

  let calendar
  if (!hasHistory && props.loading) {
    calendar = (
      <Skeleton className='h-full w-full' aria-label={t('Loading...')} />
    )
  } else if (!hasHistory && props.error) {
    calendar = (
      <ErrorState
        compact
        className='h-full justify-center text-xs'
        title={t('Failed to load')}
        onRetry={props.onRetry}
      />
    )
  } else if (!hasHistory) {
    calendar = (
      <EmptyState
        className='min-h-0 p-0 [&_[data-slot=empty-description]]:text-[11px] [&_[data-slot=empty-description]]:leading-4 [&_[data-slot=empty-icon]]:hidden [&_[data-slot=empty-title]]:text-xs'
        title={t('No activity yet')}
        description={t(
          'Daily usage will appear here after you start using models.'
        )}
      />
    )
  } else {
    const gridTemplateColumns = `repeat(${columns.length}, minmax(0, 1fr))`
    const gridTemplateRows = `repeat(${WEEK_ROWS}, var(--heatmap-cell-size))`
    const minWidth =
      columns.length * CELL_SIZE + Math.max(0, columns.length - 1) * CELL_GAP
    calendar = (
      <TooltipProvider>
        <div
          ref={calendarRef}
          className='@container/calendar grid min-h-0 min-w-0 grid-cols-[32px_minmax(0,1fr)] gap-2'
          style={{ '--heatmap-cell-size': cellSize } as CSSProperties}
        >
          <div
            aria-hidden='true'
            className='text-muted-foreground grid gap-[3px] self-start pt-5 text-[10px] leading-none'
            style={{ gridTemplateRows }}
          >
            {Array.from({ length: WEEK_ROWS }, (_, index) => (
              <span key={index} className='flex min-h-0 items-center'>
                {index % 2 === 0
                  ? weekdayFormatter.format(
                      new Date((columns[0].start + index * DAY_SECONDS) * 1000)
                    )
                  : null}
              </span>
            ))}
          </div>
          <div
            ref={scrollRef}
            className='no-scrollbar min-w-0 overflow-x-auto px-0.5 pb-0.5'
          >
            <div style={{ minWidth }}>
              <div
                className='mb-1 grid h-4 gap-x-[3px]'
                style={{ gridTemplateColumns }}
                aria-hidden='true'
              >
                {months.map((month) => (
                  <span
                    key={month.key}
                    className='text-muted-foreground truncate text-[10px] leading-4'
                    style={{
                      gridColumn: `${month.column + 1} / span ${month.span}`,
                    }}
                  >
                    {month.label}
                  </span>
                ))}
              </div>
              <div
                className='grid gap-[3px]'
                style={{
                  gridTemplateColumns,
                  gridTemplateRows,
                  gridAutoFlow: 'column',
                }}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setFocusedDay(null)
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setSelectedDay(null)
                    setHoveredDay(null)
                    setFocusedDay(null)
                    if (event.target instanceof HTMLElement) event.target.blur()
                    return
                  }
                  const day = focusedDay ?? defaultDay
                  let nextDay = day
                  switch (event.key) {
                    case 'ArrowLeft':
                      nextDay -= WEEK_ROWS * DAY_SECONDS
                      break
                    case 'ArrowRight':
                      nextDay += WEEK_ROWS * DAY_SECONDS
                      break
                    case 'ArrowUp':
                      nextDay -= DAY_SECONDS
                      break
                    case 'ArrowDown':
                      nextDay += DAY_SECONDS
                      break
                    case 'Home':
                      nextDay -= shanghaiWeekday(day) * DAY_SECONDS
                      break
                    case 'End':
                      nextDay += (6 - shanghaiWeekday(day)) * DAY_SECONDS
                      break
                    default:
                      return
                  }
                  event.preventDefault()
                  const target = Math.max(
                    windowStart,
                    Math.min(nextDay, shanghaiDayStart(props.end))
                  )
                  const cell =
                    event.currentTarget.querySelector<HTMLButtonElement>(
                      `[data-day="${target}"]`
                    )
                  cell?.focus({ preventScroll: true })
                  cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                }}
              >
                {columns.flatMap((column) =>
                  column.days.map((day, index) => {
                    if (day === null) {
                      const slotDay = column.start + index * DAY_SECONDS
                      return (
                        <div
                          key={slotDay}
                          aria-hidden='true'
                          className='h-[var(--heatmap-cell-size)] w-full'
                        />
                      )
                    }
                    const value = valueOf(day)
                    const label = dateFormatter.format(new Date(day * 1000))
                    return (
                      <Tooltip
                        key={day}
                        triggerId={`${heatmapId}-${day}`}
                        open={activeDay === day}
                        onOpenChange={(open, details) => {
                          if (details.reason === 'trigger-hover') {
                            setHoveredDay((current) => {
                              if (open) return day
                              return current === day ? null : current
                            })
                          }
                          if (!open && details.reason === 'escape-key') {
                            setHoveredDay(null)
                            setFocusedDay(null)
                            setSelectedDay(null)
                          }
                        }}
                      >
                        <TooltipTrigger
                          id={`${heatmapId}-${day}`}
                          render={<Button />}
                          closeOnClick={false}
                          data-day={day}
                          aria-label={`${label}: ${formatValue(value)}`}
                          aria-pressed={day === activeDay}
                          aria-describedby={
                            activeDay === day
                              ? `${heatmapId}-${day}-details`
                              : undefined
                          }
                          tabIndex={day === (focusedDay ?? defaultDay) ? 0 : -1}
                          className={cn(
                            'h-[var(--heatmap-cell-size)] w-full max-w-none min-w-0 rounded-[2px] border-0 p-0 transition-none focus-visible:ring-2 active:not-aria-[haspopup]:translate-y-0',
                            LEVEL_CLASSES[levelFor(value, maxValue)],
                            day === (activeDay ?? defaultDay) &&
                              'ring-primary ring-1 ring-offset-1 ring-offset-card'
                          )}
                          onFocus={() => {
                            setFocusedDay(day)
                            setHoveredDay(null)
                          }}
                          onPointerDown={(event) =>
                            setSelectedDay(
                              event.pointerType === 'touch' ? day : null
                            )
                          }
                          onPointerCancel={() => setSelectedDay(null)}
                        />
                        <TooltipContent
                          id={`${heatmapId}-${day}-details`}
                          role='tooltip'
                          side='top'
                          sideOffset={8}
                          className='grid min-w-40 gap-1.5 px-2.5 py-2'
                        >
                          <span className='text-background/70 text-[11px]'>
                            {label} ·{' '}
                            {weekdayFormatter.format(new Date(day * 1000))}
                          </span>
                          <span className='flex items-baseline justify-between gap-4'>
                            <span className='text-background/70 text-[11px]'>
                              {metric === 'tokens'
                                ? t('Token usage')
                                : t('Quota usage')}
                            </span>
                            <span className='font-medium tabular-nums'>
                              {formatDisplayValue(value)}
                            </span>
                          </span>
                        </TooltipContent>
                      </Tooltip>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <OverviewCard
      compact
      className={cn(
        '@container/heatmap [&>div]:px-0',
        SECTION_FRAME_CLASSNAME,
        // The strip is one row, so the card shrinks to its content instead of
        // reserving a 240px canvas.
        'h-auto'
      )}
      contentClassName='pt-3 @max-[400px]/heatmap:grid-rows-[52px_minmax(0,1fr)] @max-[400px]/heatmap:gap-1 @max-[400px]/heatmap:py-3'
      label={title}
      header={
        <SectionHeading
          className='min-w-0 @max-[400px]/heatmap:flex-col @max-[400px]/heatmap:items-stretch @max-[400px]/heatmap:gap-1'
          title={
            <span className='truncate' title={title}>
              {title}
            </span>
          }
          actions={
            <div ref={metricRef}>
              <Tabs
                value={metric}
                onValueChange={(value) => {
                  if (value === 'tokens' || value === 'quota') setMetric(value)
                }}
              >
                <TabsList
                  variant='line'
                  aria-label={t('Usage metric')}
                  className='h-5 p-0 group-data-horizontal/tabs:h-5 @max-[400px]/heatmap:w-full'
                >
                  <TabsTrigger
                    value='tokens'
                    className='flex-none px-2 text-[11px] @max-[400px]/heatmap:flex-1'
                  >
                    {t('Token usage')}
                  </TabsTrigger>
                  <TabsTrigger
                    value='quota'
                    className='flex-none px-2 text-[11px] @max-[400px]/heatmap:flex-1'
                  >
                    {t('Quota usage')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          }
        />
      }
      footer={
        <div
          role='status'
          aria-live='polite'
          aria-atomic='true'
          className='flex min-w-0 items-center justify-between gap-2 text-[11px] leading-4 tabular-nums'
        >
          <span
            className='text-muted-foreground min-w-0 truncate'
            title={footerLabel}
          >
            {footerLabel}
          </span>
          <span className='shrink-0 text-[13px] leading-5 font-medium'>
            <span aria-hidden='true'>{footerValue}</span>
            <span className='sr-only'>
              {hasHistory
                ? `${t('Total')} ${formatValue(summary[metric])}`
                : footerValue}
            </span>
          </span>
        </div>
      }
    >
      <div
        className='flex h-full min-h-0 min-w-0 flex-col gap-2 @max-[400px]/heatmap:gap-0.5'
        aria-busy={props.loading}
      >
        <div className='text-muted-foreground flex h-4 shrink-0 items-center justify-between gap-2 text-[11px] leading-4'>
          <span className='flex min-w-0 items-center gap-1.5'>
            <span
              className='truncate'
              title={`${dayRangeLabel} · ${t('Beijing time')}`}
            >
              {windowDays > 45
                ? t('Last {{count}} months', {
                    count: Math.round(windowDays / 30),
                  })
                : t('Last {{count}} days', { count: windowDays })}{' '}
              · {t('Beijing time')}
            </span>
            {hasHistory && props.loading && (
              <Spinner
                role='img'
                aria-label={t('Refreshing...')}
                className='size-3 shrink-0 motion-reduce:animate-none'
              />
            )}
          </span>
          {hasHistory && props.error && !props.loading ? (
            <ErrorState
              compact
              inline
              title={t('Failed to load')}
              description={t('Failed to refresh')}
              onRetry={props.onRetry}
            />
          ) : (
            <div
              className='flex shrink-0 items-center gap-1 text-[10px]'
              aria-label={t('Usage intensity')}
            >
              <span>{t('Less')}</span>
              {LEVEL_CLASSES.map((levelClass) => (
                <span
                  key={levelClass}
                  aria-hidden='true'
                  className={`size-2.5 rounded-[2px] ${levelClass}`}
                />
              ))}
              <span>{t('More')}</span>
            </div>
          )}
        </div>
        <div className='flex min-h-0 min-w-0 flex-1 flex-col gap-2'>
          <div className='flex min-h-0 min-w-0 flex-col justify-center'>
            {calendar}
          </div>
        </div>
      </div>
      {hasHistory && (
        <>
          <table className='sr-only' aria-label={title}>
            <thead>
              <tr>
                <th>{t('Date')}</th>
                <th>{t('Token usage')}</th>
                <th>{t('Quota usage')}</th>
              </tr>
            </thead>
            <tbody>
              {columns.flatMap((column) =>
                column.days.map((day) => {
                  if (day === null) return null
                  const item = byDate.get(shanghaiDateKey(day))
                  return (
                    <tr key={day}>
                      <td>{dateFormatter.format(new Date(day * 1000))}</td>
                      <td>{`${formatNumber(item?.token_used ?? 0, locale)} ${t('Tokens')}`}</td>
                      <td>{formatQuota(item?.quota ?? 0)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
          <p className='sr-only'>
            {t('Days are grouped by Asia/Shanghai (UTC+8) calendar days.')}
          </p>
        </>
      )}
    </OverviewCard>
  )
}
