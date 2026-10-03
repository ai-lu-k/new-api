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
import { FILTER_ALL } from '../constants'
import type { PricingModel } from '../types'
import { filterBySearch } from './filters'
import { pricePartValue, type PricePart } from './model-sort'

// ----------------------------------------------------------------------------
// The model list's filters, after OpenRouter's
// ----------------------------------------------------------------------------

/** Kinds of input, in the order they are listed. */
export const INPUT_MODALITIES = [
  'text',
  'image',
  'file',
  'audio',
  'video',
] as const

/** Request features a model may support, in the order they are listed. */
export const SUPPORTED_PARAMETERS = [
  'tools',
  'reasoning',
  'structured_outputs',
  'response_format',
] as const

/**
 * Stops of the context length slider. The first is "any"; the others are the
 * smallest context a model must have.
 */
export const CONTEXT_STOPS = [
  0, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 200_000, 256_000, 400_000,
  512_000, 1_000_000,
] as const

/**
 * Stops of the model age slider, in months since release. The last is "any".
 */
export const AGE_STOPS = [1, 3, 6, 12, 0] as const

/** A price range as positions on a list of price stops; null is unbounded. */
export type PriceRange = { min: number | null; max: number | null }

export type ModelFilters = {
  search: string
  /** One group, on a site that sells in several; FILTER_ALL otherwise. */
  group: string
  /** The model accepts every one of these. */
  inputModalities: string[]
  /** Sold below the price of the model it is a tier of. */
  discounted: boolean
  /** Smallest context length, 0 for any. */
  minContext: number
  promptPrice: PriceRange
  outputPrice: PriceRange
  /** The model belongs to one of these. */
  series: string[]
  /** The model supports every one of these. */
  parameters: string[]
  /** Released at most this many months ago, 0 for any. */
  maxAgeMonths: number
  /** The model is by one of these. */
  authors: string[]
  /** The model can be called through one of these. */
  endpointTypes: string[]
}

export const NO_PRICE_RANGE: PriceRange = { min: null, max: null }

export const EMPTY_MODEL_FILTERS: ModelFilters = {
  search: '',
  group: FILTER_ALL,
  inputModalities: [],
  discounted: false,
  minContext: 0,
  promptPrice: NO_PRICE_RANGE,
  outputPrice: NO_PRICE_RANGE,
  series: [],
  parameters: [],
  maxAgeMonths: 0,
  authors: [],
  endpointTypes: [],
}

/** The filter groups, by the field of ModelFilters each one sets. */
export type ModelFilterGroup = Exclude<keyof ModelFilters, 'search'>

function priceRangeSet(range: PriceRange): boolean {
  return range.min !== null || range.max !== null
}

/** How many choices are made in one filter group. */
export function activeChoices(
  filters: ModelFilters,
  group: ModelFilterGroup
): number {
  switch (group) {
    case 'group':
      return filters.group === FILTER_ALL ? 0 : 1
    case 'discounted':
      return filters.discounted ? 1 : 0
    case 'minContext':
      return filters.minContext > 0 ? 1 : 0
    case 'maxAgeMonths':
      return filters.maxAgeMonths > 0 ? 1 : 0
    case 'promptPrice':
    case 'outputPrice':
      return priceRangeSet(filters[group]) ? 1 : 0
    default:
      return filters[group].length
  }
}

const FILTER_GROUPS: ModelFilterGroup[] = [
  'group',
  'inputModalities',
  'discounted',
  'minContext',
  'promptPrice',
  'outputPrice',
  'series',
  'parameters',
  'maxAgeMonths',
  'authors',
  'endpointTypes',
]

/** How many filter groups narrow the list. */
export function countActiveFilters(filters: ModelFilters): number {
  return FILTER_GROUPS.filter((group) => activeChoices(filters, group) > 0)
    .length
}

/** Whole months from a release date ("2026-09") to now; null if unknown. */
export function monthsSinceRelease(
  releaseDate: string | undefined,
  now: Date
): number | null {
  const match = /^(\d{4})-(\d{2})/.exec(releaseDate ?? '')
  if (!match) return null
  const months =
    (now.getFullYear() - Number(match[1])) * 12 +
    (now.getMonth() + 1 - Number(match[2]))
  return Math.max(months, 0)
}

/**
 * The prices a price slider can stop at: every price the column shows for
 * these models, lowest first. Stops come from the list itself, so they are in
 * whatever currency the site shows and need no scale of their own.
 */
export function priceStops(
  models: PricingModel[],
  part: PricePart,
  selectedGroup?: string,
  now: Date = new Date()
): number[] {
  const values = new Set<number>()
  for (const model of models) {
    const value = pricePartValue(model, part, selectedGroup, now)
    if (value !== undefined) values.add(value)
  }
  return [...values].sort((a, b) => a - b)
}

function withinPriceRange(
  value: number | undefined,
  range: PriceRange
): boolean {
  if (!priceRangeSet(range)) return true
  if (value === undefined) return false
  if (range.min !== null && value < range.min) return false
  if (range.max !== null && value > range.max) return false
  return true
}

function includesAll(
  has: readonly string[] | undefined,
  wanted: string[]
): boolean {
  if (wanted.length === 0) return true
  if (!has) return false
  return wanted.every((item) => has.includes(item))
}

/**
 * The models that pass every filter. A model that does not say (no context
 * length, no release date, ...) fails a filter on that fact.
 */
export function filterModels(
  models: PricingModel[],
  filters: ModelFilters,
  now: Date = new Date()
): PricingModel[] {
  const selectedGroup = filters.group === FILTER_ALL ? undefined : filters.group
  return filterBySearch(models, filters.search).filter((model) => {
    if (selectedGroup && !model.enable_groups?.includes(selectedGroup)) {
      return false
    }
    if (!includesAll(model.input_modalities, filters.inputModalities)) {
      return false
    }
    if (filters.discounted && !((model.price_multiplier ?? 1) < 1)) {
      return false
    }
    if (
      filters.minContext > 0 &&
      (model.context_length ?? 0) < filters.minContext
    ) {
      return false
    }
    if (
      priceRangeSet(filters.promptPrice) &&
      !withinPriceRange(
        pricePartValue(model, 'input', selectedGroup, now),
        filters.promptPrice
      )
    ) {
      return false
    }
    if (
      priceRangeSet(filters.outputPrice) &&
      !withinPriceRange(
        pricePartValue(model, 'output', selectedGroup, now),
        filters.outputPrice
      )
    ) {
      return false
    }
    if (
      filters.series.length > 0 &&
      !filters.series.includes(model.series ?? '')
    ) {
      return false
    }
    if (!includesAll(model.supported_parameters, filters.parameters)) {
      return false
    }
    if (filters.maxAgeMonths > 0) {
      const age = monthsSinceRelease(model.release_date, now)
      if (age === null || age > filters.maxAgeMonths) return false
    }
    if (
      filters.authors.length > 0 &&
      !filters.authors.includes(model.vendor_name ?? '')
    ) {
      return false
    }
    if (
      filters.endpointTypes.length > 0 &&
      !filters.endpointTypes.some((type) =>
        model.supported_endpoint_types?.includes(type)
      )
    ) {
      return false
    }
    return true
  })
}
