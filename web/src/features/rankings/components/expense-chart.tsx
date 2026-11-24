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

import { SectionPanel } from '@/components/section-panel'

import { formatExpenseAmount, formatExpenseMonth } from '../lib'
import type { ExpenseMonth } from '../types'
import { ExpensePlot, type ExpenseColumn } from './expense-plot'

type ExpenseChartProps = {
  months: ExpenseMonth[]
}

/** Monthly expenses as stacked bars; the ink goes dark for the biggest item
 * and pale for the small ones, so the bill reads from the baseline up. */
export function ExpenseChart(props: ExpenseChartProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.language

  const data = useMemo(() => {
    // Oldest month on the left; the same item across months is one series.
    const ordered = [...props.months].sort((a, b) =>
      a.month.localeCompare(b.month)
    )
    const totals = new Map<string, number>()
    const columns: ExpenseColumn[] = ordered.map((month) => {
      const byName = new Map<string, number>()
      for (const item of month.items) {
        const name = item.automatic ? t('Model costs') : item.name
        byName.set(name, (byName.get(name) ?? 0) + item.amount)
        totals.set(name, (totals.get(name) ?? 0) + item.amount)
      }
      return {
        label: formatExpenseMonth(month.month, language),
        segments: [...byName].map(([name, amount]) => ({ name, amount })),
      }
    })

    const order = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)

    return { columns, order }
  }, [language, props.months, t])

  if (data.columns.length === 0) return null

  const formatValue = (value: number) =>
    formatExpenseAmount(value, language).replace(/\.00$/, '')

  return (
    <SectionPanel
      title={t('Expenses by month')}
      description={t(
        'What the site paid each month. Solid is the biggest expense, hatched the second, outlined the rest.'
      )}
    >
      <ExpensePlot
        columns={data.columns}
        order={data.order}
        label={t('Expenses by month')}
        formatValue={formatValue}
      />
    </SectionPanel>
  )
}
