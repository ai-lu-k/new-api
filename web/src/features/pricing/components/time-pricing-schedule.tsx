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
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { toIntlLocale } from '@/i18n/languages'
import { cn } from '@/lib/utils'

import { TIME_PRICING_TONES } from '../constants'
import { useBillingTime } from '../hooks/use-billing-time'
import {
  getTimePriceSchedule,
  timePriceTierLabel,
} from '../lib/time-price-schedule'

export function TimePricingSchedule(props: { billingExpr: string }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const now = useBillingTime(props.billingExpr)
  const [weekOffset, setWeekOffset] = useState(0)
  const schedule = useMemo(
    () =>
      getTimePriceSchedule(
        props.billingExpr,
        new Date(now ?? Date.now()),
        weekOffset
      ),
    [props.billingExpr, now, weekOffset]
  )
  if (!schedule) return null
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  const weekdayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    timeZone: 'UTC',
  })
  const calendarDateFormatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC',
  })
  const today = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: schedule.timezone,
  }).format(new Date(now ?? Date.now()))
  return (
    <section
      aria-label={t('Price schedule')}
      className='mb-5 flex min-w-0 flex-col gap-3'
    >
      <header className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
          <h4 className='text-sm font-semibold'>{t('Price schedule')}</h4>
          <p className='text-muted-foreground text-[11px]'>
            {schedule.timezone}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <div className='flex items-center gap-1'>
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={t('Previous week')}
              onClick={() => setWeekOffset((offset) => offset - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className='px-1 text-xs font-medium tabular-nums'>
              {dateFormatter.format(schedule.days[0].date)} –{' '}
              {dateFormatter.format(schedule.days[6].date)}
            </span>
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={t('Next week')}
              onClick={() => setWeekOffset((offset) => offset + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
          <Button variant='outline' size='xs' onClick={() => setWeekOffset(0)}>
            {t('Today')}
          </Button>
        </div>
      </header>
      <ScrollArea className='w-full'>
        <div className='min-w-[360px] pb-2'>
          <div className='grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] border-t border-r border-b text-[10px]'>
            <div className='border-b' />
            {schedule.days.map((day) => {
              const isToday = calendarDateFormatter.format(day.date) === today
              return (
                <div
                  key={day.date.toISOString()}
                  className='flex flex-col items-center gap-0.5 border-b border-l py-1.5'
                >
                  <span
                    className={cn(
                      'text-muted-foreground',
                      isToday && 'text-primary font-medium'
                    )}
                  >
                    {weekdayFormatter.format(day.date)}
                  </span>
                  <time
                    dateTime={day.date.toISOString().slice(0, 10)}
                    aria-current={isToday ? 'date' : undefined}
                    className={cn(
                      'text-sm leading-4 font-medium tabular-nums',
                      isToday && 'text-primary font-semibold'
                    )}
                  >
                    {day.date.getUTCDate()}
                  </time>
                </div>
              )
            })}
            <div
              aria-hidden='true'
              className='text-muted-foreground relative h-40 text-[10px] tabular-nums'
            >
              {[0, 6, 12, 18, 24].map((hour) => (
                <span
                  key={hour}
                  className='absolute right-2 -translate-y-1/2 leading-none'
                  style={{ top: `${(hour / 24) * 100}%` }}
                >
                  {String(hour).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            {schedule.days.map((day, dayIndex) => (
              <div
                key={day.date.toISOString()}
                className='relative h-40 border-l'
              >
                {[0, 6, 12, 18, 24].map((hour) => (
                  <div
                    key={hour}
                    aria-hidden='true'
                    className='border-border pointer-events-none absolute inset-x-0 border-t'
                    style={{ top: `${(hour / 24) * 100}%` }}
                  />
                ))}
                {day.segments.map((segment) => {
                  const label = timePriceTierLabel(
                    schedule.labels[segment.tier],
                    t
                  )
                  const time = `${String(segment.start).padStart(2, '0')}:00–${String(segment.end).padStart(2, '0')}:00`
                  const isOffPeak = schedule.labels[segment.tier] === 'off_peak'
                  const joinsPrevious = schedule.days[
                    dayIndex - 1
                  ]?.segments.some(
                    (neighbor) =>
                      neighbor.tier === segment.tier &&
                      neighbor.start === segment.start &&
                      neighbor.end === segment.end
                  )
                  const joinsNext = schedule.days[dayIndex + 1]?.segments.some(
                    (neighbor) =>
                      neighbor.tier === segment.tier &&
                      neighbor.start === segment.start &&
                      neighbor.end === segment.end
                  )
                  return (
                    <div
                      key={segment.start}
                      role='img'
                      aria-label={`${dateFormatter.format(day.date)} ${time} · ${label}`}
                      title={`${time} · ${label}`}
                      className={cn(
                        'absolute overflow-hidden',
                        isOffPeak
                          ? 'inset-x-0'
                          : cn(
                              '-left-px right-0',
                              !joinsPrevious && 'rounded-l-sm',
                              !joinsNext && 'rounded-r-sm',
                              TIME_PRICING_TONES[
                                segment.tier % TIME_PRICING_TONES.length
                              ],
                              schedule.labels[segment.tier] === 'peak' &&
                                'bg-primary text-primary-foreground'
                            )
                      )}
                      style={{
                        top: `${(segment.start / 24) * 100}%`,
                        height: `${((segment.end - segment.start) / 24) * 100}%`,
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        <ScrollBar orientation='horizontal' />
      </ScrollArea>
      <footer className='text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-[11px]'>
        {schedule.labels.map((label, index) => {
          const windows = new Set<string>()
          if (label !== 'off_peak') {
            for (const day of schedule.days) {
              for (const segment of day.segments) {
                if (segment.tier === index) {
                  windows.add(
                    `${String(segment.start).padStart(2, '0')}:00–${String(segment.end).padStart(2, '0')}:00`
                  )
                }
              }
            }
          }
          return (
            <span
              key={schedule.ids[index]}
              className='flex flex-wrap items-center gap-1.5'
            >
              <span
                aria-hidden='true'
                className={cn(
                  'size-2.5 rounded-xs border',
                  label === 'off_peak'
                    ? 'bg-background border-border'
                    : TIME_PRICING_TONES[index % TIME_PRICING_TONES.length],
                  label === 'peak' && 'border-primary bg-primary'
                )}
              />
              <span>{timePriceTierLabel(label, t)}</span>
              {windows.size > 0 && (
                <span className='tabular-nums'>{[...windows].join(' · ')}</span>
              )}
            </span>
          )
        })}
      </footer>
    </section>
  )
}
