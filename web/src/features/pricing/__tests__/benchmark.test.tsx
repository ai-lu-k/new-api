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
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { ModelBenchmark } from '../components/model-benchmark'
import { ModelDetailsContent } from '../components/model-details'
import { PricingTable } from '../components/pricing-table'
import { Pricing } from '../index'
import {
  benchmarkScore,
  eloWindow,
  highestBenchmarkTier,
  indexBenchmarkModels,
  type BenchmarkSnapshot,
} from '../lib/benchmark'
import { sortModelsBy, type ModelSort } from '../lib/model-sort'
import type { PricingModel } from '../types'

// Canvas charts are outside this layout test; their browser module cannot load in jsdom.
vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))

const score = (rating: number) => ({
  rating,
  date: '2026-10-13',
})
const snapshot: BenchmarkSnapshot = {
  source_url: 'https://benchmark.example.test/text',
  license_url: 'https://benchmark.example.test/text-terms',
  updated_at: '2026-10-29T00:00:00Z',
  stale: false,
  version: 'Example Text Evaluations',
  image_attribution: {
    version: 'Example Image Evaluations',
    source_url: 'https://benchmark.example.test/images',
    license_url: 'https://benchmark.example.test/image-terms',
  },
  dimensions: [
    {
      id: 'overall',
      label_key: 'Overall',
      modality: 'text',
      group: 'Capability',
      date: '2026-10-13',
    },
    {
      id: 'reasoning',
      label_key: 'Reasoning',
      modality: 'text',
      group: 'Capability',
      date: '2026-10-13',
    },
    {
      id: 'image:overall',
      label_key: 'Overall',
      modality: 'image',
      group: 'Capability',
      date: '2026-10-27',
    },
    {
      id: 'image:text-rendering',
      label_key: 'Text rendering',
      modality: 'image',
      group: 'Capability',
      date: '2026-10-27',
    },
    {
      id: 'image:marketing-and-advertising',
      label_key: 'Marketing & advertising',
      modality: 'image',
      group: 'Use case',
      date: '2026-10-27',
    },
  ],
  models: [
    {
      id: 'alpha',
      modality: 'text',
      aliases: ['alpha', 'alpha-x0.5'],
      highest_tier: 'max',
      tiers: [
        {
          id: 'max',
          source_name: 'alpha-max',
          scores: { overall: score(82.5) },
        },
        {
          id: 'low',
          source_name: 'alpha-low',
          scores: { overall: score(95.7), reasoning: score(42.1) },
        },
      ],
    },
    {
      id: 'bravo',
      modality: 'text',
      aliases: ['bravo'],
      highest_tier: 'default',
      tiers: [
        {
          id: 'default',
          source_name: 'bravo',
          scores: { overall: score(87.9), reasoning: score(0) },
        },
      ],
    },
    {
      id: 'delta',
      modality: 'image',
      aliases: ['delta'],
      highest_tier: 'default',
      tiers: [
        {
          id: 'default',
          source_name: 'delta-image',
          scores: {
            'image:overall': score(1187.4),
            'image:text-rendering': score(1150.2),
          },
        },
      ],
    },
    {
      id: 'echo',
      modality: 'image',
      aliases: ['echo'],
      highest_tier: 'default',
      tiers: [
        {
          id: 'default',
          source_name: 'echo-image',
          scores: { 'image:overall': score(1050) },
        },
      ],
    },
  ],
}
const models: PricingModel[] = ['alpha', 'bravo', 'charlie'].map(
  (name, index) => ({
    id: index + 1,
    model_name: name,
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
  })
)

function renderQuery(element: React.ReactNode, data = snapshot) {
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/api/benchmark') {
      return { data: { success: true, data } }
    }
    return { data: { success: true, data: { models: [] } } }
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>
  )
}

afterEach(async () => {
  vi.restoreAllMocks()
  await i18next.changeLanguage('en')
  i18next.removeResourceBundle('fr', 'translation')
})

describe('Benchmark identity and highest-tier selection', () => {
  it('uses only explicit aliases and never borrows fast, distilled or snapshot scores', () => {
    const index = indexBenchmarkModels(snapshot.models)
    expect(index.get('alpha-x0.5')).toBe(index.get('alpha'))
    for (const name of [
      'alpha-fast',
      'alpha-distill',
      'alpha-20260101',
      'alpha-x0.25',
    ]) {
      expect(index.has(name)).toBe(false)
    }
  })
  it('selects inference strength even when a lower tier scored better and preserves missing highest scores', () => {
    const model = snapshot.models[0]
    expect(highestBenchmarkTier(model)?.id).toBe('max')
    expect(benchmarkScore(model, 'overall')?.rating).toBe(82.5)
    expect(benchmarkScore(model, 'reasoning')).toBeUndefined()
    expect(benchmarkScore(model, 'reasoning', 'low')?.rating).toBe(42.1)
  })
  it('keeps missing scores last in both directions while preserving a published zero', () => {
    const figures = {
      weeklyTokens: new Map(),
      perf: new Map(),
      benchmarkScores: new Map([
        ['alpha', 82.3],
        ['bravo', 0],
      ]),
    }
    expect(
      sortModelsBy(models, { key: 'benchmark', descending: true }, figures).map(
        (model) => model.model_name
      )
    ).toEqual(['alpha', 'bravo', 'charlie'])
    expect(
      sortModelsBy(
        models,
        { key: 'benchmark', descending: false },
        figures
      ).map((model) => model.model_name)
    ).toEqual(['bravo', 'alpha', 'charlie'])
  })
})

describe('Benchmark comparison', () => {
  const reference = {
    id: 'deepseek-v4.1-flash',
    aliases: ['deepseek-v4.1-flash', 'deepseek-v4.1-flash-x0.2'],
    highest_tier: 'max',
    tiers: [
      {
        id: 'max',
        source_name: 'deepseek-v4.1-flash',
        scores: { overall: score(77.26) },
      },
    ],
  }
  it('keeps a single DeepSeek max reference while clearing, selecting all and resetting other models', async () => {
    const user = userEvent.setup()
    renderQuery(<ModelBenchmark modelName='alpha' />, {
      ...snapshot,
      models: [...snapshot.models, reference],
    })
    const table = await screen.findByRole('table', {
      name: 'Benchmark comparison',
    })
    expect(within(table).getByText('deepseek-v4.1-flash')).toHaveTextContent(
      'deepseek-v4.1-flash'
    )
    expect(within(table).getByText('77')).toHaveTextContent('77')
    expect(
      screen.getByRole('figure', { name: 'Benchmark comparison' })
    ).toBeVisible()
    const trigger = screen.getByRole('combobox', {
      name: 'Add comparison models',
    })
    trigger.focus()
    await user.keyboard('{Enter}')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.queryByRole('option', { name: 'deepseek-v4.1-flash' })
    ).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(within(table).getAllByText('deepseek-v4.1-flash')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Select all' }))
    expect(within(table).getByText('bravo')).toHaveTextContent('bravo')
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(within(table).queryByText('bravo')).toBeNull()
    expect(within(table).getByText('deepseek-v4.1-flash')).toHaveTextContent(
      'deepseek-v4.1-flash'
    )
  })
  it('does not duplicate the DeepSeek reference when viewing its own alias', async () => {
    renderQuery(<ModelBenchmark modelName='deepseek-v4.1-flash-x0.2' />, {
      ...snapshot,
      models: [...snapshot.models, reference],
    })
    const table = await screen.findByRole('table', {
      name: 'Benchmark comparison',
    })
    expect(within(table).getAllByRole('row')).toHaveLength(2)
  })

  it('renders every scored subject tier and only max for the fixed reference', async () => {
    renderQuery(<ModelBenchmark modelName='alpha' />, {
      ...snapshot,
      models: [
        {
          ...snapshot.models[0],
          tiers: [
            ...snapshot.models[0].tiers,
            { id: 'high', source_name: '', scores: {} },
          ],
        },
        snapshot.models[1],
        {
          ...reference,
          tiers: [
            ...reference.tiers,
            {
              id: 'low',
              source_name: 'deepseek-low',
              scores: { overall: score(64) },
            },
          ],
        },
      ],
    })
    const table = await screen.findByRole('table', {
      name: 'Benchmark comparison',
    })
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent)
    ).toEqual(['alphalow96', 'alphamax83', 'deepseek-v4.1-flashmax77'])
    const figure = screen.getByRole('figure', { name: 'Benchmark comparison' })
    expect(figure.querySelector('[data-slot="chart"]')).toHaveClass('h-40')
  })
  it('places the compact benchmark card below the complete price section', async () => {
    renderQuery(
      <ModelDetailsContent
        model={models[0]}
        groupRatio={{ default: 1 }}
        usableGroup={{}}
        endpointMap={{}}
        autoGroups={[]}
        priceRate={1}
        usdExchangeRate={1}
        tokenUnit='M'
      />
    )
    const scoreCard = await screen.findByRole('region', {
      name: 'Benchmark scores',
    })
    const priceSection = screen
      .getByRole('heading', { name: /^Pricing$/ })
      .closest('section')
    if (!priceSection) throw new Error('Price section missing')
    expect(
      priceSection.compareDocumentPosition(scoreCard) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(scoreCard).toHaveClass('p-3', 'space-y-2')
  })
  it('keeps rounded scores while the interface language changes', async () => {
    renderQuery(<ModelBenchmark modelName='alpha' />)
    const table = await screen.findByRole('table', {
      name: 'Benchmark comparison',
    })
    expect(within(table).getByText('83')).toHaveTextContent('83')
    i18next.addResourceBundle('fr', 'translation', {
      'Benchmark scores': 'Scores Benchmark',
    })
    await act(() => i18next.changeLanguage('fr'))
    expect(within(table).getByText('83')).toHaveTextContent('83')
    expect(
      screen.getByRole('heading', { name: 'Scores Benchmark' })
    ).toBeVisible()
  })

  it('shows all published tiers together, searches and adds another model, and removes it', async () => {
    const user = userEvent.setup()
    renderQuery(<ModelBenchmark modelName='alpha' />)
    const table = await screen.findByRole('table', {
      name: 'Benchmark comparison',
    })
    expect(within(table).getByText('83')).toHaveTextContent('83')
    await user.click(
      screen.getByRole('combobox', { name: 'Add comparison models' })
    )
    const input = screen.getByRole('combobox', {
      name: 'Search Benchmark models...',
    })
    await user.type(input, 'bravo')
    await user.click(await screen.findByRole('option', { name: 'bravo' }))
    expect(within(table).getByText('88')).toHaveTextContent('88')
    await user.keyboard('{Escape}')
    expect(within(table).getByText('96')).toHaveTextContent('96')
    expect(
      screen.queryByRole('combobox', { name: 'Evaluation tier for alpha' })
    ).toBeNull()
    await user.click(
      screen.getByRole('combobox', { name: 'Add comparison models' })
    )
    await user.click(await screen.findByRole('option', { name: 'bravo' }))
    expect(within(table).queryByText('bravo')).toBeNull()
  })
  it('shows only published tiers for the selected dimension including a valid zero', async () => {
    const user = userEvent.setup()
    renderQuery(<ModelBenchmark modelName='alpha' />)
    const table = await screen.findByRole('table', {
      name: 'Benchmark comparison',
    })
    await user.click(
      screen.getByRole('combobox', { name: 'Benchmark dimension' })
    )
    await user.click(await screen.findByRole('option', { name: 'Reasoning' }))
    expect(within(table).queryByText('max')).toBeNull()
    expect(within(table).getByText('42')).toHaveTextContent('42')
    expect(within(table).getByText('low')).toHaveTextContent('low')
    await user.click(
      screen.getByRole('combobox', { name: 'Add comparison models' })
    )
    await user.click(await screen.findByRole('option', { name: 'bravo' }))
    expect(within(table).getByText('0')).toHaveTextContent('0')
    expect(
      screen.getByRole('link', { name: 'Example Text Evaluations' })
    ).toHaveAttribute('href', snapshot.source_url)
  })
  it('keeps unknown identity visible without fabricated scores', async () => {
    renderQuery(<ModelBenchmark modelName='alpha-fast' />)
    const table = await screen.findByRole('table', {
      name: 'Benchmark comparison',
    })
    expect(within(table).getByText('alpha-fast')).toHaveTextContent(
      'alpha-fast'
    )
    expect(
      screen.getByText('No exact highest-tier Benchmark score')
    ).toBeVisible()
    expect(within(table).queryByText('83')).toBeNull()
  })
  it('renders an error with retry when Benchmark is unavailable', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    vi.spyOn(api, 'get').mockRejectedValue(new Error('unavailable'))
    render(
      <QueryClientProvider client={client}>
        <ModelBenchmark modelName='alpha' />
      </QueryClientProvider>
    )
    expect(
      await screen.findByText('Benchmark scores unavailable')
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  })
})

describe('Benchmark list', () => {
  function SortableTable() {
    const [sort, setSort] = useState<ModelSort>({
      key: 'input',
      descending: false,
    })
    return <PricingTable models={models} sort={sort} onSortChange={setSort} />
  }
  it('sorts and reverses scores and preserves sorting on dimension changes', async () => {
    const user = userEvent.setup()
    renderQuery(<SortableTable />)
    await screen.findByText('83')
    const alphaRow = screen.getByRole('row', { name: /alpha/ })
    expect(within(alphaRow).getAllByRole('cell')[1]).toHaveTextContent(/^83$/)
    expect(
      within(alphaRow).getAllByRole('cell')[1].firstElementChild
    ).toHaveClass('text-center')
    const dimension = screen.getByRole('combobox', {
      name: 'Benchmark dimension',
    })
    const scoreHeader = screen.getByRole('columnheader', { name: /Score/ })
    expect(scoreHeader.firstElementChild).toHaveClass('justify-center')
    const missingRow = screen.getByRole('row', { name: /charlie/ })
    expect(
      within(missingRow).getAllByRole('cell')[1].firstElementChild
    ).toHaveClass('text-center')
    expect(
      within(scoreHeader).getByRole('combobox', { name: 'Benchmark dimension' })
    ).toBe(dimension)
    const sortButton = within(scoreHeader).getByRole('button', {
      name: 'Score',
    })
    sortButton.focus()
    await user.tab()
    expect(dimension).toHaveFocus()
    expect(dimension).toHaveTextContent('OverallScore')
    expect(dimension.querySelector('svg')).toBeNull()
    expect(within(sortButton).getByText('Score')).toHaveClass('sr-only')
    expect(screen.queryByText('Highest evaluation tier')).toBeNull()
    expect(dimension).toHaveClass(
      'border-0',
      'bg-transparent',
      'text-sm',
      'font-medium'
    )
    expect(within(dimension).getByText('Overall')).toHaveClass(
      'underline',
      'decoration-muted-foreground/50'
    )
    const order = () =>
      screen
        .getAllByRole('row')
        .flatMap(
          (row) => row.textContent?.match(/alpha|bravo|charlie/)?.[0] ?? []
        )
    await user.click(screen.getByRole('button', { name: 'Score' }))
    expect(order()).toEqual(['bravo', 'alpha', 'charlie'])
    await user.keyboard('{Enter}')
    expect(order()).toEqual(['alpha', 'bravo', 'charlie'])
    await user.click(
      screen.getByRole('combobox', { name: 'Benchmark dimension' })
    )
    await user.click(await screen.findByRole('option', { name: 'Reasoning' }))
    await waitFor(() => expect(order()).toEqual(['bravo', 'alpha', 'charlie']))
    expect(screen.getByRole('button', { name: /^Score\s*Asc$/ })).toBeVisible()
  })
})

describe('Benchmark ladders by model type', () => {
  const imageModel: PricingModel = {
    id: 4,
    model_name: 'delta',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
  }
  const catalogue = [...models, imageModel]

  function TypedTable() {
    const [modelType, setModelType] = useState('text')
    const next = modelType === 'text' ? 'image' : 'text'
    return (
      <>
        <button type='button' onClick={() => setModelType(next)}>
          show {next}
        </button>
        <PricingTable models={catalogue} modelType={modelType} />
      </>
    )
  }

  it('keeps only image dimensions and the Elo score after the type filter changes', async () => {
    const user = userEvent.setup()
    renderQuery(<TypedTable />)
    await screen.findByText('83')
    await user.click(
      screen.getByRole('combobox', { name: 'Benchmark dimension' })
    )
    expect(screen.queryByText('Capability')).toBeNull()
    await user.click(await screen.findByRole('option', { name: 'Reasoning' }))
    expect(
      screen.getByRole('combobox', { name: 'Benchmark dimension' })
    ).toHaveTextContent('Reasoning')

    await user.click(screen.getByRole('button', { name: 'show image' }))
    const dimension = screen.getByRole('combobox', {
      name: 'Benchmark dimension',
    })
    expect(dimension).toHaveTextContent('Overall')
    await user.click(dimension)
    expect(
      await screen.findByRole('option', { name: 'Text rendering' })
    ).toBeVisible()
    expect(
      screen.getByRole('option', { name: 'Marketing & advertising' })
    ).toBeVisible()
    expect(screen.queryByRole('option', { name: 'Reasoning' })).toBeNull()
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.getByText('Capability')).toBeVisible()
    expect(screen.getByText('Use case')).toBeVisible()
    await user.keyboard('{Escape}')

    const deltaRow = screen.getByRole('row', { name: /delta/ })
    expect(within(deltaRow).getAllByRole('cell')[1]).toHaveTextContent(
      /^1,187$/
    )
  })

  it('leaves an image model unrated on the text ladder', async () => {
    renderQuery(<PricingTable models={catalogue} />)
    await screen.findByText('83')
    const deltaRow = screen.getByRole('row', { name: /delta/ })
    expect(within(deltaRow).getAllByRole('cell')[1]).toHaveTextContent('—')
  })

  it('compares an image model only with image models and cites the Elo source', async () => {
    const user = userEvent.setup()
    renderQuery(<ModelBenchmark modelName='delta' />)
    const table = await screen.findByRole('table', {
      name: 'Benchmark comparison',
    })
    expect(within(table).getByText('1,187')).toHaveTextContent('1,187')
    expect(
      screen.getByRole('combobox', { name: 'Benchmark dimension' })
    ).toHaveTextContent('Overall')
    expect(
      screen.getByRole('link', { name: 'Example Image Evaluations' })
    ).toHaveAttribute('href', 'https://benchmark.example.test/images')
    expect(screen.getByRole('link', { name: 'Data use' })).toHaveAttribute(
      'href',
      'https://benchmark.example.test/image-terms'
    )
    expect(
      screen.queryByText('Example Text Evaluations')
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('combobox', { name: 'Add comparison models' })
    )
    expect(screen.queryByRole('option', { name: 'alpha' })).toBeNull()
    await user.click(await screen.findByRole('option', { name: 'echo' }))
    expect(within(table).getByText('1,050')).toHaveTextContent('1,050')
  })
})

describe('Elo comparison window', () => {
  it('frames a tight Elo cluster so small gaps stay visible', () => {
    const window = eloWindow([1118, 1140, 1176, 1207])
    expect(window.domain).toEqual([1050, 1250])
    expect(window.ticks[0]).toBe(1050)
    expect(window.ticks.at(-1)).toBe(1250)
    for (const rating of [1118, 1140, 1176, 1207]) {
      expect(rating).toBeGreaterThanOrEqual(window.domain[0])
      expect(rating).toBeLessThanOrEqual(window.domain[1])
    }
  })

  it('keeps a lone rating inside the window instead of collapsing the axis', () => {
    const window = eloWindow([1207])
    expect(window.domain[0]).toBeLessThan(1207)
    expect(window.domain[1]).toBeGreaterThan(1207)
  })
})

describe('Benchmark page layout and pagination', () => {
  it('keeps the filter panel docked, with the drawer button only on narrow screens', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/notice') return { data: { success: true, data: '' } }
      if (url === '/api/benchmark') {
        return { data: { success: true, data: snapshot } }
      }
      if (url === '/api/pricing') {
        return {
          data: {
            success: true,
            data: models,
            vendors: [],
            group_ratio: { default: 1 },
            usable_group: {},
            supported_endpoint: {},
            auto_groups: [],
          },
        }
      }
      return { data: { success: true, data: { models: [] } } }
    })
    const root = createRootRoute()
    const route = createRoute({
      getParentRoute: () => root,
      path: '/pricing/',
      component: Pricing,
    })
    const router = createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ['/pricing/'] }),
    })
    await router.load()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )
    // Nothing on the page collapses the panel any more, so the list settles
    // next to a docked filter column.
    expect(
      await screen.findByRole('button', { name: /^Score\s*Desc$/ })
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Hide filters' })).toBeNull()
    expect(screen.queryByText(/This site currently has/)).toBeNull()
    expect(screen.queryByRole('button', { name: /^Model/ })).toBeNull()

    const panel = document.getElementById('pricing-filters')
    expect(panel).not.toHaveAttribute('hidden')
    expect(panel).toHaveClass('xl:block')
    expect(panel?.parentElement).toHaveClass(
      'xl:grid-cols-[216px_minmax(0,1fr)]'
    )

    // The drawer is the narrow-screen way in, so it never shows beside the
    // docked panel.
    const drawer = screen.getByRole('button', { name: /^Filter/ })
    expect(drawer).toHaveClass('xl:hidden')
    expect(drawer).toHaveAttribute('aria-controls', 'pricing-filters')
    await user.click(drawer)
    expect(await screen.findByRole('dialog')).toBeVisible()
  })

  it('keeps the dimension popup at least the trigger width plus wide enough for its longest label', async () => {
    const user = userEvent.setup()
    renderQuery(<PricingTable models={models} />)
    await screen.findByRole('combobox', { name: 'Benchmark dimension' })
    await user.click(
      screen.getByRole('combobox', { name: 'Benchmark dimension' })
    )
    const content = document.querySelector('[data-slot=select-content]')
    expect(content).not.toBeNull()
    // Shared SelectContent pins the popup to the trigger width and hides
    // horizontal overflow; long published labels (Terminal-Bench-Science)
    // must grow past the anchor instead of being cut off.
    expect(content).toHaveClass('w-max')
    expect(content).toHaveClass('min-w-(--anchor-width)')
  })

  it('returns to the first page when the score dimension changes', async () => {
    const user = userEvent.setup()
    const catalogue = Array.from({ length: 21 }, (_, i) => ({
      ...models[0],
      id: i,
      model_name: `model-${String(i).padStart(2, '0')}`,
    }))
    renderQuery(<PricingTable models={catalogue} />)
    await screen.findByRole('combobox', { name: 'Benchmark dimension' })
    await user.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(screen.getByText('model-20')).toBeVisible()
    await user.click(
      screen.getByRole('combobox', { name: 'Benchmark dimension' })
    )
    await user.click(await screen.findByRole('option', { name: 'Reasoning' }))
    expect(screen.getByText('model-00')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Go to previous page' })
    ).toBeDisabled()
  })
})
