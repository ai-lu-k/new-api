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
  DEFAULT_MODEL_SORT,
  parseModelSort,
  type ModelSort,
} from '../lib/model-sort'
import type { PricingModel } from '../types'

function toolbarProps(): PricingToolbarProps {
  return {
    quotaTypeFilter: 'all',
    endpointTypeFilter: 'all',
    vendorFilter: 'all',
    groupFilter: 'all',
    tagFilter: 'all',
    onQuotaTypeChange: vi.fn(),
    onEndpointTypeChange: vi.fn(),
    onVendorChange: vi.fn(),
    onGroupChange: vi.fn(),
    onTagChange: vi.fn(),
    vendors: [],
    groups: ['default', 'premium'],
    groupRatios: { default: 1, premium: 3 },
    tags: [],
    models: [],
    hasActiveFilters: false,
    activeFilterCount: 0,
    onClearFilters: vi.fn(),
  }
}

describe('pricing controls', () => {
  it('counts each model once per filter and updates counts when the catalog changes', () => {
    const props = toolbarProps()
    const base: PricingModel = {
      id: 1,
      model_name: 'text-model',
      vendor_name: 'Vendor A',
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 1,
      enable_groups: ['default'],
      tags: 'Chat,chat',
      supported_endpoint_types: ['openai', 'openai'],
    }
    const models: PricingModel[] = [
      base,
      {
        ...base,
        id: 2,
        model_name: 'image-model',
        quota_type: 1,
        tags: 'chat,Image',
        supported_endpoint_types: ['image-generation'],
      },
      {
        ...base,
        id: 3,
        model_name: 'task-model',
        vendor_name: 'Vendor B',
        tags: 'Video',
        supported_endpoint_types: ['openai-video'],
        billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
      },
    ]
    const sidebarProps = {
      ...props,
      vendors: [
        { id: 1, name: 'Vendor A' },
        { id: 2, name: 'Vendor B' },
      ],
      tags: ['Chat', 'Image', 'Video'],
    }
    const { rerender } = render(
      <PricingSidebar {...sidebarProps} models={models} />
    )

    expect(
      screen.getByRole('button', { name: /^All Vendors\s*3$/ })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /^Vendor A\s*2$/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Vendor B\s*1$/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Chat\s*2$/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Chat\s*1$/ })).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Token-based\s*1$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Per Request\s*1$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Task billing\s*1$/ })
    ).toBeVisible()

    rerender(<PricingSidebar {...sidebarProps} models={[models[1]]} />)
    expect(
      screen.getByRole('button', { name: /^All Vendors\s*1$/ })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /^Vendor A\s*1$/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Vendor B\s*1$/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^Chat\s*1$/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Chat\s*0$/ })).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Token-based\s*0$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Task billing\s*0$/ })
    ).toBeVisible()
  })

  it('offers nothing but the way into the filters', () => {
    render(<PricingToolbar {...toolbarProps()} activeFilterCount={2} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveAccessibleName(/^Filter\s*2$/)
    // No count of models, display modes, sort menu or view switch.
    expect(screen.queryByText(/models?$/)).toBeNull()
  })

  it('opens mobile filters from the left, selects a group, and restores focus on close', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const { rerender } = render(<PricingToolbar {...props} />)
    await user.click(screen.getByRole('button', { name: 'Filter' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filter' })
    expect(dialog).toHaveAttribute('data-side', 'left')
    expect(within(dialog).getByRole('button', { name: 'Reset' })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: /premium/ }))
    expect(props.onGroupChange).toHaveBeenCalledWith('premium')
    rerender(
      <PricingToolbar
        {...props}
        groupFilter='premium'
        hasActiveFilters
        activeFilterCount={1}
      />
    )
    expect(
      within(dialog).getByRole('button', { name: /premium/ })
    ).toHaveAttribute('aria-pressed', 'true')
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
