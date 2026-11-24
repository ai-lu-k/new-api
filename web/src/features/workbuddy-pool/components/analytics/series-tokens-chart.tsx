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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { VCHART_OPTION } from '@/lib/vchart'

import type { WorkBuddySeriesPoint } from '../../types'
import { formatCount, formatTokens } from './lib'

const TOKENS_COLOUR = '#5B8DEF'

type TokenSeriesChartProps = {
  series: WorkBuddySeriesPoint[]
  locale: Intl.LocalesArgument
  textColor: string
  gridColor: string
  resolvedTheme?: string
}

/** Tokens per bucket as bars: volume reads better as area than as a line. */
export function TokenSeriesChart(
  props: TokenSeriesChartProps
): React.JSX.Element {
  const { t } = useTranslation()
  const locale = props.locale
  const spec = useMemo(() => {
    const label = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    const values = props.series.map((point) => ({
      bucket: label.format(new Date(point.at * 1000)),
      tokens: point.total_tokens,
    }))
    return {
      type: 'bar' as const,
      data: [{ id: 'analytics-tokens', values }],
      xField: 'bucket',
      yField: 'tokens',
      barMaxWidth: 18,
      color: TOKENS_COLOUR,
      legends: { visible: false },
      axes: [
        {
          orient: 'bottom',
          label: {
            style: { fill: props.textColor, fontSize: 11 },
            autoHide: true,
          },
          tick: { visible: false },
        },
        {
          orient: 'left',
          min: 0,
          label: {
            formatMethod: (value: number | string) =>
              formatTokens(Number(value) || 0, locale),
            style: { fill: props.textColor, fontSize: 10 },
          },
          grid: {
            visible: true,
            style: { lineDash: [3, 3], stroke: props.gridColor },
          },
        },
      ],
      tooltip: {
        mark: {
          content: [
            {
              key: t('Total tokens'),
              value: (datum: Record<string, unknown>) =>
                formatCount(Number(datum?.tokens) || 0, locale),
            },
          ],
        },
      },
      animationAppear: { duration: 400 },
    }
  }, [props.series, props.textColor, props.gridColor, locale, t])

  return (
    <VChart
      key={`analytics-tokens-${props.resolvedTheme}-${locale}-${props.series.length}`}
      spec={{
        ...spec,
        theme: props.resolvedTheme === 'dark' ? 'dark' : 'light',
        background: 'transparent',
      }}
      option={VCHART_OPTION}
    />
  )
}
