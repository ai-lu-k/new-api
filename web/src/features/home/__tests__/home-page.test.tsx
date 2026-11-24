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
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/context/theme-provider'
import { api } from '@/lib/api'
import dayjs from '@/lib/dayjs'
import { useAuthStore } from '@/stores/auth-store'

import { Home } from '../index'

const WINDOW_START = 1793865600
const WINDOW_END = 1793950816
const MODEL = {
  id: 1,
  model_name: 'deepseek-v4.1-flash',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['default'],
  supported_endpoint_types: ['openai'],
}

/** Days of token points the month ranking returns in a test. */
let rankingDays: { ts: string; tokens: number }[] = []
let models: unknown[] = [MODEL]
let perfSummary: unknown = {
  avg_latency_ms: 9748,
  success_rate: 99.8,
  avg_tps: 150.22,
}
/** `null` makes `/api/gift-stats` answer the 404 of a site without it. */
let giftStats: unknown = null

/** Months the public expense ledger returns in a test, newest first. */
function ledgerMonthsFixture(): unknown[] {
  return [
    {
      month: '2026-11',
      items: [
        {
          name: '域名',
          amount: 6.07,
          spread: { total: 72.83, months: 12, index: 2 },
        },
        { name: 'Upstream top-ups', amount: 185.6, automatic: true },
      ],
    },
    {
      month: '2026-10',
      items: [
        { name: '服务器', amount: 530 },
        { name: 'Upstream top-ups', amount: 589.39, automatic: true },
      ],
    },
    {
      month: '2026-09',
      items: [{ name: 'Upstream top-ups', amount: 275, automatic: true }],
    },
  ]
}

let ledgerMonths = ledgerMonthsFixture()

/** Token points for the last `count` days, one point per day. */
function monthPoints(count: number): { ts: string; tokens: number }[] {
  const first = dayjs().subtract(count - 1, 'day')
  return Array.from({ length: count }, (_, index) => ({
    ts: `${first.add(index, 'day').format('YYYY-MM-DD')}T00:00:00Z`,
    tokens: 1_000_000 * (index + 1),
  }))
}

function rankingsReply() {
  return {
    success: true,
    data: {
      models: models.map((model, index) => ({
        ...(model as Record<string, unknown>),
        total_requests: 100_000 + index,
      })),
      image_models: [],
      decision_models: [],
      models_history: {
        points: rankingDays.map((point) => ({
          ...point,
          label: '',
          model: 'deepseek-v4.1-flash',
          vendor: 'DeepSeek',
        })),
        models: [],
        buckets: rankingDays.length,
      },
    },
  }
}

beforeEach(() => {
  window.localStorage.clear()
  models = [MODEL]
  rankingDays = monthPoints(31)
  perfSummary = { avg_latency_ms: 9748, success_rate: 99.8, avg_tps: 150.22 }
  giftStats = null

  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/api/home_page_content') {
      return { data: { success: true, data: '' } }
    }
    if (url === '/api/pricing') {
      return {
        data: {
          success: true,
          data: models,
          vendors: [],
          supported_endpoint: {},
          group_ratio: {},
        },
      }
    }
    if (url === '/api/perf-metrics/summary') {
      return {
        data: {
          success: true,
          data: {
            summary: perfSummary,
            window_start: WINDOW_START,
            window_end: WINDOW_END,
            models: [MODEL],
          },
        },
      }
    }
    if (url === '/api/rankings') return { data: rankingsReply() }
    if (url === '/api/gift-stats') {
      if (giftStats === null) {
        throw Object.assign(new Error('Request failed with status code 404'), {
          response: { status: 404, data: {} },
        })
      }
      return { data: { success: true, data: giftStats } }
    }
    if (url === '/api/expense_ledger') {
      return {
        data: {
          success: true,
          data: {
            months: ledgerMonths,
            entered: [],
            prepaid: [],
          },
        },
      }
    }
    return { data: { success: true, data: {} } }
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
})

async function renderHome() {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queries.setQueryData(['status'], { system_name: 'DEMO' })
  const router = createRouter({
    routeTree: createRootRoute({ component: Home }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <ThemeProvider>
      <QueryClientProvider client={queries}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  )
  // The hero figures are the first thing the page settles on.
  await screen.findByText('Models available')
}

/** The figure a cell prints, without the line under it that states its window. */
function figureValue(label: string): string {
  const term = screen.getByText(label)
  const value = term.closest('div')?.querySelector('dd > p')
  if (!value) throw new Error(`no figure cell for "${label}"`)
  return value.textContent ?? ''
}

it('quotes the two models the price line names, not a hard-coded price', async () => {
  await renderHome()

  expect(screen.getByText('Per million tokens (input / output)')).toBeVisible()
  expect(screen.getByText('deepseek-v4.1-flash-x0.15')).toBeVisible()
  expect(screen.getByText('gpt-6.1-sol-x0.08')).toBeVisible()
})

it('leaves the gift block out when the site does not serve the gift ledger', async () => {
  await renderHome()

  expect(screen.queryByText('Generous rewards')).toBeNull()
  expect(screen.queryByText('How it is granted')).toBeNull()
})

it('prints the gift ledger, in the words the backend sent, when it is served', async () => {
  giftStats = {
    today: { amount: 0.6, count: 8 },
    week: { amount: 83.94, count: 150 },
    month: { amount: 199.37, count: 609 },
    sources: [
      {
        key: 'checkin',
        label: '签到',
        amount: 48.47,
        count: 474,
        note: '每人每天约 ¥0.10，早上签到直接进余额',
      },
    ],
  }
  await renderHome()

  expect(await screen.findByText('Generous rewards')).toBeVisible()
  expect(screen.getByText('签到')).toBeVisible()
  expect(screen.getByText('每人每天约 ¥0.10，早上签到直接进余额')).toBeVisible()
  expect(screen.getByText('8 entries')).toBeVisible()
})

it('prints a dash, not a zero, for every figure the APIs do not return', async () => {
  models = []
  rankingDays = []
  perfSummary = null
  await renderHome()

  expect(figureValue('Models available')).toBe('—')
  expect(figureValue('Success rate, last 24 h')).toBe('—')
  expect(figureValue('Requests, last 7 days')).toBe('—')
  expect(figureValue('Requests, last 30 days')).toBe('—')
  expect(figureValue('Requests per day')).toBe('—')
  expect(figureValue('Tokens per day')).toBe('—')
  expect(figureValue('Requests in flight, estimated')).toBe('—')
})

it('states the window a figure covers, and never when it was read', async () => {
  await renderHome()

  await waitFor(() =>
    expect(screen.getByText('Success rate, last 24 h')).toBeVisible()
  )
  expect(screen.queryByText(/read at/)).toBeNull()

  const start = dayjs(WINDOW_START * 1000).format('YYYY-MM-DD')
  const end = dayjs(WINDOW_END * 1000).format('YYYY-MM-DD')
  expect(screen.getAllByText(`${start} – ${end}`).length).toBeGreaterThan(0)
})

it('splits the 30-day totals into a day of traffic, and infers requests in flight', async () => {
  await renderHome()

  // 100k requests and 496M tokens over the 31 days the series covers.
  await waitFor(() => expect(figureValue('Requests per day')).toBe('3,226'))
  expect(figureValue('Tokens per day')).toBe('16M')
  // Rate 100,000/31 days times the 9.748s a request takes, to two decimals.
  expect(figureValue('Requests in flight, estimated')).toBe('0.36')
})

it('sends a visitor to the price list and a signed-in reader to the console', async () => {
  await renderHome()

  expect(
    screen.getByRole('link', { name: 'See prices and models' })
  ).toHaveAttribute('href', '/pricing')

  cleanup()
  const previous = useAuthStore.getState().auth
  useAuthStore.setState({
    auth: {
      ...previous,
      user: { id: 1, username: 'reader', role: 1 },
    },
  })
  await renderHome()

  expect(screen.getByRole('link', { name: 'Go to console' })).toHaveAttribute(
    'href',
    '/dashboard'
  )
})

it('draws one bar per day over the last 31 days', async () => {
  await renderHome()

  expect(
    document.querySelectorAll('[data-slot="home-chart-bar"]')
  ).toHaveLength(31)
  expect(document.querySelectorAll('[data-partial]')).toHaveLength(1)
})

it('prints the newest ledger month over a bar per month, not a hand-entered note', async () => {
  await renderHome()

  expect(await screen.findByText('Month total')).toBeVisible()
  const bars = document.querySelectorAll(
    '[data-slot="home-cost-series"] [title]'
  )
  expect(bars).toHaveLength(3)
  expect(bars[0]).toHaveAttribute(
    'title',
    expect.stringContaining('September 2026')
  )
  expect(bars[2]).toHaveAttribute(
    'title',
    expect.stringContaining('November 2026')
  )
  expect(screen.queryByText(/Entered by hand/)).toBeNull()
})

it('leaves the bar chart out when the ledger holds a single month', async () => {
  ledgerMonths = ledgerMonthsFixture().slice(0, 1)
  await renderHome()

  expect(await screen.findByText('Month total')).toBeVisible()
  expect(document.querySelector('[data-slot="home-cost-series"]')).toBeNull()
})
