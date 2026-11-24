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
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'
import { withViewTransition } from '@/lib/view-transition'

import {
  LoadingSkeleton,
  EmptyState,
  SearchBar,
  PricingTable,
  PricingSidebar,
  PricingToolbar,
  ModelDetailsDrawer,
  ModelTypeBar,
} from './components'
import { DEFAULT_TOKEN_UNIT, EXCLUDED_GROUPS, VIEW_MODES } from './constants'
import { useBenchmark } from './hooks/use-benchmark'
import { useFilters } from './hooks/use-filters'
import { usePricingData } from './hooks/use-pricing-data'
import { SelectedModelContext } from './hooks/use-selected-model'
import { availableModelTypes } from './lib/model-types'

type PricingProps = {
  /**
   * The heading the page shows. The same list is served at /pricing and, from
   * its cheapest end, at /cheap; each names itself.
   */
  heading?: string
}

export function Pricing({ heading }: PricingProps = {}) {
  const { t } = useTranslation()
  // Begin this independent query while the pricing catalogue loads.
  useBenchmark()
  const [selectedModelName, setSelectedModelName] = useState<string | null>(
    null
  )

  const {
    models,
    vendors,
    groupRatio,
    usableGroup,
    endpointMap,
    autoGroups,
    isLoading,
    priceRate,
    usdExchangeRate,
  } = usePricingData()

  const {
    searchInput,
    sort,
    filters,
    setSearchInput,
    setSort,
    setFilters,
    filteredModels,
    hasActiveFilters,
    activeFilterCount,
    clearFilters,
    clearSearch,
  } = useFilters(models || [])

  // The card's name morphs into the drawer's title, so the state change runs
  // inside one view transition.
  const handleModelClick = useCallback((modelName: string) => {
    withViewTransition(() => setSelectedModelName(modelName))
  }, [])

  const selectedModel = useMemo(
    () =>
      selectedModelName
        ? (models || []).find(
            (model) => model.model_name === selectedModelName
          ) || null
        : null,
    [models, selectedModelName]
  )

  const availableGroups = useMemo(
    () =>
      Object.keys(usableGroup || {}).filter(
        (g) => !EXCLUDED_GROUPS.includes(g)
      ),
    [usableGroup]
  )

  const handleClearAll = useCallback(() => {
    clearFilters()
    clearSearch()
  }, [clearFilters, clearSearch])

  const renderPricingContent = () => {
    if (filteredModels.length === 0) {
      return (
        <EmptyState
          searchQuery={searchInput}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={handleClearAll}
        />
      )
    }

    return (
      <PricingTable
        models={filteredModels}
        priceRate={priceRate}
        usdExchangeRate={usdExchangeRate}
        selectedGroup={filters.group}
        modelType={filters.modelType}
        sort={sort}
        onSortChange={setSort}
        onModelClick={handleModelClick}
      />
    )
  }

  if (isLoading) {
    return (
      <PublicLayout showMainContainer={false}>
        <div className='mx-auto w-full max-w-[1800px] pb-8 sm:pb-10'>
          <LoadingSkeleton viewMode={VIEW_MODES.TABLE} />
        </div>
      </PublicLayout>
    )
  }

  return (
    <SelectedModelContext value={selectedModelName}>
      <PublicLayout showMainContainer={false}>
        <div className='relative'>
          <PageTransition className='relative mx-auto w-full max-w-[1800px] pb-8 sm:pb-10'>
            <div className='grid xl:grid-cols-[216px_minmax(0,1fr)]'>
              <div
                id='pricing-filters'
                className='hover-scrollbar sticky top-(--app-header-height,3.5rem) hidden max-h-[calc(100dvh-var(--app-header-height,3.5rem))] self-start overflow-y-auto border-r px-6 py-5 xl:block'
              >
                <PricingSidebar
                  models={models || []}
                  vendors={vendors || []}
                  groups={availableGroups}
                  filters={filters}
                  onFiltersChange={setFilters}
                  hasActiveFilters={hasActiveFilters}
                  onClearFilters={clearFilters}
                />
              </div>

              <main className='min-w-0 space-y-4 px-(--app-page-gutter,1rem) pt-4 sm:pt-5'>
                <header className='mb-3 flex flex-col gap-1'>
                  <h1 className='text-xl leading-[1.15] font-bold tracking-tight sm:text-2xl'>
                    {heading ? t(heading) : t('Model Square')}
                  </h1>
                  <p className='text-muted-foreground text-[13px] leading-snug'>
                    {t(
                      'Compare capabilities, prices, and performance to find a model that fits.'
                    )}
                  </p>
                </header>
                <div className='flex items-center gap-2'>
                  <SearchBar
                    className='min-w-0 flex-1 [&_input]:h-11'
                    value={searchInput}
                    onChange={setSearchInput}
                    onClear={clearSearch}
                    placeholder={t(
                      'Search model name, provider, endpoint, or tag...'
                    )}
                  />
                  <PricingToolbar
                    models={models || []}
                    vendors={vendors || []}
                    groups={availableGroups}
                    filters={filters}
                    onFiltersChange={setFilters}
                    hasActiveFilters={hasActiveFilters}
                    activeFilterCount={activeFilterCount}
                    onClearFilters={clearFilters}
                  />
                </div>

                <ModelTypeBar
                  types={availableModelTypes(models || [])}
                  value={filters.modelType}
                  onChange={(modelType) => setFilters({ modelType })}
                />

                {renderPricingContent()}
              </main>
            </div>

            {selectedModel && (
              <ModelDetailsDrawer
                open={Boolean(selectedModel)}
                onOpenChange={(open) => {
                  if (!open) {
                    withViewTransition(() => setSelectedModelName(null))
                  }
                }}
                model={selectedModel}
                groupRatio={groupRatio || {}}
                usableGroup={usableGroup || {}}
                endpointMap={
                  (endpointMap as Record<
                    string,
                    { path?: string; method?: string }
                  >) || {}
                }
                autoGroups={autoGroups || []}
                priceRate={priceRate ?? 1}
                usdExchangeRate={usdExchangeRate ?? 1}
                tokenUnit={DEFAULT_TOKEN_UNIT}
                showRechargePrice={false}
              />
            )}
          </PageTransition>
        </div>
      </PublicLayout>
    </SelectedModelContext>
  )
}
