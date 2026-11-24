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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { Route as CheapRoute } from '@/routes/cheap'
import { Route as PricingRoute } from '@/routes/pricing'

import { ModelTypeBar } from '../components/model-type-bar'
import { PricingSidebar } from '../components/pricing-sidebar'
import { PricingTable } from '../components/pricing-table'
import {
  PricingToolbar,
  type PricingToolbarProps,
} from '../components/pricing-toolbar'
import { useFilters } from '../hooks/use-filters'
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
import { availableModelTypes, modelTypes } from '../lib/model-types'
import type { PricingModel } from '../types'

// The route files below reach the whole model square, whose charts cannot
// load in jsdom; nothing here looks at a chart.
vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))

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

  it('opens common filters by default and keeps selected values visible when collapsed', async () => {
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

    const capabilities = screen.getByRole('region', { name: 'Capabilities' })
    expect(
      within(capabilities).getByRole('checkbox', { name: 'Text' })
    ).toBeVisible()
    expect(
      within(capabilities).queryByRole('checkbox', { name: 'Video' })
    ).toBeNull()
    expect(
      within(capabilities).getByRole('button', {
        name: 'Supported parameters Any',
      })
    ).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /^Groups/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull()

    await user.click(
      within(capabilities).getByRole('checkbox', { name: 'Image' })
    )
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      inputModalities: ['image'],
    })
    await user.click(screen.getByRole('checkbox', { name: 'Has a discount' }))
    expect(onFiltersChange).toHaveBeenLastCalledWith({ discounted: true })

    rerender(
      <PricingSidebar
        {...sidebar}
        filters={{
          ...EMPTY_MODEL_FILTERS,
          authors: ['Vendor A', 'Vendor B'],
          discounted: true,
          inputModalities: ['image'],
          parameters: ['tools'],
        }}
        hasActiveFilters
      />
    )
    expect(screen.getByRole('region', { name: 'Capabilities 2' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Pricing 1' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Source 1' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Supported parameters Tool calling' })
    ).toBeVisible()
    expect(screen.getByRole('checkbox', { name: 'Image' })).toBeChecked()
    await user.click(
      screen.getByRole('button', { name: 'Input modalities Image' })
    )
    expect(
      screen.getByRole('button', { name: 'Input modalities Image' })
    ).toHaveAttribute('aria-expanded', 'false')
    await user.click(screen.getByRole('button', { name: 'Remove Vendor A' }))
    expect(onFiltersChange).toHaveBeenLastCalledWith({ authors: ['Vendor B'] })
    expect(
      screen.getByRole('button', { name: 'Remove Vendor B' })
    ).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(sidebar.onClearFilters).toHaveBeenCalledOnce()

    rerender(<PricingSidebar {...sidebar} models={[charlie]} />)
    expect(screen.queryByRole('region', { name: 'Capabilities' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Pricing' })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Endpoint Type Any' })
    ).toBeVisible()
  })

  it('searches the entire vendor list while keeping active choices removable', async () => {
    const user = userEvent.setup()
    const onFiltersChange = vi.fn()
    const allVendors = [
      ...vendors,
      { id: 3, name: 'Vendor C' },
      { id: 4, name: 'Vendor D' },
    ]
    render(
      <PricingSidebar
        {...toolbarProps()}
        models={[
          ...catalogue,
          { ...charlie, vendor_name: 'Vendor C' },
          { ...charlie, vendor_name: 'Vendor D' },
        ]}
        vendors={allVendors}
        filters={{ ...EMPTY_MODEL_FILTERS, authors: ['Vendor A'] }}
        hasActiveFilters
        onFiltersChange={onFiltersChange}
      />
    )
    const search = screen.getByRole('searchbox', { name: 'Search vendors' })
    expect(screen.queryByRole('checkbox', { name: 'Vendor D' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'View all' }))
    expect(screen.getByRole('checkbox', { name: 'Vendor D' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Collapse' }))

    await user.type(search, 'vendor d')
    expect(screen.queryByRole('checkbox', { name: 'Vendor A' })).toBeNull()
    expect(onFiltersChange).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Remove Vendor A' })
    ).toBeVisible()
    await user.click(screen.getByRole('checkbox', { name: 'Vendor D' }))
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      authors: ['Vendor A', 'Vendor D'],
    })

    await user.clear(search)
    await user.type(search, 'unmatched')
    expect(screen.getByRole('status')).toHaveTextContent('No vendors found')
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
    expect(
      screen
        .getAllByText('64K or more')
        .some((node) => node.closest('[data-slot=accordion-content]'))
    ).toBe(true)
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
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
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

  function SortableTable(props: {
    initial?: ModelSort
    onModelClick?: (name: string) => void
  }) {
    const [sort, setSort] = useState(props.initial ?? DEFAULT_MODEL_SORT)
    return (
      <PricingTable
        models={models}
        sort={sort}
        onSortChange={setSort}
        onModelClick={props.onModelClick}
      />
    )
  }

  function renderTable(
    initial?: ModelSort,
    onModelClick?: (name: string) => void
  ) {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/benchmark') {
        return { data: { success: true, data: { models: [], dimensions: [] } } }
      }
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
        <SortableTable initial={initial} onModelClick={onModelClick} />
      </QueryClientProvider>
    )
  }

  it('shows a sortable list of model cards with detail actions on phones', async () => {
    const matchMedia = window.matchMedia
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      ...matchMedia(query),
      matches: query === '(max-width: 640px)' || matchMedia(query).matches,
    }))
    const openModel = vi.fn()
    renderTable({ key: 'input', descending: false }, openModel)
    expect(await screen.findByText('bravo')).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toBeVisible()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Asc' }))
    const cards = screen.getAllByRole('listitem')
    expect(within(cards[0]).getByText('charlie')).toBeVisible()
    await user.click(
      within(cards[0]).getByRole('button', { name: 'View details' })
    )
    expect(openModel).toHaveBeenCalledWith('charlie')
  })

  function order(): string[] {
    return screen
      .getAllByRole('row')
      .map((row) => row.textContent?.match(/alpha|bravo|charlie/)?.[0])
      .filter((name): name is string => Boolean(name))
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows call counts and success instead of token figures for image models', async () => {
    const imageModel: PricingModel = {
      id: 11,
      model_name: 'flux-a',
      vendor_name: 'Vendor A',
      quota_type: 1,
      model_price: 0.1,
      model_ratio: 0,
      completion_ratio: 1,
      enable_groups: ['default'],
      group_ratio: { default: 1 },
      supported_endpoint_types: ['image-generation'],
      output_modalities: ['image'],
    }
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/benchmark') {
        return { data: { success: true, data: { models: [], dimensions: [] } } }
      }
      if (url.startsWith('/api/perf-metrics/summary')) {
        return {
          data: {
            success: true,
            data: {
              window_start: 1_760_000_000,
              models: [
                {
                  model_name: 'flux-a',
                  avg_latency_ms: 12_000,
                  avg_tps: 0,
                  success_rate: 96.4,
                  // Two of the day's hours reported traffic; the rest are gray.
                  recent_success_series: [
                    { ts: 1_760_000_000, success_rate: 100 },
                    { ts: 1_760_003_600, success_rate: 98 },
                  ],
                },
              ],
            },
          },
        }
      }
      return {
        data: {
          success: true,
          data: {
            models: [],
            image_models: [{ model_name: 'flux-a', total_requests: 42 }],
          },
        },
      }
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <PricingTable models={[imageModel]} modelType='image' />
      </QueryClientProvider>
    )

    await screen.findByText('12.00s')
    const table = screen.getByRole('table')
    const headings = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent?.trim() ?? '')
    // The score heading also carries the dimension picker, so match its start.
    expect(headings).toHaveLength(6)
    expect(headings[0]).toBe('Model')
    expect(headings[1]).toMatch(/^Score/)
    expect(headings.slice(2)).toEqual([
      'Weekly calls',
      'Price',
      'Generation time',
      'Success rate',
    ])
    expect(within(table).getByText('42')).toBeInTheDocument()
    // The average reads as a whole percent, on the same line as the bars.
    expect(within(table).getByText('96%')).toBeInTheDocument()
    // The average sits above one bar per hour of the reported window.
    const bars = within(table).getByRole('img', {
      name: 'Recent success-rate samples; gray bars indicate missing data.',
    })
    expect(bars.children).toHaveLength(24)
    expect(within(table).queryByText('Weekly tokens')).not.toBeInTheDocument()
    expect(within(table).queryByText('Throughput')).not.toBeInTheDocument()
  })

  it('reads decision models in tokens, calls and both prices', async () => {
    // A decision model prices per token through its plugin expression, so its
    // row carries usage and both prices. It reports no benchmark, throughput or
    // relay telemetry, so those columns are left out rather than left empty.
    const decisionModel: PricingModel = {
      id: 12,
      model_name: 'jev',
      vendor_name: 'TypeSafe AI',
      quota_type: 0,
      model_ratio: 0.005,
      model_price: 0,
      completion_ratio: 1,
      enable_groups: ['default'],
      group_ratio: { default: 1 },
      tags: '决策模型',
      supported_endpoint_types: ['openai'],
      billing_expr: 'tier("base", p * 0.01 + c * 0.01)',
      billing_mode: 'tiered_expr',
      billing_plugin_variants: [
        {
          plugin_key: 'typesafe',
          plugin_name: 'TypeSafe AI',
          billing_expr:
            'tier("base", u("input_tokens") * 0.01 / 1000000 + u("output_tokens") * 0.01 / 1000000)',
          billing_mode: 'tiered_expr',
          billing_usage_schema: {
            input_tokens: { type: 'number', unit: 'token' },
            output_tokens: { type: 'number', unit: 'token' },
          },
        },
      ],
    }
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/benchmark') {
        return { data: { success: true, data: { models: [], dimensions: [] } } }
      }
      if (url.startsWith('/api/perf-metrics/summary')) {
        return {
          data: {
            success: true,
            data: { window_start: 1_760_000_000, models: [] },
          },
        }
      }
      return {
        data: {
          success: true,
          data: {
            models: [],
            image_models: [{ model_name: 'jev', total_requests: 999 }],
            decision_models: [
              { model_name: 'jev', total_tokens: 1_200, total_requests: 7 },
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
        <PricingTable models={[decisionModel]} modelType='decision' />
      </QueryClientProvider>
    )

    await screen.findByText('1.2K')
    const table = screen.getByRole('table')
    const headings = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent?.trim() ?? '')
    expect(headings).toHaveLength(5)
    expect(headings[0]).toBe('Model')
    expect(headings[1]).toBe('Weekly tokens')
    expect(headings[2]).toBe('Weekly calls')
    expect(headings[3]).toMatch(/^Input/)
    expect(headings[4]).toMatch(/^Output/)
    const cells = within(table)
      .getAllByRole('cell')
      .map((cell) => cell.textContent?.trim() ?? '')
    // The decision board reports 7 calls; the image board's 999 must not leak.
    expect(cells[0]).toContain('jev')
    expect(cells.slice(1, 3)).toEqual(['1.2K', '7'])
    // Both sides read the 0.01 / 1M the plugin expression charges.
    expect(cells[3]).toContain('0.01')
    expect(cells[4]).toContain('0.01')
    for (const empty of ['Score', 'Throughput', 'Latency', 'Success rate']) {
      expect(within(table).queryByText(empty)).not.toBeInTheDocument()
    }
    expect(
      screen.queryByText(/AA-Intelligence|LiveBench/)
    ).not.toBeInTheDocument()
  })

  it('distributes the six data columns equally and centers their headings and values', async () => {
    renderTable()
    await screen.findByText('300ms')
    const table = screen.getByRole('table')
    expect(table).toHaveClass('table-fixed', 'min-w-[900px]')
    const columns = table.querySelectorAll('col')
    expect(columns).toHaveLength(7)
    // Only the model column reserves width; fixed layout shares the rest equally.
    expect(columns[0]).toHaveClass('w-[320px]')
    for (const column of [...columns].slice(1)) {
      expect(column).not.toHaveAttribute('style')
      expect(column).not.toHaveAttribute('class')
    }
    for (const header of within(table).getAllByRole('columnheader').slice(1)) {
      expect(header.firstElementChild).toHaveClass('justify-center')
    }
    for (const row of within(table).getAllByRole('row').slice(1)) {
      for (const cell of within(row).getAllByRole('cell').slice(1)) {
        expect(cell.firstElementChild).toHaveClass('text-center')
      }
    }
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
    expect(screen.getByRole('columnheader', { name: /^Model$/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Model/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^Score\s*Desc$/ })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /^Weekly tokens/ }))
    // The heading keeps focus, so the keyboard can reverse it straight away.
    expect(
      screen.getByRole('button', { name: /^Weekly tokens\s*Desc$/ })
    ).toHaveFocus()
    expect(screen.queryByRole('button', { name: /^Model/ })).toBeNull()
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
      key: 'benchmark',
      descending: true,
    })
    for (const legacy of ['name', 'name-asc', 'name-desc']) {
      expect(parseModelSort(legacy)).toEqual(DEFAULT_MODEL_SORT)
    }
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
      key: 'benchmark',
      descending: true,
    })
  })
})

describe('the model type bar', () => {
  // Same model, different endpoints: the bar reads what each one produces.
  const chat: PricingModel = {
    ...alpha,
    model_name: 'chat',
    supported_endpoint_types: ['openai', 'anthropic'],
  }
  const painter: PricingModel = {
    ...alpha,
    model_name: 'painter',
    supported_endpoint_types: ['openai', 'image-generation'],
  }
  const filmer: PricingModel = {
    ...alpha,
    model_name: 'filmer',
    supported_endpoint_types: ['openai-video'],
  }
  const indexer: PricingModel = {
    ...alpha,
    model_name: 'indexer',
    supported_endpoint_types: ['embeddings'],
  }
  const reranker: PricingModel = {
    ...alpha,
    model_name: 'reranker',
    supported_endpoint_types: ['jina-rerank'],
  }
  const decider: PricingModel = {
    ...alpha,
    model_name: 'jev',
    tags: '评测, 决策模型',
  }
  const mixed = [chat, painter, filmer, indexer, reranker, decider]

  it('reads a model type from its stated outputs and its endpoints', () => {
    expect(modelTypes(chat)).toEqual(['text'])
    // Taking a picture in does not make a model draw one.
    expect(modelTypes(painter)).toEqual(['image'])
    expect(modelTypes(filmer)).toEqual(['video'])
    expect(modelTypes(indexer)).toEqual(['embeddings'])
    expect(modelTypes(reranker)).toEqual(['rerank'])
    // A model that draws is listed under images, not under text, even when
    // it also answers in text.
    expect(
      modelTypes({ ...chat, output_modalities: ['text', 'image'] })
    ).toEqual(['image'])
    expect(modelTypes({ ...chat, output_modalities: ['text'] })).toEqual([
      'text',
    ])
    expect(modelTypes({ ...painter, output_modalities: ['image'] })).toEqual([
      'image',
    ])
    // A model that says nothing is not given a type it never claimed.
    expect(
      modelTypes({
        ...chat,
        supported_endpoint_types: [],
        output_modalities: undefined,
      })
    ).toEqual([])
    // A model tagged as the decision model answers in text, so the tag adds
    // the decision family instead of replacing the text one.
    expect(modelTypes(decider)).toEqual(['text', 'decision'])
    expect(
      modelTypes({ ...chat, model_name: 'jev', tags: 'Decision' })
    ).toEqual(['text', 'decision'])
    // A tag of another model never moves it onto the decision board.
    expect(modelTypes(chat)).toEqual(['text'])
  })

  it('reads the decision family from the catalogue tag', () => {
    // A decision model answers in text, so it keeps both families.
    expect(modelTypes(decider)).toEqual(['text', 'decision'])
    expect(modelTypes({ ...chat, tags: '决策模型' })).toEqual([
      'text',
      'decision',
    ])
    expect(modelTypes({ ...chat, tags: 'decision' })).toEqual([
      'text',
      'decision',
    ])
    expect(modelTypes({ ...chat, tags: '推理, 高速' })).toEqual(['text'])
  })

  it('offers only the types the catalogue has, in listing order', () => {
    expect(availableModelTypes(mixed)).toEqual([
      'text',
      'image',
      'decision',
      'video',
      'embeddings',
      'rerank',
    ])
    expect(
      availableModelTypes([chat, { ...chat, model_name: 'chat2' }])
    ).toEqual(['text'])
  })

  it('narrows the list to one type and keeps the other filters', () => {
    const namesOf = (filters: Partial<ModelFilters>): string[] =>
      filterModels(mixed, { ...EMPTY_MODEL_FILTERS, ...filters }).map(
        (model) => model.model_name
      )

    expect(namesOf({})).toEqual(mixed.map((model) => model.model_name))
    expect(namesOf({ modelType: 'image' })).toEqual(['painter'])
    // A decision model answers in text, so it is listed under both types.
    expect(namesOf({ modelType: 'text' })).toEqual(['chat', 'jev'])
    expect(namesOf({ modelType: 'decision' })).toEqual(['jev'])
    // The type adds to the search instead of replacing it.
    expect(namesOf({ modelType: 'image', search: 'chat' })).toEqual([])
    expect(namesOf({ modelType: 'image', search: 'paint' })).toEqual([
      'painter',
    ])
    // Choosing a type counts as a filter, so the shared reset can clear it.
    expect(
      countActiveFilters({ ...EMPTY_MODEL_FILTERS, modelType: 'text' })
    ).toBe(1)
  })

  it('switches the type from one row of tabs', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <ModelTypeBar
        types={availableModelTypes(mixed)}
        value='all'
        onChange={onChange}
      />
    )

    const tabs = screen.getByRole('tablist', { name: 'Model types' })
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.textContent)
    ).toEqual([
      'All',
      'Text',
      'Image',
      'Decision models',
      'Video',
      'Embeddings',
      'Rerank',
    ])
    expect(within(tabs).getByRole('tab', { name: 'All' })).toHaveAttribute(
      'aria-selected',
      'true'
    )

    await user.click(within(tabs).getByRole('tab', { name: 'Image' }))
    expect(onChange).toHaveBeenCalledWith('image')

    rerender(
      <ModelTypeBar
        types={availableModelTypes(mixed)}
        value='image'
        onChange={onChange}
      />
    )
    expect(
      within(screen.getByRole('tablist', { name: 'Model types' })).getByRole(
        'tab',
        { name: 'Image' }
      )
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('takes no room when the catalogue has a single type', () => {
    const { container } = render(
      <ModelTypeBar types={['text']} value='all' onChange={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('paging a narrowed model list', () => {
  const many: PricingModel[] = Array.from({ length: 45 }, (_, index) => ({
    id: index + 1,
    model_name: `model-${index + 1}`,
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 3,
    enable_groups: ['default'],
    group_ratio: { default: 1 },
  }))

  function renderList(models: PricingModel[]) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    return render(
      <QueryClientProvider client={queryClient}>
        <PricingTable models={models} />
      </QueryClientProvider>
    )
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts a narrowed list from its first page', async () => {
    vi.spyOn(api, 'get').mockImplementation(async () => ({
      data: { success: true, data: { models: [], dimensions: [] } },
    }))
    const user = userEvent.setup()
    const { rerender } = renderList(many)
    await screen.findByText('model-1')

    await user.click(screen.getByRole('button', { name: /Go to page 3/ }))
    // The third page of the full list holds the last five models.
    expect(await screen.findByText('model-9')).toBeVisible()
    expect(screen.queryByText('model-1')).toBeNull()

    const narrowed = many.slice(0, 30)
    rerender(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false, gcTime: 0 } },
          })
        }
      >
        <PricingTable models={narrowed} />
      </QueryClientProvider>
    )
    // Two pages are left, and the reader is shown the first of them.
    expect(await screen.findByText('model-1')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Go to page 3/ })).toBeNull()
  })
})

describe('the list opened as the cheap models page', () => {
  // Reads back what the list would sort by, from whichever route is shown.
  function SortProbe() {
    const { sort } = useFilters([alpha, bravo])
    return (
      <output data-testid='sort'>{`${sort.key}-${sort.descending}`}</output>
    )
  }

  async function renderAt(path: string) {
    const root = createRootRoute()
    const cheap = createRoute({
      getParentRoute: () => root,
      path: '/cheap/',
      validateSearch: CheapRoute.options.validateSearch,
      component: SortProbe,
    })
    const pricing = createRoute({
      getParentRoute: () => root,
      path: '/pricing/',
      validateSearch: PricingRoute.options.validateSearch,
      component: SortProbe,
    })
    const router = createRouter({
      routeTree: root.addChildren([cheap, pricing]),
      history: createMemoryHistory({ initialEntries: [path] }),
    })
    render(<RouterProvider router={router} />)
    await router.load()
    return screen.findByTestId('sort')
  }

  afterEach(() => {
    cleanup()
  })

  it('opens cheapest first at /cheap and keeps the model square order at /pricing', async () => {
    expect(await renderAt('/cheap')).toHaveTextContent('input-false')
    cleanup()
    expect(await renderAt('/pricing')).toHaveTextContent('benchmark-true')
  })
})

it('lists audio directly after image in the type bar', () => {
  const order = availableModelTypes([
    { model_name: 'vision', output_modalities: ['image'] },
    { model_name: 'speech', output_modalities: ['audio'] },
  ] as Parameters<typeof availableModelTypes>[0])

  expect(order.indexOf('audio')).toBe(order.indexOf('image') + 1)
})
