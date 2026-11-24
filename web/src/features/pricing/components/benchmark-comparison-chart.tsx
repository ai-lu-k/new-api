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
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from 'recharts'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import {
  eloWindow,
  type BenchmarkModality,
  type BenchmarkScore,
} from '../lib/benchmark'

export type ComparisonRow = {
  key: string
  name: string
  tier?: string
  score?: BenchmarkScore
  reference: boolean
}

export function BenchmarkComparisonChart(props: {
  rows: ComparisonRow[]
  modality?: BenchmarkModality
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const points = props.rows.map((row) => ({
    name: `${row.name} (${row.tier ?? '—'})`,
    rating: row.score?.rating ?? null,
    fill: row.reference ? 'var(--chart-2)' : 'var(--chart-1)',
  }))
  const scoreLabel = (value: unknown) => {
    if (value == null) return '—'
    return formatNumber(Math.round(Number(value)), locale)
  }
  const ratings = props.rows
    .map((row) => row.score?.rating)
    .filter((rating): rating is number => typeof rating === 'number')
  const window =
    props.modality === 'image' && ratings.length > 0
      ? eloWindow(ratings)
      : undefined
  const chartConfig = {
    rating: { label: t('Score'), color: 'var(--chart-1)' },
  }

  const tooltip = (
    <ChartTooltip
      content={
        <ChartTooltipContent
          formatter={(value) => (
            <span className='font-mono tabular-nums'>{scoreLabel(value)}</span>
          )}
        />
      }
    />
  )
  const labelList = (
    <LabelList
      dataKey='rating'
      position='top'
      formatter={scoreLabel}
      className='fill-foreground font-mono font-semibold'
    />
  )
  const xAxis = <XAxis dataKey='name' tick={false} tickLine={false} axisLine />

  return (
    <figure aria-label={t('Benchmark comparison')} className='min-w-0'>
      <div className='overflow-x-auto pb-2'>
        <div style={{ minWidth: Math.max(320, props.rows.length * 112 + 52) }}>
          <ChartContainer
            config={chartConfig}
            className='aspect-auto h-40 w-full'
          >
            {window ? (
              <ScatterChart
                data={points}
                margin={{ top: 24, right: 12, bottom: 0, left: 0 }}
                accessibilityLayer
              >
                <CartesianGrid vertical={false} strokeDasharray='3 3' />
                {xAxis}
                <YAxis
                  type='number'
                  dataKey='rating'
                  domain={window.domain}
                  ticks={window.ticks}
                  width={44}
                  tickLine={false}
                  axisLine={false}
                />
                {tooltip}
                <Scatter dataKey='rating' isAnimationActive={false}>
                  {points.map((point) => (
                    <Cell key={point.name} fill={point.fill} />
                  ))}
                  {labelList}
                </Scatter>
              </ScatterChart>
            ) : (
              <BarChart
                data={points}
                margin={{ top: 24, right: 12, bottom: 0, left: 0 }}
                accessibilityLayer
              >
                <CartesianGrid vertical={false} strokeDasharray='3 3' />
                {xAxis}
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 50, 100]}
                  width={44}
                  tickLine={false}
                  axisLine={false}
                />
                {tooltip}
                <Bar
                  dataKey='rating'
                  maxBarSize={48}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                >
                  {labelList}
                </Bar>
              </BarChart>
            )}
          </ChartContainer>
          <figcaption
            className='grid gap-2 pr-3 pl-10'
            style={{
              gridTemplateColumns: `repeat(${props.rows.length}, minmax(0, 1fr))`,
            }}
          >
            {props.rows.map((row) => (
              <div
                key={row.key}
                className='flex min-w-0 flex-col items-center gap-0.5 text-center'
              >
                <span className='text-xs font-medium [overflow-wrap:anywhere] break-words'>
                  {row.name}
                </span>
                {row.reference && (
                  <span className='text-muted-foreground text-xs'>
                    {t('Reference model')}
                  </span>
                )}
                {!row.score && (
                  <span className='text-muted-foreground text-xs'>
                    {t('No data')}
                  </span>
                )}
                {row.tier && (
                  <span className='text-muted-foreground text-xs'>
                    {row.tier === 'default'
                      ? t('Fixed configuration')
                      : row.tier}
                  </span>
                )}
              </div>
            ))}
          </figcaption>
        </div>
      </div>
      <table className='sr-only' aria-label={t('Benchmark comparison')}>
        <thead>
          <tr>
            <th>{t('Model')}</th>
            <th>{t('Evaluation tier')}</th>
            <th>{t('Score')}</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.key}>
              <td>{row.name}</td>
              <td>{row.tier ?? '—'}</td>
              <td>{scoreLabel(row.score?.rating)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
