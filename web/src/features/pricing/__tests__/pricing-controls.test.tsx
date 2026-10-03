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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { PricingSidebar } from '../components/pricing-sidebar'
import { PricingTable } from '../components/pricing-table'
import {
  PricingToolbar,
  type PricingToolbarProps,
} from '../components/pricing-toolbar'
import {
  EMPTY_MODEL_FILTERS,
  countActiveFilters,
  filterModels,
  priceStops,
  type ModelFilters,
} from '../lib/model-filters'
import {
  DEFAULT_MODEL_SORT,
  parseModelSort,
  type ModelSort,
} from '../lib/model-sort'
import type { PricingModel } from '../types'

const NOW = new Date('2026-10-03T08:00:00Z')

const alpha: PricingModel = {
  id: 1,
  model_name: 'alpha',
  vendor_name: 'Vendor A',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 3,
  enable_groups: ['default'],
  group_ratio: { default: 1 },
  supported_endpoint_types: ['openai'],
  input_modalities: ['text', 'image'],
  context_length: 1_000_000,
  supported_parameters: ['tools', 'reasoning'],
  release_date: '2026-09',
  series: 'Alpha',
}
// Half the price of alpha, older, text only, also callable as Anthropic.
const bravo: PricingModel = {
  ...alpha,
  id: 2,
  model_name: 'bravo',
  vendor_name: 'Vendor B',
  model_ratio: 0.5,
  price_multiplier: 0.5,
  supported_endpoint_types: ['openai', 'anthropic'],
  input_modalities: ['text'],
  context_length: 128_000,
  supported_parameters: ['tools'],
  release_date: '2025-06',
  series: 'Bravo',
}
// Saved before the specifications existed: it says nothing about itself.
const charlie: PricingModel = {
  id: 3,
  model_name: 'charlie',
  vendor_name: 'Vendor A',
  quota_type: 0,
  model_ratio: 4,
  completion_ratio: 3,
  enable_groups: ['default'],
  group_ratio: { default: 1 },
  supported_endpoint_types: ['openai'],
}
const catalogue = [alpha, bravo, charlie]
const vendors = [
  { id: 1, name: 'Vendor A' },
  { id: 2, name: 'Vendor B' },
]

function names(filters: Partial<ModelFilters>): string[] {
  return filterModels(
    catalogue,
    { ...EMPTY_MODEL_FILTERS, ...filters },
    NOW
  ).map((model) => model.model_name)
}

function toolbarProps(): PricingToolbarProps {
  return {
    models: catalogue,
    vendors,
    groups: ['default'],
    filters: EMPTY_MODEL_FILTERS,
    onFiltersChange: vi.fn(),
    hasActiveFilters: false,
    activeFilterCount: 0,
    onClearFilters: vi.fn(),
  }
}

describe('model list filters', () => {
  it('narrows the list by what each model says about itself', () => {
    expect(names({})).toEqual(['alpha', 'bravo', 'charlie'])
    expect(names({ inputModalities: ['image'] })).toEqual(['alpha'])
    expect(names({ inputModalities: ['text'] })).toEqual(['alpha', 'bravo'])
    expect(names({ discounted: true })).toEqual(['bravo'])
    expect(names({ minContext: 64_000 })).toEqual(['alpha', 'bravo'])
    expect(names({ minContext: 200_000 })).toEqual(['alpha'])
    expect(names({ parameters: ['tools'] })).toEqual(['alpha', 'bravo'])
    expect(names({ parameters: ['tools', 'reasoning'] })).toEqual(['alpha'])
    expect(names({ series: ['Bravo'] })).toEqual(['bravo'])
    expect(names({ series: ['Alpha', 'Bravo'] })).toEqual(['alpha', 'bravo'])
    // alpha came out last month, bravo sixteen months ago.
    expect(names({ maxAgeMonths: 3 })).toEqual(['alpha'])
    expect(names({ maxAgeMonths: 12 })).toEqual(['alpha'])
    expect(names({ authors: ['Vendor B'] })).toEqual(['bravo'])
    expect(names({ authors: ['Vendor A', 'Vendor B'] })).toEqual([
      'alpha',
      'bravo',
      'charlie',
    ])
    expect(names({ endpointTypes: ['anthropic'] })).toEqual(['bravo'])
    expect(names({ search: 'CHAR' })).toEqual(['charlie'])
    // Filters combine: every one has to pass.
    expect(names({ authors: ['Vendor A'], minContext: 4_000 })).toEqual([
      'alpha',
    ])
  })

  it('filters prices by the price shown, between the stops the list offers', () => {
    // Input per 1M: bravo 1, alpha 2, charlie 8. Output is three times that.
    const prompt = priceStops(catalogue, 'input')
    expect(prompt).toEqual([1, 2, 8])
    expect(priceStops(catalogue, 'output')).toEqual([3, 6, 24])
    expect(names({ promptPrice: { min: null, max: 2 } })).toEqual([
      'alpha',
      'bravo',
    ])
    expect(names({ promptPrice: { min: 2, max: null } })).toEqual([
      'alpha',
      'charlie',
    ])
    expect(names({ outputPrice: { min: 6, max: 6 } })).toEqual(['alpha'])
  })

  it('counts the groups that narrow the list, not the choices in them', () => {
    expect(countActiveFilters(EMPTY_MODEL_FILTERS)).toBe(0)
    expect(
      countActiveFilters({
        ...EMPTY_MODEL_FILTERS,
        search: 'alpha',
        authors: ['Vendor A', 'Vendor B'],
        minContext: 64_000,
        promptPrice: { min: null, max: 2 },
      })
    ).toBe(3)
  })

  it('lists one collapsed row per filter and offers only what the models can answer', async () => {
    const onFiltersChange = vi.fn()
    const sidebar = {
      models: catalogue,
      vendors,
      groups: ['default'],
      filters: EMPTY_MODEL_FILTERS,
      onFiltersChange,
      hasActiveFilters: false,
      onClearFilters: vi.fn(),
    }
    const user = userEvent.setup()
    const { rerender } = render(<PricingSidebar {...sidebar} />)

    expect(
      screen.getAllByRole('button').map((button) => button.textContent)
    ).toEqual([
      'Reset',
      'Input modalities',
      'Discounted',
      'Context length',
      'Prompt pricing',
      'Series',
      'Supported parameters',
      'Output pricing',
      'Model age',
      'Model authors',
      'Endpoint Type',
    ])
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled()
    expect(screen.queryByRole('checkbox')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Input modalities' }))
    expect(
      screen.getAllByRole('checkbox').map((box) => box.closest('label'))
    ).toHaveLength(5)
    await user.click(screen.getByRole('checkbox', { name: 'Image' }))
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      inputModalities: ['image'],
    })

    await user.click(screen.getByRole('button', { name: 'Model authors' }))
    await user.click(screen.getByRole('checkbox', { name: 'Vendor B' }))
    expect(onFiltersChange).toHaveBeenLastCalledWith({ authors: ['Vendor B'] })

    // What is chosen shows on the row, open or not.
    rerender(
      <PricingSidebar
        {...sidebar}
        filters={{
          ...EMPTY_MODEL_FILTERS,
          authors: ['Vendor A', 'Vendor B'],
          discounted: true,
        }}
        hasActiveFilters
      />
    )
    expect(
      screen.getByRole('button', { name: /^Model authors\s*2$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Discounted\s*1$/ })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeEnabled()
    await user.click(screen.getByRole('checkbox', { name: 'Vendor A' }))
    expect(onFiltersChange).toHaveBeenLastCalledWith({ authors: ['Vendor B'] })

    // A list whose models say nothing about themselves keeps only the
    // filters it can answer: the author, the price column, the endpoint.
    rerender(<PricingSidebar {...sidebar} models={[charlie]} />)
    expect(
      screen.getAllByRole('button').map((button) => button.textContent)
    ).toEqual(['Reset', 'Model authors', 'Endpoint Type'])
  })

  it('sets the smallest context from the slider', async () => {
    const onFiltersChange = vi.fn()
    const user = userEvent.setup()
    render(
      <PricingSidebar
        models={catalogue}
        vendors={vendors}
        groups={['default']}
        filters={{ ...EMPTY_MODEL_FILTERS, minContext: 64_000 }}
        onFiltersChange={onFiltersChange}
        hasActiveFilters
        onClearFilters={vi.fn()}
      />
    )
    await user.click(screen.getByRole('button', { name: /^Context length/ }))
    expect(screen.getByText('64K or more')).toBeVisible()
    // The thumb stays hidden until it has been laid out, which never happens
    // here; a browser shows it.
    const thumb = screen.getByRole('slider', { hidden: true })
    thumb.focus()
    await user.keyboard('{ArrowRight}')
    expect(onFiltersChange).toHaveBeenLastCalledWith({ minContext: 128_000 })
    await user.keyboard('{Home}')
    expect(onFiltersChange).toHaveBeenLastCalledWith({ minContext: 0 })
  })

  it('offers nothing in the toolbar but the way into the filters', () => {
    render(<PricingToolbar {...toolbarProps()} activeFilterCount={2} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveAccessibleName(/^Filter\s*2$/)
    // No count of models, display modes, sort menu or view switch.
    expect(screen.queryByText(/models?$/)).toBeNull()
  })

  it('opens the filters from the left on a narrow screen and restores focus on close', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const { rerender } = render(<PricingToolbar {...props} />)
    await user.click(screen.getByRole('button', { name: 'Filter' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filter' })
    expect(dialog).toHaveAttribute('data-side', 'left')
    expect(within(dialog).getByRole('button', { name: 'Reset' })).toBeDisabled()
    await user.click(
      within(dialog).getByRole('button', { name: 'Model authors' })
    )
    await user.click(within(dialog).getByRole('checkbox', { name: 'Vendor B' }))
    expect(props.onFiltersChange).toHaveBeenCalledWith({
      authors: ['Vendor B'],
    })
    rerender(
      <PricingToolbar
        {...props}
        filters={{ ...EMPTY_MODEL_FILTERS, authors: ['Vendor B'] }}
        hasActiveFilters
        activeFilterCount={1}
      />
    )
    expect(
      within(dialog).getByRole('checkbox', { name: 'Vendor B' })
    ).toBeChecked()
    await user.click(within(dialog).getByRole('button', { name: 'Reset' }))
    expect(props.onClearFilters).toHaveBeenCalledOnce()
    await user.keyboard('{Escape}')
    expect(await screen.findByRole('button', { name: /Filter/ })).toHaveFocus()
  })
})

describe('sorting the model list from its headings', () => {
  const base: PricingModel = {
    id: 1,
    model_name: 'alpha',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 3,
    enable_groups: ['default'],
    group_ratio: { default: 1 },
  }
  // bravo is the cheapest, the most used and the fastest; charlie has no
  // usage or speed figures yet and is sold at half its listed price.
  const models: PricingModel[] = [
    base,
    { ...base, id: 2, model_name: 'bravo', model_ratio: 0.5 },
    {
      ...base,
      id: 3,
      model_name: 'charlie',
      model_ratio: 4,
      group_ratio: { default: 0.75 },
    },
  ]

  function SortableTable(props: { initial?: ModelSort }) {
    const [sort, setSort] = useState(props.initial ?? DEFAULT_MODEL_SORT)
    return <PricingTable models={models} sort={sort} onSortChange={setSort} />
  }

  function renderTable(initial?: ModelSort) {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/api/perf-metrics/summary')) {
        return {
          data: {
            success: true,
            data: {
              models: [
                { model_name: 'alpha', avg_latency_ms: 900, avg_tps: 20 },
                { model_name: 'bravo', avg_latency_ms: 300, avg_tps: 60 },
              ],
            },
          },
        }
      }
      return {
        data: {
          success: true,
          data: {
            models: [
              { model_name: 'alpha', total_tokens: 1_000 },
              { model_name: 'bravo', total_tokens: 3_000 },
            ],
          },
        },
      }
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <SortableTable initial={initial} />
      </QueryClientProvider>
    )
  }

  function order(): string[] {
    return screen
      .getAllByRole('row')
      .map((row) => row.textContent?.match(/alpha|bravo|charlie/)?.[0])
      .filter((name): name is string => Boolean(name))
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sorts by the clicked column and reverses it on the second click', async () => {
    const user = userEvent.setup()
    renderTable()
    expect(order()).toEqual(['alpha', 'bravo', 'charlie'])
    await screen.findByText('300ms')

    const cases: Array<[RegExp, string[], string[]]> = [
      // Most used first; a model with no figure stays last either way.
      [
        /^Weekly tokens/,
        ['bravo', 'alpha', 'charlie'],
        ['alpha', 'bravo', 'charlie'],
      ],
      // Cheapest first, by the price shown: charlie is 4 x 0.75.
      [/^Input/, ['bravo', 'alpha', 'charlie'], ['charlie', 'alpha', 'bravo']],
      [/^Output/, ['bravo', 'alpha', 'charlie'], ['charlie', 'alpha', 'bravo']],
      [
        /^Latency/,
        ['bravo', 'alpha', 'charlie'],
        ['alpha', 'bravo', 'charlie'],
      ],
      [
        /^Throughput/,
        ['bravo', 'alpha', 'charlie'],
        ['alpha', 'bravo', 'charlie'],
      ],
      [/^Model/, ['alpha', 'bravo', 'charlie'], ['charlie', 'bravo', 'alpha']],
    ]
    for (const [heading, first, second] of cases) {
      await user.click(screen.getByRole('button', { name: heading }))
      await waitFor(() => expect(order()).toEqual(first))
      await user.click(screen.getByRole('button', { name: heading }))
      await waitFor(() => expect(order()).toEqual(second))
    }
  })

  it('names the direction on the sorted heading only and keeps it focused', async () => {
    const user = userEvent.setup()
    renderTable()
    expect(screen.getByRole('button', { name: /^Model\s*Asc$/ })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /^Weekly tokens/ }))
    // The heading keeps focus, so the keyboard can reverse it straight away.
    expect(
      screen.getByRole('button', { name: /^Weekly tokens\s*Desc$/ })
    ).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Model' })).toBeVisible()
    await user.keyboard('{Enter}')
    expect(
      screen.getByRole('button', { name: /^Weekly tokens\s*Asc$/ })
    ).toHaveFocus()
  })

  it('reorders when the usage figures arrive after the list', async () => {
    renderTable({ key: 'tokens', descending: true })
    expect(order()).toEqual(['alpha', 'bravo', 'charlie'])
    await waitFor(() => expect(order()).toEqual(['bravo', 'alpha', 'charlie']))
  })

  it('reads a sort from the address bar, including the old menu values', () => {
    expect(parseModelSort(undefined)).toEqual({
      key: 'name',
      descending: false,
    })
    expect(parseModelSort('tokens')).toEqual({
      key: 'tokens',
      descending: true,
    })
    expect(parseModelSort('latency-desc')).toEqual({
      key: 'latency',
      descending: true,
    })
    expect(parseModelSort('price-low')).toEqual({
      key: 'input',
      descending: false,
    })
    expect(parseModelSort('price-high')).toEqual({
      key: 'input',
      descending: true,
    })
    expect(parseModelSort('nonsense')).toEqual({
      key: 'name',
      descending: false,
    })
  })
})
