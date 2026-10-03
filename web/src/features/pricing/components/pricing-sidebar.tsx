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
import {
  BadgePercent,
  CalendarDays,
  CircleDollarSign,
  CodeXml,
  Layers,
  Plug,
  RotateCcw,
  Ruler,
  Shapes,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { memo, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { ENDPOINT_TYPES, FILTER_ALL, getEndpointTypeLabels } from '../constants'
import {
  AGE_STOPS,
  CONTEXT_STOPS,
  INPUT_MODALITIES,
  NO_PRICE_RANGE,
  SUPPORTED_PARAMETERS,
  activeChoices,
  priceStops,
  type ModelFilterGroup,
  type ModelFilters,
  type PriceRange,
} from '../lib/model-filters'
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
}

type Choice = { value: string; label: string; icon?: ReactNode }

/** One collapsible row of the filter list: an icon, a name, what is chosen. */
function FilterGroup(props: {
  group: ModelFilterGroup
  icon: LucideIcon
  title: string
  filters: ModelFilters
  children: ReactNode
}) {
  const chosen = activeChoices(props.filters, props.group)
  const Icon = props.icon
  return (
    <AccordionItem value={props.group} className='not-last:border-b-0'>
      <AccordionTrigger className='items-center py-2.5 hover:no-underline'>
        <span className='flex min-w-0 items-center gap-2.5'>
          <Icon
            className='text-muted-foreground size-4 shrink-0'
            aria-hidden='true'
          />
          <span className='truncate'>{props.title}</span>
          {chosen > 0 && (
            <span className='bg-primary/15 text-foreground rounded-full px-1.5 text-[11px] leading-4 tabular-nums'>
              {chosen}
            </span>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent className='pt-1 pr-1 pb-3 pl-6.5'>
        {props.children}
      </AccordionContent>
    </AccordionItem>
  )
}

/** Checkboxes for a list of choices, any number of which can be ticked. */
function CheckList(props: {
  choices: Choice[]
  chosen: string[]
  onChange: (chosen: string[]) => void
}) {
  return (
    <ul className='flex flex-col gap-2'>
      {props.choices.map((choice) => (
        <li key={choice.value}>
          <label className='flex min-w-0 cursor-pointer items-center gap-2 text-sm'>
            <Checkbox
              checked={props.chosen.includes(choice.value)}
              onCheckedChange={(next) =>
                props.onChange(
                  next
                    ? [...props.chosen, choice.value]
                    : props.chosen.filter((value) => value !== choice.value)
                )
              }
            />
            {choice.icon && <span className='shrink-0'>{choice.icon}</span>}
            <span className='truncate'>{choice.label}</span>
          </label>
        </li>
      ))}
    </ul>
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

function formatPrice(value: number): string {
  return formatBillingCurrencyFromUSD(value, {
    digitsLarge: 4,
    digitsSmall: 6,
    abbreviate: false,
  })
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
  stops: number[]
  range: PriceRange
  onChange: (range: PriceRange) => void
}) {
  const { t } = useTranslation()
  const positions = rangePositions(props.range, props.stops)
  const last = props.stops.length - 1
  const unbounded = positions[0] === 0 && positions[1] === last
  return (
    <StopSlider
      label={props.label}
      positions={positions}
      stops={props.stops.length}
      summary={
        unbounded
          ? t('Any')
          : `${formatPrice(props.stops[positions[0]])} – ${formatPrice(props.stops[positions[1]])}`
      }
      ticks={[formatPrice(props.stops[0]), formatPrice(props.stops[last])]}
      onChange={(next) => props.onChange(positionsRange(next, props.stops))}
    />
  )
}

/**
 * The model list's filters, laid out as OpenRouter's are: one collapsed row
 * per filter, opening to checkboxes or a slider. A filter is offered only
 * when the models carry what it filters on.
 */
export const PricingSidebar = memo(function PricingSidebar(
  props: PricingSidebarProps
) {
  const { t } = useTranslation()
  const { models, filters } = props
  const selectedGroup = filters.group === FILTER_ALL ? undefined : filters.group

  const facts = useMemo(() => {
    const series = new Set<string>()
    const authors = new Set<string>()
    const endpoints = new Set<string>()
    let modalities = false
    let discounted = false
    let context = false
    let parameters = false
    let released = false
    for (const model of models) {
      if (model.series) series.add(model.series)
      if (model.vendor_name) authors.add(model.vendor_name)
      for (const endpoint of model.supported_endpoint_types ?? []) {
        endpoints.add(endpoint)
      }
      modalities ||= (model.input_modalities?.length ?? 0) > 0
      discounted ||= (model.price_multiplier ?? 1) < 1
      context ||= (model.context_length ?? 0) > 0
      parameters ||= (model.supported_parameters?.length ?? 0) > 0
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
  const endpointLabels = getEndpointTypeLabels(t)

  const authorChoices: Choice[] = props.vendors
    .filter((vendor) => facts.authors.has(vendor.name))
    .map((vendor) => ({
      value: vendor.name,
      label: vendor.name,
      icon: vendor.icon ? getLobeIcon(vendor.icon, 14) : undefined,
    }))
  const endpointChoices: Choice[] = Object.entries(endpointLabels)
    .filter(
      ([value]) => value !== ENDPOINT_TYPES.ALL && facts.endpoints.has(value)
    )
    .map(([value, label]) => ({ value, label }))

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

  return (
    <aside className={cn('text-sm', props.className)}>
      <div className='mb-1 flex items-center justify-between gap-2'>
        <h2 className='text-foreground text-sm font-semibold'>{t('Filter')}</h2>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={props.onClearFilters}
          disabled={!props.hasActiveFilters}
          className='h-7 gap-1.5 px-2 text-xs'
        >
          <RotateCcw className='size-3.5' />
          {t('Reset')}
        </Button>
      </div>

      <Accordion multiple>
        {props.groups.length > 1 && (
          <FilterGroup
            group='group'
            icon={Users}
            title={t('Groups')}
            filters={filters}
          >
            <CheckList
              choices={props.groups.map((group) => ({
                value: group,
                label: group,
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

        {facts.modalities && (
          <FilterGroup
            group='inputModalities'
            icon={Shapes}
            title={t('Input modalities')}
            filters={filters}
          >
            <CheckList
              choices={INPUT_MODALITIES.map((value) => ({
                value,
                label: modalityLabels[value],
              }))}
              chosen={filters.inputModalities}
              onChange={(inputModalities) =>
                props.onFiltersChange({ inputModalities })
              }
            />
          </FilterGroup>
        )}

        {facts.discounted && (
          <FilterGroup
            group='discounted'
            icon={BadgePercent}
            title={t('Discounted')}
            filters={filters}
          >
            <CheckList
              choices={[{ value: 'yes', label: t('Has a discount') }]}
              chosen={filters.discounted ? ['yes'] : []}
              onChange={(chosen) =>
                props.onFiltersChange({ discounted: chosen.length > 0 })
              }
            />
          </FilterGroup>
        )}

        {facts.context && (
          <FilterGroup
            group='minContext'
            icon={Ruler}
            title={t('Context length')}
            filters={filters}
          >
            <StopSlider
              label={t('Context length')}
              positions={[contextPosition]}
              stops={CONTEXT_STOPS.length}
              summary={
                contextPosition === 0
                  ? t('Any')
                  : t('{{size}} or more', {
                      size: formatTokens(CONTEXT_STOPS[contextPosition]),
                    })
              }
              ticks={['4K', '64K', '1M']}
              onChange={([position]) =>
                props.onFiltersChange({ minContext: CONTEXT_STOPS[position] })
              }
            />
          </FilterGroup>
        )}

        {promptStops.length > 1 && (
          <FilterGroup
            group='promptPrice'
            icon={CircleDollarSign}
            title={t('Prompt pricing')}
            filters={filters}
          >
            <PriceSlider
              label={t('Prompt pricing')}
              stops={promptStops}
              range={filters.promptPrice}
              onChange={(promptPrice) => props.onFiltersChange({ promptPrice })}
            />
          </FilterGroup>
        )}

        {outputStops.length > 1 && (
          <FilterGroup
            group='outputPrice'
            icon={CircleDollarSign}
            title={t('Output pricing')}
            filters={filters}
          >
            <PriceSlider
              label={t('Output pricing')}
              stops={outputStops}
              range={filters.outputPrice}
              onChange={(outputPrice) => props.onFiltersChange({ outputPrice })}
            />
          </FilterGroup>
        )}

        {facts.series.length > 0 && (
          <FilterGroup
            group='series'
            icon={Layers}
            title={t('Series')}
            filters={filters}
          >
            <CheckList
              choices={facts.series.map((value) => ({ value, label: value }))}
              chosen={filters.series}
              onChange={(series) => props.onFiltersChange({ series })}
            />
          </FilterGroup>
        )}

        {facts.parameters && (
          <FilterGroup
            group='parameters'
            icon={CodeXml}
            title={t('Supported parameters')}
            filters={filters}
          >
            <CheckList
              choices={SUPPORTED_PARAMETERS.map((value) => ({
                value,
                label: parameterLabels[value],
              }))}
              chosen={filters.parameters}
              onChange={(parameters) => props.onFiltersChange({ parameters })}
            />
          </FilterGroup>
        )}

        {facts.released && (
          <FilterGroup
            group='maxAgeMonths'
            icon={CalendarDays}
            title={t('Model age')}
            filters={filters}
          >
            <StopSlider
              label={t('Model age')}
              positions={[agePosition]}
              stops={AGE_STOPS.length}
              summary={
                agePosition === anyAge
                  ? t('Any')
                  : t('Released within {{months}} mo', {
                      months: AGE_STOPS[agePosition],
                    })
              }
              ticks={[t('New'), t('12+ mo')]}
              onChange={([position]) =>
                props.onFiltersChange({ maxAgeMonths: AGE_STOPS[position] })
              }
            />
          </FilterGroup>
        )}

        {authorChoices.length > 0 && (
          <FilterGroup
            group='authors'
            icon={UserRound}
            title={t('Model authors')}
            filters={filters}
          >
            <CheckList
              choices={authorChoices}
              chosen={filters.authors}
              onChange={(authors) => props.onFiltersChange({ authors })}
            />
          </FilterGroup>
        )}

        {endpointChoices.length > 0 && (
          <FilterGroup
            group='endpointTypes'
            icon={Plug}
            title={t('Endpoint Type')}
            filters={filters}
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
      </Accordion>
    </aside>
  )
})
