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

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { useBenchmarkColumn } from '../hooks/use-benchmark'
import {
  benchmarkSource,
  type BenchmarkDimension,
  type BenchmarkModality,
  type BenchmarkSnapshot,
} from '../lib/benchmark'
import { PricingSortHeader } from './pricing-sort-header'

export function BenchmarkScoreHeader() {
  const { t } = useTranslation()
  const benchmark = useBenchmarkColumn()
  return (
    <div className='flex items-center justify-center gap-1'>
      <PricingSortHeader sortKey='benchmark' numeric iconOnly>
        {t('Score')}
      </PricingSortHeader>
      <BenchmarkDimensionSelect
        dimensions={benchmark.dimensions}
        value={benchmark.dimension}
        onChange={(value) => benchmark.onDimensionChange?.(value)}
        suffix={t('Score')}
      />
    </div>
  )
}

export function BenchmarkDimensionSelect(props: {
  suffix?: string
  dimensions: BenchmarkDimension[]
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const selected = props.dimensions.find(
    (dimension) => dimension.id === props.value
  )
  // Image dimensions come in labelled groups; a single group needs no heading.
  const groups = useMemo(() => {
    const grouped = new Map<string, BenchmarkDimension[]>()
    for (const dimension of props.dimensions) {
      const group = grouped.get(dimension.group)
      if (group) group.push(dimension)
      else grouped.set(dimension.group, [dimension])
    }
    return [...grouped]
  }, [props.dimensions])
  return (
    <Select
      value={props.value}
      onValueChange={(value) => {
        if (value) props.onChange(value)
      }}
      disabled={props.dimensions.length === 0}
    >
      <SelectTrigger
        variant='underline'
        aria-label={t('Benchmark dimension')}
        showIcon={!props.suffix}
        className={props.suffix ? 'max-w-full gap-1' : 'max-w-full'}
      >
        <SelectValue className='decoration-muted-foreground/50 underline decoration-1 underline-offset-4'>
          {selected ? t(selected.label_key) : t('Benchmark dimension')}
        </SelectValue>
        {props.suffix && <span>{props.suffix}</span>}
      </SelectTrigger>
      <SelectContent className='w-max min-w-(--anchor-width)'>
        {groups.map(([group, dimensions]) => (
          <SelectGroup key={group}>
            {groups.length > 1 && group && (
              <SelectLabel>{t(group)}</SelectLabel>
            )}
            {dimensions.map((dimension) => (
              <SelectItem key={dimension.id} value={dimension.id}>
                {t(dimension.label_key)}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

export function BenchmarkAttribution(props: {
  modality: BenchmarkModality
  snapshot?: BenchmarkSnapshot
  stale?: boolean
  date?: string
}) {
  const { t } = useTranslation()
  const source = benchmarkSource(props.snapshot, props.modality)
  const version = source?.version?.trim()
  const sourceUrl = benchmarkLink(source?.source_url)
  const licenseUrl = benchmarkLink(source?.license_url)
  const stale = props.stale && props.modality === 'text'
  if (!version && !sourceUrl && !licenseUrl && !props.date && !stale) {
    return null
  }

  return (
    <p className='text-muted-foreground flex flex-wrap gap-x-3 text-xs leading-relaxed'>
      {sourceUrl ? (
        <a
          className='underline underline-offset-2'
          href={sourceUrl}
          target='_blank'
          rel='noreferrer'
        >
          {version || t('Source')}
        </a>
      ) : (
        version && <span>{version}</span>
      )}
      {licenseUrl && (
        <a
          className='underline underline-offset-2'
          href={licenseUrl}
          target='_blank'
          rel='noreferrer'
        >
          {t('Data use')}
        </a>
      )}
      {props.date && <span>{props.date}</span>}
      {stale && <span>{t('Cached Benchmark data')}</span>}
    </p>
  )
}

function benchmarkLink(value?: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password
    ) {
      return url.href
    }
  } catch {
    // Imported metadata may contain legacy or incomplete URLs.
  }
}
