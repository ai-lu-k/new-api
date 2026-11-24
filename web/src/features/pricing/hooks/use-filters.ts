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
import { useSearch } from '@tanstack/react-router'
import { useMemo, useCallback, useState } from 'react'

import { useDebounce } from '@/hooks/use-debounce'

import { FILTER_ALL } from '../constants'
import {
  EMPTY_MODEL_FILTERS,
  countActiveFilters,
  filterModels,
  type ModelFilters,
} from '../lib/model-filters'
import { parseModelSort, type ModelSort } from '../lib/model-sort'
import type { PricingModel } from '../types'

/**
 * The state of the model list: what is searched for, which filters narrow it
 * and which column sorts it. An address with ?search=, ?vendor=, ?group=,
 * ?endpointType= or ?sort= opens the list that way.
 */
export function useFilters(models: PricingModel[]) {
  // The list is shown at /pricing and, opened from its cheapest end, at
  // /cheap, so its search is read from whichever of the two is on screen.
  const search = useSearch({ strict: false })
  // Other routes declare some of these as lists; this list reads one value.
  const one = (value: string | string[] | undefined) =>
    typeof value === 'string' ? value : undefined
  const from = {
    search: one(search.search),
    group: one(search.group),
    vendor: one(search.vendor),
    endpointType: one(search.endpointType),
    modelType: one(search.modelType),
    sort: one(search.sort),
  }
  const [filters, setFilterState] = useState<ModelFilters>(() => ({
    ...EMPTY_MODEL_FILTERS,
    search: from.search ?? '',
    group: from.group || FILTER_ALL,
    modelType: from.modelType || FILTER_ALL,
    authors: from.vendor ? [from.vendor] : [],
    endpointTypes: from.endpointType ? [from.endpointType] : [],
  }))
  // The list is a table sorted from its headings (see lib/model-sort).
  const [sort, setSort] = useState<ModelSort>(() => parseModelSort(from.sort))

  const debouncedSearch = useDebounce(filters.search, 200)

  const setFilters = useCallback((changes: Partial<ModelFilters>) => {
    setFilterState((previous) => ({ ...previous, ...changes }))
  }, [])
  const setSearchInput = useCallback(
    (value: string) => setFilters({ search: value }),
    [setFilters]
  )
  const clearSearch = useCallback(
    () => setFilters({ search: '' }),
    [setFilters]
  )
  const clearFilters = useCallback(() => {
    setFilterState((previous) => ({
      ...EMPTY_MODEL_FILTERS,
      search: previous.search,
    }))
  }, [])

  const filteredModels = useMemo(
    () => filterModels(models, { ...filters, search: debouncedSearch }),
    [models, filters, debouncedSearch]
  )
  const activeFilterCount = useMemo(
    () => countActiveFilters(filters),
    [filters]
  )

  return {
    searchInput: filters.search,
    sort,
    filters,
    setSearchInput,
    setSort,
    setFilters,
    filteredModels,
    hasActiveFilters: activeFilterCount > 0,
    activeFilterCount,
    clearFilters,
    clearSearch,
  }
}
