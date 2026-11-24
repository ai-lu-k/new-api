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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { MultiSelect } from '@/components/multi-select'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { useBenchmark } from '../hooks/use-benchmark'
import {
  benchmarkDimensionsForModality,
  benchmarkModelModality,
  benchmarkScore,
  defaultBenchmarkDimension,
} from '../lib/benchmark'
import {
  BenchmarkComparisonChart,
  type ComparisonRow,
} from './benchmark-comparison-chart'
import {
  BenchmarkAttribution,
  BenchmarkDimensionSelect,
} from './benchmark-controls'

const REFERENCE_MODEL = 'deepseek-v4.1-flash'

/** Comparison uses published scores and explicit model identities only. */
export function ModelBenchmark(props: { modelName: string }) {
  const { t, i18n } = useTranslation()
  const query = useBenchmark()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const subject = query.models.get(props.modelName)
  const modality = benchmarkModelModality(subject)
  const dimensions = useMemo(
    () =>
      benchmarkDimensionsForModality(query.data?.dimensions ?? [], modality),
    [query.data, modality]
  )
  const [chosenDimension, setChosenDimension] = useState<string>()
  // Opening another model of the other kind falls back to its own ladder.
  const dimension =
    chosenDimension && dimensions.some((item) => item.id === chosenDimension)
      ? chosenDimension
      : defaultBenchmarkDimension(modality)
  const [compared, setCompared] = useState<string[]>([])
  const options = useMemo(
    () =>
      (query.data?.models ?? [])
        .filter(
          (model) =>
            model.id !== subject?.id &&
            model.id !== REFERENCE_MODEL &&
            benchmarkModelModality(model) === modality &&
            model.tiers.some((tier) => Object.keys(tier.scores).length > 0)
        )
        .map((model) => ({ value: model.id, label: model.id })),
    [query.data, subject, modality]
  )
  const selected = compared.filter((name) =>
    options.some((option) => option.value === name)
  )
  // The DeepSeek reference is a text model, so the image ladder has none.
  const reference =
    modality === 'text'
      ? query.data?.models.find((model) => model.id === REFERENCE_MODEL)
      : undefined
  const models = [
    { name: props.modelName, model: subject },
    ...selected.map((name) => ({
      name,
      model: query.data?.models.find((model) => model.id === name),
    })),
  ]
  const rows = models.flatMap<ComparisonRow>((row) => {
    if (row.model?.id === REFERENCE_MODEL) return []
    const scoredTiers =
      row.model?.tiers.filter((tier) => tier.scores[dimension]) ?? []
    if (scoredTiers.length === 0) {
      return [
        {
          key: row.name,
          name: row.name,
          tier: undefined,
          score: undefined,
          reference: false,
        },
      ]
    }
    return scoredTiers.map((tier) => ({
      key: `${row.name}:${tier.id}`,
      name: row.name,
      tier: tier.id,
      score: tier.scores[dimension],
      reference: false,
    }))
  })
  if (reference) {
    rows.push({
      key: `${REFERENCE_MODEL}:max`,
      name: REFERENCE_MODEL,
      tier: 'max',
      score: benchmarkScore(reference, dimension, 'max'),
      reference: true,
    })
  }
  // Bars read highest score first; unscored rows sink to the bottom. Array#sort
  // is stable (ES2019), so equal scores keep the model/tier order above.
  rows.sort((left, right) => {
    const low = left.score?.rating
    const high = right.score?.rating
    if (low === undefined) return high === undefined ? 0 : 1
    if (high === undefined) return -1
    return high - low
  })
  const visibleModelCount =
    models.filter((row) => row.model?.id !== REFERENCE_MODEL).length +
    (reference ? 1 : 0)
  const published = dimensions.find((item) => item.id === dimension)

  if (query.isPending) return <Skeleton className='h-40 w-full' />
  if (query.isError && !query.data) {
    return (
      <ErrorState
        title={t('Benchmark scores unavailable')}
        onRetry={() => void query.refetch()}
        className='min-h-24'
      />
    )
  }

  return (
    <section
      className='bg-card/60 min-w-0 space-y-2 rounded-xl border p-3'
      aria-label={t('Benchmark scores')}
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h2 className='text-sm font-semibold'>{t('Benchmark scores')}</h2>
        <div className='ml-auto flex flex-wrap items-center justify-end gap-3'>
          <BenchmarkDimensionSelect
            dimensions={dimensions}
            value={dimension}
            onChange={setChosenDimension}
          />
          <MultiSelect
            variant='dropdown'
            triggerLabel={t('Add comparison models')}
            options={options}
            selected={selected}
            onChange={setCompared}
            placeholder={t('Search Benchmark models...')}
            renderSelectedSummary={() =>
              t('{{selected}} / {{total}} models', {
                selected: formatNumber(visibleModelCount, locale),
                total: formatNumber(
                  options.length +
                    (reference && subject?.id !== REFERENCE_MODEL ? 2 : 1),
                  locale
                ),
              })
            }
            popupFooter={
              <div className='grid grid-cols-2 gap-1'>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => setCompared([])}
                >
                  {t('Clear')}
                </Button>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() =>
                    setCompared(options.map((option) => option.value))
                  }
                >
                  {t('Select all')}
                </Button>
                <Button
                  size='sm'
                  variant='ghost'
                  className='col-span-2'
                  onClick={() => {
                    setCompared([])
                    setChosenDimension(undefined)
                  }}
                >
                  {t('Reset')}
                </Button>
              </div>
            }
          />
        </div>
      </div>
      {modality === 'text' && (
        <p className='text-muted-foreground text-xs'>
          {t(
            'All published thinking levels are shown; DeepSeek V4.1 Flash (max) is the reference.'
          )}
        </p>
      )}
      <BenchmarkComparisonChart rows={rows} modality={modality} />
      {!subject && (
        <p className='text-muted-foreground text-sm'>
          {t('No exact highest-tier Benchmark score')}
        </p>
      )}
      <BenchmarkAttribution
        modality={modality}
        snapshot={query.data}
        stale={query.data?.stale}
        date={published?.date}
      />
    </section>
  )
}
