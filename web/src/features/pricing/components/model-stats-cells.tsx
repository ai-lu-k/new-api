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
  formatLatency,
  formatThroughput,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber } from '@/lib/format'

import { useModelStatsContext } from '../hooks/use-model-stats'
import { SuccessRateBars } from './success-rate-bars'

const NUMERIC_CELL = 'text-center font-mono text-sm tabular-nums'

function Muted(props: { children: React.ReactNode }) {
  return <span className='text-muted-foreground/60'>{props.children}</span>
}

export function WeeklyTokensCell(props: { modelName: string }) {
  const { i18n } = useTranslation()
  const tokens = useModelStatsContext().weeklyTokens.get(props.modelName)
  return (
    <div className={NUMERIC_CELL}>
      {tokens ? (
        formatCompactNumber(tokens, toIntlLocale(i18n.language))
      ) : (
        <Muted>—</Muted>
      )}
    </div>
  )
}

/**
 * Calls answered in the last week, for the kinds of work the catalogue counts
 * per call: image models and the decision models beside them.
 */
export function WeeklyCallsCell(props: { modelName: string }) {
  const { i18n } = useTranslation()
  const calls = useModelStatsContext().weeklyCalls.get(props.modelName)
  return (
    <div className={NUMERIC_CELL}>
      {calls ? (
        formatCompactNumber(calls, toIntlLocale(i18n.language))
      ) : (
        <Muted>—</Muted>
      )}
    </div>
  )
}

/**
 * Share of requests that succeeded in the last day, with the day's hours as
 * one short bar each so a short outage shows next to the average. The whole
 * percent reads first, the bars sit after it on the same line.
 */
export function SuccessRateCell(props: { modelName: string }) {
  const perf = useModelStatsContext().perf.get(props.modelName)
  if (!perf?.success_rate) {
    return (
      <div className={NUMERIC_CELL}>
        <Muted>—</Muted>
      </div>
    )
  }
  return (
    <div className={NUMERIC_CELL}>
      <span className='inline-flex items-center justify-center gap-1.5'>
        <span className={getSuccessRateTextClass(perf.success_rate)}>
          {`${Math.round(perf.success_rate)}%`}
        </span>
        <SuccessRateBars
          samples={perf}
          className='h-2 w-[71px]'
          barClassName='w-0.5'
        />
      </span>
    </div>
  )
}

export function PerfCell(props: {
  modelName: string
  field: 'latency' | 'tps'
}) {
  const perf = useModelStatsContext().perf.get(props.modelName)
  const value = props.field === 'latency' ? perf?.avg_latency_ms : perf?.avg_tps
  let text: React.ReactNode = <Muted>—</Muted>
  if (value) {
    text =
      props.field === 'latency' ? formatLatency(value) : formatThroughput(value)
  }
  return <div className={NUMERIC_CELL}>{text}</div>
}
