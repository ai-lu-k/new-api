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
import { VChart } from '@visactor/react-vchart'
import { useTranslation } from 'react-i18next'

import {
  formatExpenseAmount,
  formatExpenseMonth,
} from '@/features/rankings/lib'
import { useChartTheme } from '@/lib/use-chart-theme'
import { VCHART_OPTION } from '@/lib/vchart'

import { totalGift, totalTopUp } from '../lib'
import type { FinanceMonth } from '../types'

// Top-ups in the brand blue, expenses in a warm tone, gifts muted: the two
// that are money stand out against the one that is not.
const SERIES_COLOURS = ['#5B8DEF', '#F2A65A', '#B8C2D1']

type FinanceChartProps = {
  months: FinanceMonth[]
}

/** Top-ups, expenses and gifts side by side for each month. */
export function FinanceChart(props: FinanceChartProps) {
  const { t, i18n } = useTranslation()
  const { resolvedTheme, themeReady } = useChartTheme()
  const language = i18n.language
  const chartTextColor =
    resolvedTheme === 'dark'
      ? 'rgba(255, 255, 255, 0.68)'
      : 'rgba(15, 23, 42, 0.58)'
  const chartGridColor =
    resolvedTheme === 'dark'
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(15, 23, 42, 0.12)'

  const spec = useMemo(() => {
    const ordered = [...props.months].sort((a, b) =>
      a.month.localeCompare(b.month)
    )
    const values = ordered.flatMap((month) => {
      const label = formatExpenseMonth(month.month, language)
      return [
        { month: label, kind: t('Top-ups'), amount: totalTopUp(month) },
        { month: label, kind: t('Spending'), amount: month.expenses },
        { month: label, kind: t('Gifts'), amount: totalGift(month) },
      ]
    })
    return {
      type: 'bar' as const,
      data: [{ id: 'finance', values }],
      xField: ['month', 'kind'],
      yField: 'amount',
      seriesField: 'kind',
      barMaxWidth: 28,
      color: SERIES_COLOURS,
      legends: {
        visible: true,
        orient: 'bottom' as const,
        item: { label: { style: { fill: chartTextColor } } },
      },
      axes: [
        {
          orient: 'bottom',
          label: { style: { fill: chartTextColor, fontSize: 11 } },
          tick: { visible: false },
        },
        {
          orient: 'left',
          min: 0,
          label: {
            formatMethod: (val: number | string) =>
              formatExpenseAmount(Number(val), language).replace(/\.00$/, ''),
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
              key: (datum: Record<string, unknown>) => String(datum?.kind ?? ''),
              value: (datum: Record<string, unknown>) =>
                formatExpenseAmount(Number(datum?.amount) || 0, language),
            },
          ],
        },
        dimension: {
          content: [
            {
              key: (datum: Record<string, unknown>) => String(datum?.kind ?? ''),
              value: (datum: Record<string, unknown>) =>
                formatExpenseAmount(Number(datum?.amount) || 0, language),
            },
          ],
        },
      },
      animationAppear: { duration: 500 },
    }
  }, [chartGridColor, chartTextColor, language, props.months, t])

  return (
    <section
      aria-label={t('Top-ups, expenses and gifts by month')}
      className='bg-card overflow-hidden rounded-xl border'
    >
      <header className='px-5 py-4'>
        <h2 className='text-base font-semibold'>
          {t('Top-ups, expenses and gifts by month')}
        </h2>
      </header>
      <div className='px-5 pb-5'>
        <div className='h-64 sm:h-80'>
          {themeReady && (
            <VChart
              key={`finance-${resolvedTheme}-${language}`}
              spec={{
                ...spec,
                theme: resolvedTheme === 'dark' ? 'dark' : 'light',
                background: 'transparent',
              }}
              option={VCHART_OPTION}
            />
          )}
        </div>
      </div>
    </section>
  )
}
