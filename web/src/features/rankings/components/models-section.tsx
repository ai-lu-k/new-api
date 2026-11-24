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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPanel } from '@/components/section-panel'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { formatCalls, formatTokens } from '../lib/format'
import { bucketCalls, bucketTotals } from '../lib/traffic'
import type {
  ImageModelHistorySeries,
  ModelHistorySeries,
  ModelKind,
  RankingPeriod,
} from '../types'
import { TrafficPlot } from './traffic-plot'

const PERIOD_DESCRIPTIONS: Record<RankingPeriod, string> = {
  today: 'Traffic routed in each of the last 24 hours',
  week: 'Traffic routed in each of the past few weeks',
  month: 'Traffic routed on each of the past 30 days',
  year: 'Traffic routed in each of the past weeks',
}

const KIND_LABELS: Record<ModelKind, string> = {
  text: 'Text models',
  image: 'Image models',
  audio: 'Audio models',
  decision: 'Decision models',
}

const KIND_TABS: ModelKind[] = ['text', 'image', 'audio', 'decision']

const PERIODS: Array<{ id: RankingPeriod; labelKey: string }> = [
  { id: 'today', labelKey: 'Today' },
  { id: 'week', labelKey: 'Week' },
  { id: 'month', labelKey: 'Month' },
  { id: 'year', labelKey: 'Year' },
]

const EMPTY_HISTORY: ModelHistorySeries = { points: [], models: [], buckets: 0 }
const EMPTY_IMAGE_HISTORY: ImageModelHistorySeries = {
  points: [],
  models: [],
  buckets: 0,
}

type ModelsSectionProps = {
  history: ModelHistorySeries
  imageHistory?: ImageModelHistorySeries
  audioHistory?: ImageModelHistorySeries
  decisionHistory?: ModelHistorySeries
  period: RankingPeriod
  onPeriodChange: (period: RankingPeriod) => void
}

/**
 * The public traffic block: one line carrying the site's total per bucket, and
 * a family switch that narrows the same line to text, image or decision models.
 * Per-model volume is never shown; a family total is the finest the public page
 * goes.
 *
 * Text and decision models are counted in tokens and image models in calls,
 * because that is how each is billed. The two are never added together: the
 * line and its unit switch with the family.
 */
export function ModelsSection(props: ModelsSectionProps) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<ModelKind>('text')

  // Speech is billed per character or per call, never in tokens, so its
  // traffic joins the image board in calls.
  const countedByCalls = kind === 'image' || kind === 'audio'
  const callHistory =
    kind === 'audio'
      ? (props.audioHistory ?? EMPTY_IMAGE_HISTORY)
      : (props.imageHistory ?? EMPTY_IMAGE_HISTORY)
  const totals = countedByCalls
    ? bucketCalls(callHistory.points)
    : bucketTotals(tokenPoints(kind, props))
  const total = totals.points.reduce((sum, point) => sum + point.value, 0)

  return (
    <SectionPanel
      title={t('Platform traffic')}
      description={t(PERIOD_DESCRIPTIONS[props.period])}
      actions={
        <div className='text-right'>
          <div className='text-foreground text-2xl font-bold tabular-nums'>
            {countedByCalls ? formatCalls(total) : formatTokens(total)}
          </div>
          <div className='text-muted-foreground text-[11px] font-medium tracking-widest uppercase'>
            {countedByCalls ? t('calls') : t('tokens')}
          </div>
        </div>
      }
    >
      <div className='mb-3 flex min-w-0 flex-wrap items-center justify-between gap-3'>
        <Tabs
          value={kind}
          onValueChange={(value) => setKind(value as ModelKind)}
        >
          <TabsList aria-label={t('Model family')}>
            {KIND_TABS.map((tab) => (
              <TabsTrigger key={tab} value={tab} className='px-2.5 text-xs'>
                {t(KIND_LABELS[tab])}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Tabs
          value={props.period}
          onValueChange={(value) =>
            props.onPeriodChange(value as RankingPeriod)
          }
        >
          <TabsList aria-label={t('Period')}>
            {PERIODS.map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                className='px-2.5 text-xs'
              >
                {t(item.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {totals.points.length > 0 ? (
        <TrafficPlot
          points={totals.points}
          peakLabel={totals.peakLabel}
          showToday={props.period === 'week' || props.period === 'month'}
        />
      ) : (
        <div className='text-muted-foreground flex h-40 items-center justify-center text-[13px]'>
          {t('No history data available')}
        </div>
      )}
    </SectionPanel>
  )
}

/** The token series a family is counted from. */
function tokenPoints(
  kind: ModelKind,
  props: ModelsSectionProps
): ModelHistorySeries['points'] {
  if (kind === 'decision') {
    return (props.decisionHistory ?? EMPTY_HISTORY).points
  }
  return props.history.points
}
