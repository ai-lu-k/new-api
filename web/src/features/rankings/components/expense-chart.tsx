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

import { useChartTheme } from '@/lib/use-chart-theme'
import { VCHART_OPTION } from '@/lib/vchart'

import { formatExpenseAmount, formatExpenseMonth } from '../lib'
import type { ExpenseMonth } from '../types'

// The brand blue first; the rest only has to stay apart from it.
const PALETTE = [
  '#8AB4F9',
  '#5B8DEF',
  '#A5B4FC',
  '#7DD3C8',
  '#F9C78A',
  '#C4B5FD',
  '#94A3B8',
  '#F4A6B7',
]

type ExpenseChartProps = {
  months: ExpenseMonth[]
}

/** Monthly expenses as stacked bars, one colour per expense item. */
export function ExpenseChart(props: ExpenseChartProps) {
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
    // Oldest month on the left; the same item across months is one series.
    const ordered = [...props.months].sort((a, b) =>
      a.month.localeCompare(b.month)
    )
    const values = ordered.flatMap((month) => {
      const byName = new Map<string, number>()
      for (const item of month.items) {
        byName.set(item.name, (byName.get(item.name) ?? 0) + item.amount)
      }
      return [...byName].map(([name, amount]) => ({
        month: formatExpenseMonth(month.month, language),
        name,
        amount,
      }))
    })
    if (values.length === 0) return null

    return {
      type: 'bar' as const,
      data: [{ id: 'expenses', values }],
      xField: 'month',
      yField: 'amount',
      seriesField: 'name',
      stack: true,
      barMaxWidth: 56,
      color: PALETTE,
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
              key: (datum: Record<string, unknown>) => String(datum?.name ?? ''),
              value: (datum: Record<string, unknown>) =>
                formatExpenseAmount(Number(datum?.amount) || 0, language),
            },
          ],
        },
        dimension: {
          content: [
            {
              key: (datum: Record<string, unknown>) => String(datum?.name ?? ''),
              value: (datum: Record<string, unknown>) =>
                formatExpenseAmount(Number(datum?.amount) || 0, language),
            },
          ],
        },
      },
      animationAppear: { duration: 500 },
    }
  }, [chartGridColor, chartTextColor, language, props.months])

  if (!spec) return null

  return (
    <section
      aria-label={t('Expenses by month')}
      className='bg-card overflow-hidden rounded-xl border'
    >
      <header className='px-5 py-4'>
        <h2 className='text-base font-semibold'>{t('Expenses by month')}</h2>
      </header>
      <div className='px-5 pb-5'>
        <div className='h-60 sm:h-72'>
          {themeReady && (
            <VChart
              key={`expenses-${resolvedTheme}-${language}`}
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
