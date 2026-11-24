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
import { X } from 'lucide-react'
import { memo, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { ENDPOINT_TYPES, FILTER_ALL, getEndpointTypeLabels } from '../constants'
import {
  AGE_STOPS,
  CONTEXT_STOPS,
  EMPTY_MODEL_FILTERS,
  INPUT_MODALITIES,
  NO_PRICE_RANGE,
  SUPPORTED_PARAMETERS,
  activeChoices,
  priceStops,
  type ModelFilterGroup,
  type ModelFilters,
  type PriceRange,
} from '../lib/model-filters'
import { MODEL_TYPE_LABELS, type ModelType } from '../lib/model-types'
import { formatPricingAmount } from '../lib/price'
import type { PricingModel, PricingVendor } from '../types'

export interface PricingSidebarProps {
  models: PricingModel[]
  vendors: PricingVendor[]
  groups: string[]
  filters: ModelFilters
  onFiltersChange: (changes: Partial<ModelFilters>) => void
  hasActiveFilters: boolean
  onClearFilters: () => void
  className?: string
  inSheet?: boolean
}

type Choice = { value: string; label: string }

function FilterGroup(props: {
  group: ModelFilterGroup
  title: string
  summary: string
  children: ReactNode
}) {
  return (
    <AccordionItem value={props.group} className='border-b'>
      <AccordionTrigger
        aria-label={`${props.title} ${props.summary}`}
        className='min-h-10 items-center gap-1.5 rounded-none py-2 hover:no-underline'
      >
        <span className='min-w-0 flex-1 break-words'>{props.title}</span>
        <span
          title={props.summary}
          className='text-muted-foreground max-w-[43%] truncate text-xs font-normal group-aria-expanded/accordion-trigger:hidden'
        >
          {props.summary}
        </span>
      </AccordionTrigger>
      <AccordionContent className='h-auto pt-1 pb-3'>
        {props.children}
      </AccordionContent>
    </AccordionItem>
  )
}

function CheckList(props: {
  choices: Choice[]
  chosen: string[]
  onChange: (chosen: string[]) => void
  className?: string
}) {
  return (
    <ul className={cn('grid gap-x-2 gap-y-1', props.className)}>
      {props.choices.map((choice) => (
        <li key={choice.value} className='min-w-0'>
          <label className='flex min-h-8 min-w-0 cursor-pointer items-center gap-2 text-sm'>
            <Checkbox
              className='shrink-0 rounded-none'
              checked={props.chosen.includes(choice.value)}
              onCheckedChange={(next) =>
                props.onChange(
                  next
                    ? [...props.chosen, choice.value]
                    : props.chosen.filter((value) => value !== choice.value)
                )
              }
            />
            <span title={choice.label} className='min-w-0 break-words'>
              {choice.label}
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}

const VENDOR_PREVIEW_COUNT = 3

function VendorChoices(props: {
  choices: Choice[]
  chosen: string[]
  onChange: (chosen: string[]) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const search = query.trim().toLowerCase()
  let visibleChoices = props.choices
  if (search) {
    visibleChoices = props.choices.filter((choice) =>
      choice.label.toLowerCase().includes(search)
    )
  } else if (!expanded) {
    visibleChoices = props.choices.slice(0, VENDOR_PREVIEW_COUNT)
  }

  return (
    <div className='space-y-2'>
      <Input
        type='search'
        aria-label={t('Search vendors')}
        placeholder={t('Search vendors')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className='w-full rounded-none'
      />
      <div
        id={listId}
        className='hover-scrollbar max-h-56 overflow-y-auto px-1'
      >
        {visibleChoices.length ? (
          <CheckList
            choices={visibleChoices}
            chosen={props.chosen}
            onChange={props.onChange}
          />
        ) : (
          <p role='status' className='text-muted-foreground py-2 text-xs'>
            {t('No vendors found')}
          </p>
        )}
      </div>
      {!search && props.choices.length > VENDOR_PREVIEW_COUNT && (
        <Button
          type='button'
          variant='link'
          size='sm'
          className='h-7 px-0'
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? t('Collapse') : t('View all')}
        </Button>
      )}
    </div>
  )
}

function FilterSection(props: {
  title: string
  count: number
  children: ReactNode
}) {
  const { i18n } = useTranslation()
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className='border-foreground/60 space-y-1 border-t pt-3'
    >
      <h3
        id={titleId}
        className='text-muted-foreground flex items-center gap-2 text-xs font-semibold'
      >
        {props.title}{' '}
        {props.count > 0 && (
          <span className='text-foreground tabular-nums'>
            {formatNumber(
              props.count,
              toIntlLocale(i18n.resolvedLanguage || i18n.language)
            )}
          </span>
        )}
      </h3>
      {props.children}
    </section>
  )
}

/** A slider over a list of stops, with what is chosen and the ends named. */
function StopSlider(props: {
  label: string
  /** Positions of the thumbs on the list of stops. */
  positions: number[]
  stops: number
  summary: string
  ticks: string[]
  onChange: (positions: number[]) => void
}) {
  return (
    <div className='flex flex-col gap-2'>
      <div className='text-muted-foreground text-xs'>{props.summary}</div>
      <Slider
        aria-label={props.label}
        min={0}
        max={props.stops - 1}
        step={1}
        value={props.positions}
        onValueChange={(value) =>
          props.onChange(Array.isArray(value) ? [...value] : [value])
        }
      />
      <div className='text-muted-foreground/80 flex justify-between text-[11px]'>
        {props.ticks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
    </div>
  )
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${count / 1_000_000}M`
  return `${count / 1_000}K`
}

function priceRangeSummary(range: PriceRange, any: string): string {
  const { min, max } = range
  if (min === null) return max === null ? any : `≤ ${formatPricingAmount(max)}`
  if (max === null) return `≥ ${formatPricingAmount(min)}`
  return min === max
    ? formatPricingAmount(min)
    : `${formatPricingAmount(min)} – ${formatPricingAmount(max)}`
}

/** A price range as positions on the stops, and back. */
function rangePositions(range: PriceRange, stops: number[]): [number, number] {
  const last = stops.length - 1
  const { min, max } = range
  let low = 0
  if (min !== null) {
    low = stops.findIndex((stop) => stop >= min)
    if (low < 0) low = last
  }
  let high = last
  if (max !== null) {
    high = 0
    stops.forEach((stop, index) => {
      if (stop <= max) high = index
    })
  }
  return [low, high]
}

function positionsRange(positions: number[], stops: number[]): PriceRange {
  const last = stops.length - 1
  const low = Math.min(...positions)
  const high = Math.max(...positions)
  if (low <= 0 && high >= last) return NO_PRICE_RANGE
  return {
    min: low <= 0 ? null : stops[low],
    max: high >= last ? null : stops[high],
  }
}

function PriceSlider(props: {
  label: string
  summary: string
  stops: number[]
  range: PriceRange
  onChange: (range: PriceRange) => void
}) {
  const positions = rangePositions(props.range, props.stops)
  const last = props.stops.length - 1
  return (
    <StopSlider
      label={props.label}
      positions={positions}
      stops={props.stops.length}
      summary={props.summary}
      ticks={[
        formatPricingAmount(props.stops[0]),
        formatPricingAmount(props.stops[last]),
      ]}
      onChange={(next) => props.onChange(positionsRange(next, props.stops))}
    />
  )
}

export const PricingSidebar = memo(function PricingSidebar(
  props: PricingSidebarProps
) {
  const { t } = useTranslation()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const { models, filters } = props
  const selectedGroup = filters.group === FILTER_ALL ? undefined : filters.group

  const facts = useMemo(() => {
    const series = new Set<string>()
    const authors = new Set<string>()
    const endpoints = new Set<string>()
    const modalities = new Set<string>()
    let discounted = false
    let context = false
    const parameters = new Set<string>()
    let released = false
    for (const model of models) {
      if (model.series) series.add(model.series)
      if (model.vendor_name) authors.add(model.vendor_name)
      for (const endpoint of model.supported_endpoint_types ?? []) {
        endpoints.add(endpoint)
      }
      for (const value of model.input_modalities ?? []) modalities.add(value)
      discounted ||= (model.price_multiplier ?? 1) < 1
      context ||= (model.context_length ?? 0) > 0
      for (const value of model.supported_parameters ?? []) {
        parameters.add(value)
      }
      released ||= Boolean(model.release_date)
    }
    return {
      series: [...series].sort((a, b) => a.localeCompare(b)),
      authors,
      endpoints,
      modalities,
      discounted,
      context,
      parameters,
      released,
    }
  }, [models])

  const promptStops = useMemo(
    () => priceStops(models, 'input', selectedGroup),
    [models, selectedGroup]
  )
  const outputStops = useMemo(
    () => priceStops(models, 'output', selectedGroup),
    [models, selectedGroup]
  )

  const modalityLabels: Record<string, string> = {
    text: t('Text'),
    image: t('Image'),
    file: t('File'),
    audio: t('Audio'),
    video: t('Video'),
  }
  const parameterLabels: Record<string, string> = {
    tools: t('Tool calling'),
    reasoning: t('Reasoning'),
    structured_outputs: t('Structured outputs'),
    response_format: t('JSON mode'),
  }
  const endpointLabels: Record<string, string> = getEndpointTypeLabels(t)

  const authorChoices = [
    ...new Set([
      ...props.vendors
        .map((vendor) => vendor.name)
        .filter((name) => facts.authors.has(name)),
      ...facts.authors,
    ]),
  ].map((name) => ({
    value: name,
    label: name,
  }))
  const endpointChoices = Object.entries(endpointLabels)
    .filter(
      ([value]) => value !== ENDPOINT_TYPES.ALL && facts.endpoints.has(value)
    )
    .map(([value, label]) => ({ value, label }))
  const modalityChoices = INPUT_MODALITIES.filter((value) =>
    facts.modalities.has(value)
  ).map((value) => ({ value, label: modalityLabels[value] }))
  const parameterChoices = SUPPORTED_PARAMETERS.filter((value) =>
    facts.parameters.has(value)
  ).map((value) => ({ value, label: parameterLabels[value] }))

  let contextPosition = 0
  CONTEXT_STOPS.forEach((stop, index) => {
    if (stop <= filters.minContext) contextPosition = index
  })
  const anyAge = AGE_STOPS.length - 1
  const agePosition =
    filters.maxAgeMonths > 0
      ? Math.max(
          AGE_STOPS.findIndex(
            (stop) => stop > 0 && stop >= filters.maxAgeMonths
          ),
          0
        )
      : anyAge

  const any = t('Any')
  const contextSummary = filters.minContext
    ? t('{{size}} or more', { size: formatTokens(filters.minContext) })
    : any
  const ageSummary = filters.maxAgeMonths
    ? t('Released within {{months}} mo', { months: filters.maxAgeMonths })
    : any
  const inputPriceLabel = t('Input price')
  const outputPriceLabel = t('Output price')
  const inputPriceSummary = priceRangeSummary(filters.promptPrice, any)
  const outputPriceSummary = priceRangeSummary(filters.outputPrice, any)
  const discountLabel = t('Has a discount')

  const choiceFilters = [
    ['inputModalities', modalityLabels],
    ['parameters', parameterLabels],
    ['authors', undefined],
    ['series', undefined],
    ['endpointTypes', endpointLabels],
  ] as const
  const selectedFilters = choiceFilters.flatMap(
    ([key, labels]): {
      key: string
      label: string
      changes: Partial<ModelFilters>
    }[] =>
      filters[key].map((value) => ({
        key: `${key}:${value}`,
        label: labels?.[value] ?? value,
        changes: { [key]: filters[key].filter((choice) => choice !== value) },
      }))
  )
  const scalarFilters = [
    ['discounted', discountLabel],
    ['minContext', contextSummary],
    ['promptPrice', `${inputPriceLabel} ${inputPriceSummary}`],
    ['outputPrice', `${outputPriceLabel} ${outputPriceSummary}`],
    ['maxAgeMonths', ageSummary],
    ['group', filters.group],
    [
      'modelType',
      t(MODEL_TYPE_LABELS[filters.modelType as ModelType] ?? filters.modelType),
    ],
  ] as const
  for (const [key, label] of scalarFilters) {
    if (
      activeChoices(filters, key) &&
      (key !== 'group' || props.groups.length > 1)
    ) {
      selectedFilters.push({
        key,
        label,
        changes: { [key]: EMPTY_MODEL_FILTERS[key] },
      })
    }
  }

  const capabilityCount = (
    ['inputModalities', 'parameters', 'minContext'] as const
  ).filter((key) => activeChoices(filters, key)).length
  const priceCount = (
    ['promptPrice', 'outputPrice', 'discounted'] as const
  ).filter((key) => activeChoices(filters, key)).length
  const sourceCount = (
    ['authors', 'series', 'endpointTypes', 'maxAgeMonths', 'group'] as const
  ).filter((key) => activeChoices(filters, key)).length

  return (
    <aside
      className={cn(
        'space-y-3 text-sm [--primary:var(--foreground)] [--primary-foreground:var(--background)]',
        props.className
      )}
    >
      <div className='bg-background sticky top-0 z-10 space-y-2'>
        <div className='flex items-center justify-between gap-2'>
          <h2
            ref={titleRef}
            tabIndex={-1}
            className={cn('text-base font-bold', props.inSheet && 'sr-only')}
          >
            {t('Filter')}
          </h2>
          {!props.inSheet && (
            <div className='ml-auto flex items-center gap-1'>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => {
                  titleRef.current?.focus({ preventScroll: true })
                  props.onClearFilters()
                }}
                disabled={!props.hasActiveFilters}
                className='h-7 px-1 text-xs'
              >
                {props.hasActiveFilters ? t('Clear all') : t('Reset')}
              </Button>
            </div>
          )}
        </div>
        {selectedFilters.length > 0 && (
          <ul className='hover-scrollbar max-h-32 space-y-1.5 overflow-y-auto p-1'>
            {selectedFilters.map((filter) => (
              <li key={filter.key}>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='h-8 w-full justify-between rounded-none px-2 text-xs'
                  aria-label={t('Remove {{name}}', { name: filter.label })}
                  title={filter.label}
                  onClick={(event) => {
                    const item = event.currentTarget.closest('li')
                    const next =
                      item?.nextElementSibling ?? item?.previousElementSibling
                    const target =
                      next?.querySelector('button') ?? titleRef.current
                    target?.focus({ preventScroll: true })
                    props.onFiltersChange(filter.changes)
                  }}
                >
                  <span className='min-w-0 truncate'>{filter.label}</span>
                  <X className='size-3.5 shrink-0' aria-hidden='true' />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Accordion
        multiple
        defaultValue={['inputModalities', 'authors']}
        className='gap-4 [&_[data-slot=accordion-content]]:motion-reduce:animate-none'
      >
        {(modalityChoices.length > 0 ||
          parameterChoices.length > 0 ||
          facts.context) && (
          <FilterSection title={t('Capabilities')} count={capabilityCount}>
            {modalityChoices.length > 0 && (
              <FilterGroup
                group='inputModalities'
                title={t('Input modalities')}
                summary={
                  filters.inputModalities
                    .map((value) => modalityLabels[value] ?? value)
                    .join(', ') || any
                }
              >
                <CheckList
                  className='grid-cols-2'
                  choices={modalityChoices}
                  chosen={filters.inputModalities}
                  onChange={(inputModalities) =>
                    props.onFiltersChange({ inputModalities })
                  }
                />
              </FilterGroup>
            )}
            {parameterChoices.length > 0 && (
              <FilterGroup
                group='parameters'
                title={t('Supported parameters')}
                summary={
                  filters.parameters
                    .map((value) => parameterLabels[value] ?? value)
                    .join(', ') || any
                }
              >
                <CheckList
                  choices={parameterChoices}
                  chosen={filters.parameters}
                  onChange={(parameters) =>
                    props.onFiltersChange({ parameters })
                  }
                />
              </FilterGroup>
            )}
            {facts.context && (
              <FilterGroup
                group='minContext'
                title={t('Context length')}
                summary={contextSummary}
              >
                <StopSlider
                  label={t('Context length')}
                  positions={[contextPosition]}
                  stops={CONTEXT_STOPS.length}
                  summary={contextSummary}
                  ticks={['4K', '64K', '1M']}
                  onChange={([position]) =>
                    props.onFiltersChange({
                      minContext: CONTEXT_STOPS[position],
                    })
                  }
                />
              </FilterGroup>
            )}
          </FilterSection>
        )}

        {(promptStops.length > 1 ||
          outputStops.length > 1 ||
          facts.discounted) && (
          <FilterSection title={t('Pricing')} count={priceCount}>
            {promptStops.length > 1 && (
              <FilterGroup
                group='promptPrice'
                title={inputPriceLabel}
                summary={inputPriceSummary}
              >
                <PriceSlider
                  label={inputPriceLabel}
                  summary={inputPriceSummary}
                  stops={promptStops}
                  range={filters.promptPrice}
                  onChange={(promptPrice) =>
                    props.onFiltersChange({ promptPrice })
                  }
                />
              </FilterGroup>
            )}
            {outputStops.length > 1 && (
              <FilterGroup
                group='outputPrice'
                title={outputPriceLabel}
                summary={outputPriceSummary}
              >
                <PriceSlider
                  label={outputPriceLabel}
                  summary={outputPriceSummary}
                  stops={outputStops}
                  range={filters.outputPrice}
                  onChange={(outputPrice) =>
                    props.onFiltersChange({ outputPrice })
                  }
                />
              </FilterGroup>
            )}
            {facts.discounted && (
              <label className='flex min-h-9 cursor-pointer items-center gap-2'>
                <Checkbox
                  className='shrink-0 rounded-none'
                  checked={filters.discounted}
                  onCheckedChange={(discounted) =>
                    props.onFiltersChange({ discounted })
                  }
                />
                {discountLabel}
              </label>
            )}
          </FilterSection>
        )}

        {(authorChoices.length > 0 ||
          facts.series.length > 0 ||
          endpointChoices.length > 0 ||
          facts.released ||
          props.groups.length > 1) && (
          <FilterSection title={t('Source')} count={sourceCount}>
            {authorChoices.length > 0 && (
              <FilterGroup
                group='authors'
                title={t('Model authors')}
                summary={filters.authors.join(', ') || any}
              >
                <VendorChoices
                  choices={authorChoices}
                  chosen={filters.authors}
                  onChange={(authors) => props.onFiltersChange({ authors })}
                />
              </FilterGroup>
            )}
            {facts.series.length > 0 && (
              <FilterGroup
                group='series'
                title={t('Series')}
                summary={filters.series.join(', ') || any}
              >
                <CheckList
                  choices={facts.series.map((value) => ({
                    value,
                    label: value,
                  }))}
                  chosen={filters.series}
                  onChange={(series) => props.onFiltersChange({ series })}
                />
              </FilterGroup>
            )}
            {endpointChoices.length > 0 && (
              <FilterGroup
                group='endpointTypes'
                title={t('Endpoint Type')}
                summary={
                  filters.endpointTypes
                    .map((value) => endpointLabels[value] ?? value)
                    .join(', ') || any
                }
              >
                <CheckList
                  choices={endpointChoices}
                  chosen={filters.endpointTypes}
                  onChange={(endpointTypes) =>
                    props.onFiltersChange({ endpointTypes })
                  }
                />
              </FilterGroup>
            )}
            {facts.released && (
              <FilterGroup
                group='maxAgeMonths'
                title={t('Model age')}
                summary={ageSummary}
              >
                <StopSlider
                  label={t('Model age')}
                  positions={[agePosition]}
                  stops={AGE_STOPS.length}
                  summary={ageSummary}
                  ticks={[t('New'), t('12+ mo')]}
                  onChange={([position]) =>
                    props.onFiltersChange({ maxAgeMonths: AGE_STOPS[position] })
                  }
                />
              </FilterGroup>
            )}
            {props.groups.length > 1 && (
              <FilterGroup
                group='group'
                title={t('Groups')}
                summary={selectedGroup ?? any}
              >
                <CheckList
                  choices={props.groups.map((value) => ({
                    value,
                    label: value,
                  }))}
                  chosen={selectedGroup ? [selectedGroup] : []}
                  onChange={(chosen) =>
                    props.onFiltersChange({
                      group: chosen.at(-1) ?? FILTER_ALL,
                    })
                  }
                />
              </FilterGroup>
            )}
          </FilterSection>
        )}
      </Accordion>
    </aside>
  )
})
