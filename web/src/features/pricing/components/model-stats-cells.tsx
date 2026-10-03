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
} from '@/features/performance-metrics/lib/format'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber } from '@/lib/format'

import { useModelStatsContext } from '../hooks/use-model-stats'

const NUMERIC_CELL = 'text-right font-mono text-sm tabular-nums'

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
