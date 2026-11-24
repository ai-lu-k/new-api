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
import { useQuery } from '@tanstack/react-query'
import { VChart } from '@visactor/react-vchart'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LearnMore } from '@/components/learn-more'
import { SectionPanel } from '@/components/section-panel'
import { StatRow, type StatRowItem } from '@/components/stat-row'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatExpenseAmount } from '@/features/rankings/lib'
import { toIntlLocale } from '@/i18n/languages'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useChartTheme } from '@/lib/use-chart-theme'
import { VCHART_OPTION } from '@/lib/vchart'

import { getFinanceDaily } from '../api'
import type { FinanceDay } from '../types'
import { MetricLabel } from './metric-label'

// Money received, money spent, and the quota given away that day at face value.
// Gifts are not money and stay out of the net, so they keep a muted tone.
// Consumption and the gift part of it are what users were charged, so they are
// plotted in their own panel instead of being dressed up as yuan.
const MONEY_COLOURS = ['#5B8DEF', '#F2A65A', '#B8C2D1']
const USAGE_COLOURS = ['#8B7CE8', '#2FA8A0']
// New accounts are a count, not money, so they get their own muted bar chart.
const USER_BAR_COLOUR = '#9AA8BD'
const DAY_SECONDS = 86_400
// The site counts days in Asia/Shanghai, the same as the server.
const SHANGHAI_OFFSET_SECONDS = 8 * 3_600

type Range = 'month' | 'days30' | 'days90'

const RANGES: { id: Range; labelKey: string }[] = [
  { id: 'month', labelKey: 'Current month' },
  { id: 'days30', labelKey: 'Last 30 days' },
  { id: 'days90', labelKey: 'Last 90 days' },
]

function shanghaiDayStart(seconds: number): number {
  return (
    Math.floor((seconds + SHANGHAI_OFFSET_SECONDS) / DAY_SECONDS) *
      DAY_SECONDS -
    SHANGHAI_OFFSET_SECONDS
  )
}

function shanghaiMonthStart(seconds: number): number {
  const shifted = new Date((seconds + SHANGHAI_OFFSET_SECONDS) * 1000)
  return (
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) / 1000 -
    SHANGHAI_OFFSET_SECONDS
  )
}

function rangeBounds(
  range: Range,
  now: number
): { start: number; end: number } {
  if (range === 'month') {
    return { start: shanghaiMonthStart(now), end: now }
  }
  const days = range === 'days30' ? 30 : 90
  return { start: shanghaiDayStart(now) - (days - 1) * DAY_SECONDS, end: now }
}

/** Money received on a day: checkout payments plus paid offline additions. */
function dailyIncome(day: FinanceDay): number {
  return day.online_topup + day.manual_topup
}

/**
 * A chart plots only the part of the range that holds figures in it. A 90-day
 * window whose money all arrived in the last six days otherwise spends 84 % of
 * its width on an empty axis. The day before the first figure stays in, so a
 * series always starts at zero rather than halfway up.
 */
function trimToData(
  days: FinanceDay[],
  hasFigures: (day: FinanceDay) => boolean
): FinanceDay[] {
  const first = days.findIndex(hasFigures)
  if (first < 0) {
    return []
  }
  return days.slice(Math.max(0, first - 1))
}

/** Today's money, usage and registrations for the chosen range. */
export function DailyFinanceChart() {
  const { t, i18n } = useTranslation()
  const { resolvedTheme, themeReady } = useChartTheme()
  const language = i18n.language
  const locale = toIntlLocale(language)
  const [range, setRange] = useState<Range>('month')
  const bounds = useMemo(
    () => rangeBounds(range, Math.floor(Date.now() / 1000)),
    [range]
  )
  const query = useQuery({
    queryKey: ['finance-daily', bounds.start, bounds.end],
    queryFn: async () =>
      requireServerSuccess(
        await getFinanceDaily({
          start_timestamp: bounds.start,
          end_timestamp: bounds.end,
        })
      ),
  })
  const days = useMemo(() => query.data?.data?.days ?? [], [query.data])
  const chartTextColor =
    resolvedTheme === 'dark'
      ? 'rgba(255, 255, 255, 0.68)'
      : 'rgba(15, 23, 42, 0.58)'
  const chartGridColor =
    resolvedTheme === 'dark'
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(15, 23, 42, 0.12)'

  const money = (value: number) => formatExpenseAmount(value, language)

  const totals = useMemo(() => {
    let income = 0
    let spending = 0
    let gift = 0
    let consumption = 0
    let newUsers = 0
    for (const day of days) {
      income += dailyIncome(day)
      spending += day.expenses
      gift += day.gift
      consumption += day.consumption
      newUsers += day.new_users
    }
    return {
      income,
      spending,
      net: income - spending,
      gift,
      consumption,
      newUsers,
    }
  }, [days])

  // Each chart shows the window its own figures occupy; the totals above still
  // cover the whole range the tabs asked for.
  const moneyDays = useMemo(
    () =>
      trimToData(
        days,
        (day) => dailyIncome(day) > 0 || day.expenses > 0 || day.gift > 0
      ),
    [days]
  )
  const usageDays = useMemo(
    () =>
      trimToData(
        days,
        (day) => day.gift > 0 || day.consumption > 0 || day.plan_free > 0
      ),
    [days]
  )
  const userDays = useMemo(
    () => trimToData(days, (day) => day.new_users > 0),
    [days]
  )

  const spec = useMemo(() => {
    // The chart labels each point with the day it stands for, in the active
    // interface language and in the site's own Asia/Shanghai calendar.
    const dayLabel = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'Asia/Shanghai',
    })
    const values = moneyDays.flatMap((day) => {
      const date = dayLabel.format(new Date(`${day.date}T00:00:00Z`))
      return [
        { date, kind: t('Income'), amount: dailyIncome(day) },
        { date, kind: t('Spending'), amount: day.expenses },
        { date, kind: t('Gifts'), amount: day.gift },
      ]
    })
    const tidy = (val: number | string) =>
      formatExpenseAmount(Number(val), language).replace(/\.00$/, '')
    const amount = (val: unknown) =>
      formatExpenseAmount(Number(val) || 0, language)
    return {
      type: 'line' as const,
      data: [{ id: 'finance-daily', values }],
      xField: 'date',
      yField: 'amount',
      seriesField: 'kind',
      color: MONEY_COLOURS,
      point: { visible: values.length <= 64, style: { size: 3 } },
      line: { style: { lineWidth: 2 } },
      legends: {
        visible: true,
        orient: 'bottom' as const,
        item: { label: { style: { fill: chartTextColor } } },
      },
      axes: [
        {
          orient: 'bottom',
          label: {
            style: { fill: chartTextColor, fontSize: 11 },
            autoHide: true,
          },
          tick: { visible: false },
        },
        {
          orient: 'left',
          min: 0,
          label: {
            formatMethod: tidy,
            style: { fill: chartTextColor, fontSize: 10 },
          },
          grid: {
            visible: true,
            style: { lineDash: [3, 3], stroke: chartGridColor },
          },
        },
      ],
      tooltip: {
        dimension: {
          content: [
            {
              key: (datum: Record<string, unknown>) =>
                String(datum?.kind ?? ''),
              value: (datum: Record<string, unknown>) => amount(datum?.amount),
            },
          ],
        },
      },
      animationAppear: { duration: 400 },
    }
  }, [moneyDays, chartGridColor, chartTextColor, language, locale, t])

  const usageSpec = useMemo(() => {
    const dayLabel = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'Asia/Shanghai',
    })
    const values = usageDays.flatMap((day) => {
      const date = dayLabel.format(new Date(`${day.date}T00:00:00Z`))
      return [
        { date, kind: t('Consumption'), amount: day.consumption },
        { date, kind: t('Gift credit spent'), amount: day.gift_consumed },
      ]
    })
    const tidy = (val: number | string) =>
      formatExpenseAmount(Number(val) || 0, language).replace(/\.00$/, '')
    const amount = (val: unknown) =>
      formatExpenseAmount(Number(val) || 0, language)
    return {
      type: 'line' as const,
      data: [{ id: 'finance-usage', values }],
      xField: 'date',
      yField: 'amount',
      seriesField: 'kind',
      color: USAGE_COLOURS,
      point: { visible: values.length <= 64, style: { size: 2.5 } },
      line: { style: { lineWidth: 2 } },
      legends: {
        visible: true,
        orient: 'bottom' as const,
        item: { label: { style: { fill: chartTextColor } } },
      },
      axes: [
        {
          orient: 'bottom',
          label: {
            style: { fill: chartTextColor, fontSize: 11 },
            autoHide: true,
          },
          tick: { visible: false },
        },
        {
          orient: 'left',
          min: 0,
          label: {
            formatMethod: tidy,
            style: { fill: chartTextColor, fontSize: 10 },
          },
          grid: {
            visible: true,
            style: { lineDash: [3, 3], stroke: chartGridColor },
          },
        },
      ],
      tooltip: {
        dimension: {
          content: [
            {
              key: (datum: Record<string, unknown>) =>
                String(datum?.kind ?? ''),
              value: (datum: Record<string, unknown>) => amount(datum?.amount),
            },
          ],
        },
      },
      animationAppear: { duration: 400 },
    }
  }, [usageDays, chartGridColor, chartTextColor, language, locale, t])

  const userSpec = useMemo(() => {
    const dayLabel = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'Asia/Shanghai',
    })
    const values = userDays.map((day) => ({
      date: dayLabel.format(new Date(`${day.date}T00:00:00Z`)),
      count: day.new_users,
    }))
    return {
      type: 'bar' as const,
      data: [{ id: 'finance-users', values }],
      xField: 'date',
      yField: 'count',
      barMaxWidth: 12,
      color: USER_BAR_COLOUR,
      legends: { visible: false },
      axes: [
        {
          orient: 'bottom',
          label: {
            style: { fill: chartTextColor, fontSize: 11 },
            autoHide: true,
          },
          tick: { visible: false },
        },
        {
          orient: 'left',
          min: 0,
          label: {
            formatMethod: (val: number | string) =>
              String(Math.round(Number(val) || 0)),
            style: { fill: chartTextColor, fontSize: 10 },
          },
          grid: {
            visible: true,
            style: { lineDash: [3, 3], stroke: chartGridColor },
          },
        },
      ],
      tooltip: {
        mark: {
          content: [
            {
              key: t('New users'),
              value: (datum: Record<string, unknown>) =>
                String(datum?.count ?? 0),
            },
          ],
        },
      },
      animationAppear: { duration: 400 },
    }
  }, [chartGridColor, chartTextColor, userDays, locale, t])

  const dayStats: StatRowItem[] = [
    {
      key: 'income',
      label: (
        <MetricLabel
          label={t('Income')}
          hint={t(
            'Money received that day: checkout payments plus paid offline additions.'
          )}
        />
      ),
      value: money(totals.income),
      valueText: money(totals.income),
    },
    {
      key: 'spending',
      label: (
        <MetricLabel
          label={t('Spending')}
          hint={t(
            'Money the site paid that day: ledger expenses and upstream top-ups.'
          )}
        />
      ),
      value: money(totals.spending),
      valueText: money(totals.spending),
    },
    {
      key: 'net',
      label: (
        <MetricLabel
          label={t('Net')}
          hint={t('Income minus spending for the day shown.')}
        />
      ),
      value: money(totals.net),
      valueText: money(totals.net),
      tone: totals.net < 0 ? 'destructive' : 'default',
    },
    {
      key: 'gift',
      label: (
        <MetricLabel
          label={t('Gifts')}
          hint={t(
            'Quota given that day: check-ins, codes, events and manual gifts, at face value.'
          )}
        />
      ),
      value: money(totals.gift),
      valueText: money(totals.gift),
    },
    {
      key: 'consumption',
      label: (
        <MetricLabel
          label={t('Consumption')}
          hint={t(
            'What users were charged that day for settled requests; the Token Plan free quota is part of it.'
          )}
        />
      ),
      value: money(totals.consumption),
      valueText: money(totals.consumption),
    },
    {
      key: 'newUsers',
      label: (
        <MetricLabel
          label={t('New users')}
          hint={t('Ordinary accounts registered that day.')}
        />
      ),
      value: String(totals.newUsers),
      valueText: String(totals.newUsers),
    },
  ]

  const hasFigures = days.some(
    (day) =>
      dailyIncome(day) > 0 ||
      day.expenses > 0 ||
      day.gift > 0 ||
      day.gift_consumed > 0 ||
      day.consumption > 0 ||
      day.new_users > 0
  )

  return (
    <section aria-label={t('Daily overview')}>
      <SectionPanel
        title={t('Daily overview')}
        actions={
          <Tabs
            value={range}
            onValueChange={(value) => setRange(value as Range)}
          >
            <TabsList aria-label={t('Period')}>
              {RANGES.map((entry) => (
                <TabsTrigger key={entry.id} value={entry.id}>
                  {t(entry.labelKey)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
        contentClassName='space-y-4'
      >
        {/* Three figures per row on desktop, two on phones: a three-column
            row at 390 px cuts amounts in half mid-number. */}
        <StatRow
          columns={3}
          className='grid-cols-2 divide-x-0 lg:grid-cols-3 lg:divide-x'
          items={dayStats}
        />

        <div>
          {query.isLoading && <Skeleton className='h-64 w-full' />}
          {query.isError && (
            <p className='text-muted-foreground py-16 text-center text-sm'>
              {t('Unable to load income data')}
            </p>
          )}
          {!query.isLoading && !query.isError && !hasFigures && (
            <p className='text-muted-foreground py-16 text-center text-sm'>
              {t('No income or expenses in this period.')}
            </p>
          )}
          {!query.isLoading && !query.isError && hasFigures && (
            <>
              {moneyDays.length > 0 ? (
                <div className='h-56 sm:h-64'>
                  {themeReady && (
                    <VChart
                      key={`finance-daily-${resolvedTheme}-${language}-${range}`}
                      spec={{
                        ...spec,
                        theme: resolvedTheme === 'dark' ? 'dark' : 'light',
                        background: 'transparent',
                      }}
                      option={VCHART_OPTION}
                    />
                  )}
                </div>
              ) : (
                <p className='text-muted-foreground py-12 text-center text-sm'>
                  {t('No income or expenses in this period.')}
                </p>
              )}
              <div className='mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2'>
                <div>
                  <h3 className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
                    {t('Consumption')}
                    <LearnMore
                      triggerProps={{
                        'aria-label': t('Consumption'),
                        className:
                          'size-4 shrink-0 border-0 bg-transparent text-muted-foreground hover:bg-transparent [&_svg]:size-3.5',
                        openOnHover: true,
                        delay: 0,
                      }}
                      contentProps={{ className: 'max-w-72 text-xs leading-5' }}
                    >
                      {t(
                        'What users were charged that day for settled requests; the Token Plan free quota is part of it.'
                      )}
                    </LearnMore>
                  </h3>
                  {usageDays.length > 0 ? (
                    <div className='mt-2 h-40'>
                      {themeReady && (
                        <VChart
                          key={`finance-usage-${resolvedTheme}-${language}-${range}`}
                          spec={{
                            ...usageSpec,
                            theme: resolvedTheme === 'dark' ? 'dark' : 'light',
                            background: 'transparent',
                          }}
                          option={VCHART_OPTION}
                        />
                      )}
                    </div>
                  ) : (
                    <p className='text-muted-foreground mt-2 flex h-40 items-center text-xs'>
                      {t('No data')}
                    </p>
                  )}
                </div>
                <div>
                  <h3 className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
                    {t('New users')}
                    <LearnMore
                      triggerProps={{
                        'aria-label': t('New users'),
                        className:
                          'size-4 shrink-0 border-0 bg-transparent text-muted-foreground hover:bg-transparent [&_svg]:size-3.5',
                        openOnHover: true,
                        delay: 0,
                      }}
                      contentProps={{ className: 'max-w-72 text-xs leading-5' }}
                    >
                      {t('Ordinary accounts registered that day.')}
                    </LearnMore>
                  </h3>
                  {userDays.length > 0 ? (
                    <div className='mt-2 h-40'>
                      {themeReady && (
                        <VChart
                          key={`finance-users-${resolvedTheme}-${language}-${range}`}
                          spec={{
                            ...userSpec,
                            theme: resolvedTheme === 'dark' ? 'dark' : 'light',
                            background: 'transparent',
                          }}
                          option={VCHART_OPTION}
                        />
                      )}
                    </div>
                  ) : (
                    <p className='text-muted-foreground mt-2 flex h-40 items-center text-xs'>
                      {t('No data')}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </SectionPanel>
    </section>
  )
}
