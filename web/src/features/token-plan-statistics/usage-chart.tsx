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
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'

import type { PlanUsageDay } from './api'

export function PlanUsageChart(props: { days: PlanUsageDay[] }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  return (
    <ChartContainer
      className='h-72 w-full'
      config={{
        free_used: { label: t('Free plan usage'), color: 'var(--chart-1)' },
        wallet_used: {
          label: t('Balance continuation'),
          color: 'var(--chart-2)',
        },
      }}
    >
      <BarChart accessibilityLayer data={props.days}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey='date'
          tickFormatter={(date: string) => date.slice(5)}
          minTickGap={32}
        />
        <YAxis
          width={85}
          tickFormatter={(value: number) =>
            formatQuotaWithCurrency(value, { locale, abbreviate: true })
          }
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <span>
                  {name === 'free_used'
                    ? t('Free plan usage')
                    : t('Balance continuation')}
                  : {formatQuotaWithCurrency(Number(value), { locale })}
                </span>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey='free_used'
          fill='var(--color-free_used)'
          radius={[3, 3, 0, 0]}
        />
        <Bar
          dataKey='wallet_used'
          fill='var(--color-wallet_used)'
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  )
}
