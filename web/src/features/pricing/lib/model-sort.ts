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
import { DEFAULT_TOKEN_UNIT } from '../constants'
import type { PricingModel } from '../types'
import {
  getDynamicPricingSummary,
  type DynamicPriceEntry,
  type DynamicPricingSummary,
} from './dynamic-price'
import { getDisplayGroupRatio, isTokenBasedModel } from './model-helpers'

// ----------------------------------------------------------------------------
// Sorting the model list by one of its columns
// ----------------------------------------------------------------------------

export type ModelSortKey =
  | 'name'
  | 'tokens'
  | 'input'
  | 'output'
  | 'latency'
  | 'throughput'

export type ModelSort = { key: ModelSortKey; descending: boolean }

export const DEFAULT_MODEL_SORT: ModelSort = { key: 'name', descending: false }

/**
 * The direction a column sorts in when it is first chosen: the end a reader
 * looks for, which is the most used, the cheapest and the fastest.
 */
const STARTS_DESCENDING: Record<ModelSortKey, boolean> = {
  name: false,
  tokens: true,
  input: false,
  output: false,
  latency: false,
  throughput: true,
}

/** Choosing the sorted column again reverses it; another column starts over. */
export function nextModelSort(
  current: ModelSort,
  key: ModelSortKey
): ModelSort {
  if (current.key === key) return { key, descending: !current.descending }
  return { key, descending: STARTS_DESCENDING[key] }
}

/**
 * Reads a sort from the address bar: "tokens-desc", "input-asc", a bare
 * column name, or one of the names the sort menu used to write.
 */
export function parseModelSort(value?: string): ModelSort {
  if (!value) return DEFAULT_MODEL_SORT
  if (value === 'price-low') return { key: 'input', descending: false }
  if (value === 'price-high') return { key: 'input', descending: true }

  const [key, direction] = value.split('-')
  if (!(key in STARTS_DESCENDING)) return DEFAULT_MODEL_SORT
  const sortKey = key as ModelSortKey
  if (direction === 'asc') return { key: sortKey, descending: false }
  if (direction === 'desc') return { key: sortKey, descending: true }
  return { key: sortKey, descending: STARTS_DESCENDING[sortKey] }
}

export type PricePart = 'input' | 'output'

/**
 * The entry of an expression-priced model that a price column shows. A model
 * billed per request, image or second shows that price as its input.
 */
export function dynamicPartEntry(
  summary: DynamicPricingSummary,
  part: PricePart
): DynamicPriceEntry | undefined {
  const field = part === 'input' ? 'inputPrice' : 'outputPrice'
  return (
    summary.primaryEntries.find((item) => item.field === field) ??
    (part === 'input'
      ? summary.primaryEntries.find((item) => item.unit !== 'token')
      : undefined)
  )
}

/**
 * The price a price column shows for a model, as a number that can be
 * compared across models. Undefined when the column shows no price.
 */
export function pricePartValue(
  model: PricingModel,
  part: PricePart,
  selectedGroup?: string,
  now: Date = new Date()
): number | undefined {
  const ratio = getDisplayGroupRatio(model, selectedGroup)
  const dynamic = getDynamicPricingSummary(model, {
    tokenUnit: DEFAULT_TOKEN_UNIT,
    groupRatioMultiplier: ratio,
    now,
  })
  if (dynamic) {
    if (dynamic.isSpecialExpression) return undefined
    const entry = dynamicPartEntry(dynamic, part)
    if (!entry) return undefined
    const value = (entry.minValue ?? entry.value) * ratio
    return Number.isFinite(value) ? value : undefined
  }
  if (isTokenBasedModel(model)) {
    const input = model.model_ratio * 2 * ratio
    const value = part === 'input' ? input : input * model.completion_ratio
    return Number.isFinite(value) ? value : undefined
  }
  if (part === 'input') return (model.model_price || 0) * ratio
  return undefined
}

/** The live figures the usage and speed columns show, by model name. */
export type ModelSortFigures = {
  weeklyTokens: ReadonlyMap<string, number>
  perf: ReadonlyMap<string, { avg_latency_ms?: number; avg_tps?: number }>
  selectedGroup?: string
  now?: Date
}

function sortValue(
  model: PricingModel,
  key: ModelSortKey,
  figures: ModelSortFigures
): number | undefined {
  switch (key) {
    case 'tokens':
      return figures.weeklyTokens.get(model.model_name) || undefined
    case 'latency':
      return figures.perf.get(model.model_name)?.avg_latency_ms || undefined
    case 'throughput':
      return figures.perf.get(model.model_name)?.avg_tps || undefined
    case 'input':
    case 'output':
      return pricePartValue(model, key, figures.selectedGroup, figures.now)
    case 'name':
      return undefined
  }
}

function byName(a: PricingModel, b: PricingModel): number {
  return (a.model_name || '').localeCompare(b.model_name || '')
}

/**
 * Sorts the model list by a column. A model with nothing in that column (a
 * dash in the table) goes last in either direction, and equal values fall
 * back to the name, so the order never depends on the order of arrival.
 */
export function sortModelsBy(
  models: PricingModel[],
  sort: ModelSort,
  figures: ModelSortFigures
): PricingModel[] {
  if (sort.key === 'name') {
    const sorted = [...models].sort(byName)
    return sort.descending ? sorted.reverse() : sorted
  }

  return models
    .map((model) => ({ model, value: sortValue(model, sort.key, figures) }))
    .sort((a, b) => {
      if (a.value === undefined || b.value === undefined) {
        if (a.value === b.value) return byName(a.model, b.model)
        return a.value === undefined ? 1 : -1
      }
      const difference = sort.descending ? b.value - a.value : a.value - b.value
      return difference || byName(a.model, b.model)
    })
    .map((entry) => entry.model)
}
