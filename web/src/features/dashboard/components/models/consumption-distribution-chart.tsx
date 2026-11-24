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
import { VChart } from '@visactor/react-vchart'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPanel } from '@/components/section-panel'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useThemeCustomization } from '@/context/theme-customization-provider'
import { useTheme } from '@/context/theme-provider'
import {
  CONSUMPTION_DISTRIBUTION_CHART_OPTIONS,
  DEFAULT_TIME_GRANULARITY,
} from '@/features/dashboard/constants'
import { joinLabelValue, processChartData } from '@/features/dashboard/lib'
import type {
  ConsumptionDistributionChartType,
  QuotaDataItem,
} from '@/features/dashboard/types'
import { useThemeRadiusPx } from '@/lib/theme-radius'
import type { TimeGranularity } from '@/lib/time'
import { VCHART_OPTION } from '@/lib/vchart'

let themeManagerPromise: Promise<
  (typeof import('@visactor/vchart'))['ThemeManager']
> | null = null

interface ConsumptionDistributionChartProps {
  data: QuotaDataItem[]
  loading?: boolean
  timeGranularity?: TimeGranularity
  defaultChartType?: ConsumptionDistributionChartType
}

export function ConsumptionDistributionChart(
  props: ConsumptionDistributionChartProps
) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const { customization } = useThemeCustomization()
  const chartRadius = useThemeRadiusPx(
    '--radius-md',
    `${customization.preset}:${customization.radius}`
  )
  const [chartType, setChartType] = useState<ConsumptionDistributionChartType>(
    props.defaultChartType ?? 'bar'
  )
  const [themeReady, setThemeReady] = useState(false)
  const themeManagerRef = useRef<
    (typeof import('@visactor/vchart'))['ThemeManager'] | null
  >(null)
  const timeGranularity = props.timeGranularity ?? DEFAULT_TIME_GRANULARITY

  useEffect(() => {
    if (props.defaultChartType) setChartType(props.defaultChartType)
  }, [props.defaultChartType])

  useEffect(() => {
    const updateTheme = async () => {
      setThemeReady(false)

      if (!themeManagerPromise) {
        themeManagerPromise = import('@visactor/vchart').then(
          (m) => m.ThemeManager
        )
      }

      const ThemeManager = await themeManagerPromise
      themeManagerRef.current = ThemeManager
      ThemeManager.setCurrentTheme(resolvedTheme === 'dark' ? 'dark' : 'light')
      setThemeReady(true)
    }

    updateTheme()
  }, [resolvedTheme])

  const chartData = useMemo(
    () =>
      processChartData(
        props.loading ? [] : props.data,
        timeGranularity,
        t,
        chartRadius
      ),
    [props.data, props.loading, timeGranularity, t, chartRadius]
  )
  const spec = chartType === 'bar' ? chartData.spec_line : chartData.spec_area
  const specType = typeof spec?.type === 'string' ? spec.type : chartType
  const chartKey = [
    chartType,
    specType,
    props.loading ? 'loading' : 'ready',
    props.data.length,
    resolvedTheme,
    customization.preset,
  ].join('-')
  let status: 'ready' | 'loading' | 'empty' = 'ready'
  if (props.loading) status = 'loading'
  else if (props.data.length === 0) status = 'empty'

  return (
    <SectionPanel
      title={t('Quota Distribution')}
      description={joinLabelValue(t('Total:'), chartData.totalQuotaDisplay)}
      status={status}
      emptyMessage={t('No data available')}
      placeholderClassName='h-96'
      contentClassName='space-y-3'
    >
      <div className='flex min-w-0 justify-end overflow-x-auto'>
        <Tabs
          value={chartType}
          onValueChange={(value) =>
            setChartType(value as ConsumptionDistributionChartType)
          }
        >
          <TabsList aria-label={t('Quota Distribution')}>
            {CONSUMPTION_DISTRIBUTION_CHART_OPTIONS.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className='px-2.5 text-xs'
              >
                {t(item.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className='h-[300px] sm:h-96'>
        {themeReady && spec && (
          <VChart
            key={chartKey}
            spec={{
              ...spec,
              theme: resolvedTheme === 'dark' ? 'dark' : 'light',
              background: 'transparent',
            }}
            option={VCHART_OPTION}
          />
        )}
      </div>
    </SectionPanel>
  )
}
