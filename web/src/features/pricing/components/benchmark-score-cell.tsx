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

import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { useBenchmarkColumn } from '../hooks/use-benchmark'
import { highestBenchmarkTier } from '../lib/benchmark'

export function BenchmarkScoreCell(props: { modelName: string }) {
  const { t, i18n } = useTranslation()
  const benchmark = useBenchmarkColumn()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const tier = highestBenchmarkTier(benchmark.models.get(props.modelName))
  const score = tier?.scores[benchmark.dimension]
  if (!score || !tier) {
    return (
      <div
        className='text-muted-foreground text-center'
        title={t('No exact highest-tier Benchmark score')}
      >
        —
      </div>
    )
  }
  return (
    <div
      className='text-center'
      title={[tier.source_name, benchmark.version, score.date]
        .filter(Boolean)
        .join(' · ')}
    >
      <div className='font-mono text-sm font-semibold tabular-nums'>
        {formatNumber(Math.round(score.rating), locale)}
      </div>
    </div>
  )
}
