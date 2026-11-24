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
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import type { DailyQuotaItem, QuotaDataItem } from '../../../types'
import { OverviewDashboard } from '../overview-dashboard'

let client: QueryClient
let account: AuthUser
let checkedToday: boolean
let checkinEnabled: boolean
let announcementsEnabled: boolean
let usageRows: QuotaDataItem[]
let usageFailed: boolean
let usagePending: boolean
let dailyRows: DailyQuotaItem[]
let budgetModels: Array<Record<string, unknown>>
let dailyFailed: boolean
let usageSource: {
  gift_used: number
  token_plan_used: number
  gift_plan_used: number
  gift_quota: number
  gift_remaining: number
  gift_known: boolean
}
let usageSourceFailed: boolean
const awarded = 43_550

beforeEach(() => {
  localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  account = {
    id: 1,
    username: 'root',
    display_name: 'Root User',
    role: 100,
    group: 'default',
    quota: 500_000_000,
    used_quota: 8_500_000,
    request_count: 2276,
    usage_level: {
      level: 2,
      next_level_quota: 25_000_000,
      remaining_quota: 16_500_000,
      progress: 17.5,
    },
  }
  useAuthStore.getState().auth.setUser(account)
  checkedToday = true
  checkinEnabled = true
  announcementsEnabled = false
  usageFailed = false
  usagePending = false
  dailyFailed = false
  usageSourceFailed = false
  usageSource = {
    gift_used: 100_000_000,
    token_plan_used: 25_000_000,
    gift_plan_used: 125_000_000,
    gift_quota: 400_000_000,
    gift_remaining: 100_000_000,
    gift_known: true,
  }
  dailyRows = [
    { date: dayKeyFromNow(1), token_used: 1200, quota: 100_000 },
    { date: dayKeyFromNow(10), token_used: 400, quota: 50_000 },
  ]
  usageRows = [
    {
      created_at: Math.floor(Date.now() / 3_600_000) * 3600,
      quota: 100_000,
      count: 10,
    },
    {
      created_at: Math.floor(Date.now() / 3_600_000) * 3600,
      quota: 50_000,
      count: 4,
    },
  ]
  budgetModels = [
    {
      model: 'deepseek-v4.1-flash-x0.1',
      limit: 200000000,
      used: 50000000,
      remaining: 150000000,
      unlimited: false,
      resets_at: 1792339200,
    },
  ]
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/user/self/model-daily-tokens') {
      return {
        data: {
          success: true,
          data: {
            models: budgetModels,
            updated_at: 1792300000,
            resets_at: 1792339200,
            timezone: 'Asia/Shanghai',
          },
        },
      }
    }
    if (url === '/api/status') {
      return {
        data: {
          success: true,
          data: {
            checkin_enabled: checkinEnabled,
            api_info_enabled: false,
            announcements_enabled: announcementsEnabled,
            faq_enabled: false,
            uptime_kuma_enabled: false,
          },
        },
      }
    }
    if (url === '/api/token/?p=1&size=10') {
      return {
        data: {
          success: true,
          data: { items: [{ id: 1, name: 'Coding key', status: 1 }], total: 1 },
        },
      }
    }
    if (url === '/api/token/plan') {
      return {
        data: {
          success: true,
          data: {
            token_id: 10,
            masked_key: 'sk-tp_****test',
            level: 2,
            base_quota: 500000,
            multiplier: 1,
            coupon_count: 0,
            coupon_expires_at: 0,
            personal_cycle: false,
            total_quota: 500000,
            used_quota: 0,
            remaining_quota: 500000,
            week_start: 0,
            resets_at: 1791734400,
          },
        },
      }
    }
    if (url === '/api/user/self') {
      return { data: { success: true, data: account } }
    }
    if (url === '/api/user/self/usage-source') {
      if (usageSourceFailed) throw new Error('Usage source unavailable')
      return { data: { success: true, data: usageSource } }
    }
    if (url === '/api/data/self') {
      if (usagePending) return await new Promise(() => {})
      if (usageFailed) throw new Error('Usage unavailable')
      return {
        data: {
          success: true,
          data: usageRows,
        },
      }
    }
    if (url === '/api/data/self/daily') {
      if (dailyFailed) throw new Error('Daily usage unavailable')
      return {
        data: {
          success: true,
          data: dailyRows,
        },
      }
    }
    if (String(url).startsWith('/api/log/self?')) {
      return {
        data: {
          success: true,
          data: {
            items: [
              {
                id: 1,
                model_name: 'example-model',
                created_at: Date.now() / 1000,
                quota: 10,
                prompt_tokens: 20,
                completion_tokens: 5,
              },
            ],
          },
        },
      }
    }
    if (String(url).startsWith('/api/user/checkin?')) {
      return {
        data: {
          success: true,
          data: {
            enabled: true,
            stats: {
              checked_in_today: checkedToday,
              total_checkins: 5,
              total_quota: awarded,
              records: [],
            },
          },
        },
      }
    }
    if (url === '/api/perf-metrics/summary') {
      return {
        data: {
          success: true,
          data: {
            summary: { success_rate: 100, avg_latency_ms: 2590, avg_tps: 41.7 },
            models: [],
          },
        },
      }
    }
    throw new Error(`Unexpected overview request: ${url}`)
  })
  vi.spyOn(api, 'post').mockImplementation(async (url) => {
    if (url !== '/api/user/checkin') {
      throw new Error(`Unexpected overview mutation: ${url}`)
    }
    checkedToday = true
    return { data: { success: true, data: { quota_awarded: awarded } } }
  })
})

afterEach(() => {
  client.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  localStorage.clear()
})

// Asia/Shanghai day keys keep the fixtures inside the calendar window.
function dayKeyFromNow(daysAgo: number): string {
  const date = new Date(Date.now() + 8 * 3_600_000 - daysAgo * 86_400_000)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

async function renderOverview() {
  const router = createRouter({
    routeTree: createRootRoute({ component: OverviewDashboard }),
    history: createMemoryHistory(),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByText('Coding key')
  return userEvent.setup()
}

it('places account and daily activity before recent requests and omits retired features', async () => {
  await renderOverview()
  const accountRegion = screen.getByRole('region', { name: 'Account' })
  const heatmap = await screen.findByRole('region', { name: 'Daily activity' })
  const recent = screen.getByRole('heading', { name: 'Recent requests' })
  expect(
    accountRegion.compareDocumentPosition(heatmap) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  expect(
    heatmap.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  expect(
    screen.queryByRole('region', { name: 'Token Plan' })
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: 'Model usage limits' })
  ).toBeVisible()
})

it('gives the account row the full width when no model has a daily limit', async () => {
  budgetModels = []
  await renderOverview()

  expect(
    screen.queryByRole('heading', { name: 'Model usage limits' })
  ).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Credit remaining' })).toHaveClass(
    'lg:col-span-2'
  )
})

it('combines account identity and balance without a level bar, runway or a wallet action', async () => {
  await renderOverview()
  const balance = screen.getByRole('region', { name: 'Credit remaining' })
  expect(within(balance).getByRole('region', { name: 'Account' })).toBeVisible()
  expect(
    within(balance).queryByRole('group', { name: 'Usage level' })
  ).not.toBeInTheDocument()
  expect(
    within(balance).queryByRole('progressbar', { name: 'Level progress' })
  ).not.toBeInTheDocument()
  expect(within(balance).queryByText('Runway')).not.toBeInTheDocument()
  expect(
    within(balance).queryByRole('button', { name: 'Top-up' })
  ).not.toBeInTheDocument()
})

it('fits the account identity and the prominent balance in the four-metric summary', async () => {
  await renderOverview()
  const card = screen.getByRole('region', { name: 'Credit remaining' })
  const balance = within(card)
  expect(balance.getByText('Root User')).toHaveClass('text-sm', 'truncate')
  expect(balance.getByText('@root')).toHaveClass('text-[11px]', 'truncate')
  const amount = balance.getByLabelText('$1,000.00')
  expect(amount).toHaveClass('lg:text-3xl', 'tabular-nums')
  const footer = card.querySelector('dl')
  expect(footer).toHaveClass('grid-cols-2', 'lg:grid-cols-4')
  expect(card.querySelectorAll('dd')).toHaveLength(4)
})

it('states the gift share under the remaining credit and opens its breakdown', async () => {
  const user = await renderOverview()
  const card = screen.getByRole('region', { name: 'Credit remaining' })
  const trigger = await within(card).findByRole('button', {
    name: 'Gift credit $200.00',
  })
  await user.click(trigger)

  const details = await screen.findByRole('dialog', { name: 'Quota details' })
  expect(within(details).getByText('Credit remaining')).toBeVisible()
  expect(within(details).getByText('$1,000.00')).toBeVisible()
  expect(within(details).getByText('Gift credit')).toBeVisible()
  expect(within(details).getByText('$200.00')).toBeVisible()
  expect(within(details).getByText('Paid balance')).toBeVisible()
  expect(within(details).getByText('$800.00')).toBeVisible()
})

it('says the gift figure is untraceable instead of presenting it as zero', async () => {
  usageSource = {
    gift_used: 0,
    token_plan_used: 25_000_000,
    gift_plan_used: 25_000_000,
    gift_quota: 0,
    gift_remaining: 0,
    gift_known: false,
  }
  const user = await renderOverview()
  const card = screen.getByRole('region', { name: 'Credit remaining' })
  const trigger = await within(card).findByRole('button', {
    name: 'Gift credit · Untraceable',
  })
  await user.click(trigger)

  const details = await screen.findByRole('dialog', { name: 'Quota details' })
  expect(within(details).getByText('Untraceable')).toBeVisible()
  expect(within(details).queryByText('$0.00')).not.toBeInTheDocument()
})

it('keeps the overview intact without the gift line when the breakdown is unavailable', async () => {
  usageSourceFailed = true
  await renderOverview()
  const card = screen.getByRole('region', { name: 'Credit remaining' })
  expect(within(card).getByLabelText('$1,000.00')).toBeVisible()
  expect(
    within(card).queryByRole('button', { name: /^Gift credit/ })
  ).not.toBeInTheDocument()
})

it('keeps the requested calendar and switches between tokens and quota', async () => {
  const user = await renderOverview()
  const heatmap = await screen.findByRole('region', {
    name: 'Daily activity',
  })
  const table = within(heatmap).getByRole('table')
  // The quiet days keep their own cells, so the calendar spans the whole
  // requested period instead of shrinking to the recorded days.
  expect(within(table).getAllByRole('row').length).toBeGreaterThan(50)
  const activeDay = within(heatmap).getByLabelText(/: 1,200 Tokens$/)
  expect(activeDay).toBeVisible()
  expect(activeDay).toHaveClass('max-w-none')
  expect(within(heatmap).getByLabelText(/: 400 Tokens$/)).toBeVisible()

  const quotaToggle = within(heatmap).getByRole('tab', {
    name: 'Quota usage',
  })
  expect(quotaToggle).toHaveAttribute('aria-selected', 'false')
  await user.click(quotaToggle)
  expect(quotaToggle).toHaveAttribute('aria-selected', 'true')
  expect(within(heatmap).getByLabelText(/: \$0\.20$/)).toBeVisible()
  expect(
    within(heatmap).queryByLabelText(/: 1,200 Tokens$/)
  ).not.toBeInTheDocument()
})

it('shows a muted cell on days without recorded usage', async () => {
  await renderOverview()
  const heatmap = await screen.findByRole('region', {
    name: 'Daily activity',
  })
  const emptyDays = within(heatmap).getAllByRole('button', {
    name: /: 0 Tokens$/,
  })
  expect(emptyDays.length).toBeGreaterThan(30)
  expect(emptyDays[0]).toHaveClass('bg-muted', 'border-0')
})

it('shows an empty state instead of a fabricated calendar when nothing was recorded', async () => {
  dailyRows = []
  await renderOverview()
  const heatmap = await screen.findByRole('region', {
    name: 'Daily activity',
  })
  expect(within(heatmap).getByRole('status')).toHaveTextContent(
    'No activity yet'
  )
  expect(within(heatmap).queryByRole('table')).not.toBeInTheDocument()
})

it('shows a retryable daily activity error and recovers when the usage service responds', async () => {
  dailyFailed = true
  const user = await renderOverview()
  const heatmap = await screen.findByRole('region', {
    name: 'Daily activity',
  })
  const retry = await within(heatmap).findByRole('button', { name: 'Retry' })
  expect(within(heatmap).queryByRole('table')).not.toBeInTheDocument()
  dailyFailed = false
  await user.click(retry)
  expect(await within(heatmap).findByRole('table')).toBeVisible()
})

it('shows cumulative consumption once without the level milestones', async () => {
  await renderOverview()
  expect(
    screen.queryByRole('group', { name: 'Usage level' })
  ).not.toBeInTheDocument()
  expect(screen.getAllByText('Total consumption')).toHaveLength(1)
  expect(
    screen.queryByRole('list', { name: 'Level thresholds' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText(
      'Grow with your paid consumption. Gifted balance and check-ins do not count.'
    )
  ).not.toBeInTheDocument()
})

it('keeps the calendar out of the overview until the user opens check-in details', async () => {
  const user = await renderOverview()
  expect(
    screen.queryByRole('heading', { level: 4, name: /^\d{4}-\d{2}$/ })
  ).not.toBeInTheDocument()
  const checkin = (
    await screen.findByRole('heading', { name: 'Daily Check-in' })
  ).closest('[data-slot="checkin-column"]')
  expect(checkin).not.toBeNull()
  await user.click(
    within(checkin as HTMLElement).getByRole('button', {
      name: 'Check-in records',
    })
  )
  const dialog = await screen.findByRole('dialog', { name: 'Daily Check-in' })
  expect(
    within(dialog).getByRole('heading', { level: 4, name: /^\d{4}-\d{2}$/ })
  ).toBeVisible()
})

it('allows an unchecked account to check in without opening the records dialog', async () => {
  checkedToday = false
  const user = await renderOverview()
  const checkin = await screen.findByRole('button', { name: 'Check in now' })
  await user.click(checkin)
  expect(
    await screen.findByRole('button', { name: 'Checked in' })
  ).toBeDisabled()
  expect(api.post).toHaveBeenCalledWith('/api/user/checkin')
  expect(
    screen.queryByRole('dialog', { name: 'Daily Check-in' })
  ).not.toBeInTheDocument()
})

it('omits the sidebar and its network calls when check-in is disabled for an ordinary account', async () => {
  checkinEnabled = false
  account.role = 1
  useAuthStore.getState().auth.setUser(account)
  await renderOverview()
  expect(
    screen.queryByRole('button', { name: 'Daily Check-in' })
  ).not.toBeInTheDocument()
  expect(screen.queryByText('Performance health')).not.toBeInTheDocument()
  expect(api.get).not.toHaveBeenCalledWith(
    '/api/perf-metrics/summary',
    expect.anything()
  )
  for (const button of screen.getAllByRole('button', {
    name: 'Quick import',
  })) {
    expect(button).toBeEnabled()
  }
})

it.each([
  ['zhCN', '周日'],
  ['zhTW', '週日'],
  ['en', 'Sun'],
  ['fr', 'dim.'],
  ['ja', '日'],
  ['ru', 'вс'],
  ['vi', 'CN'],
  ['bad_locale', 'Sun'],
])(
  'renders check-in weekdays for %s and updates them after switching language',
  async (language, sunday) => {
    // Keep English UI keys while exercising the actual interface locale.
    i18next.addResourceBundle(language, 'translation', {
      'Daily Check-in': 'Daily Check-in',
    })
    await act(async () => {
      await i18next.changeLanguage(language)
    })
    try {
      const user = await renderOverview()
      const column = (
        await screen.findByRole('heading', { name: 'Daily Check-in' })
      ).closest('[data-slot="checkin-column"]') as HTMLElement
      await user.click(
        within(column).getByRole('button', { name: 'Check-in records' })
      )
      expect(
        (await screen.findAllByText(sunday, { exact: true }))[0]
      ).toBeVisible()
      await act(async () => {
        await i18next.changeLanguage('en')
      })
      expect(
        (await screen.findAllByText('Sun', { exact: true }))[0]
      ).toBeVisible()
      expect(
        screen.queryByText('You can only check in once per day')
      ).not.toBeInTheDocument()
    } finally {
      await act(async () => {
        await i18next.changeLanguage('en')
      })
      if (language !== 'en') {
        i18next.removeResourceBundle(language, 'translation')
      }
    }
  }
)

it('keeps long identity text and large balances bounded with complete values available', async () => {
  account.display_name = 'DEMO Enterprise Workspace with a long account name'
  account.group = 'production-team-with-a-long-name'
  account.quota = 617_283_945_000
  useAuthStore.getState().auth.setUser(account)
  await renderOverview()
  const card = screen.getByRole('region', { name: 'Credit remaining' })
  expect(within(card).getByText(account.display_name)).toHaveAttribute(
    'title',
    account.display_name
  )
  expect(
    within(card).getByText('@root · production-team-with-a-long-name')
  ).toHaveClass('truncate')
  // The figure is one unbreakable token at the analytics size; the full amount
  // stays in the accessible name instead of being clipped to an ellipsis.
  const balance = within(card).getByLabelText('$1,234,567.89')
  expect(balance).toHaveClass(
    'whitespace-nowrap',
    'tabular-nums',
    'lg:text-3xl'
  )
  expect(balance).toHaveTextContent('$1,234,567.89')
})

it('shows a zero balance without clearing previous consumption', async () => {
  account.quota = 0
  useAuthStore.getState().auth.setUser(account)
  await renderOverview()
  const card = screen.getByRole('region', { name: 'Credit remaining' })
  expect(within(card).getByLabelText('$0.00')).toHaveClass('text-destructive')
  expect(within(card).getByText('$17.00')).toBeVisible()
})

it('keeps usage placeholders while loading instead of presenting a fabricated zero', async () => {
  usagePending = true
  await renderOverview()
  const card = screen.getByRole('region', { name: 'Credit remaining' })
  const value = within(card).getByText('24h usage').nextElementSibling
  expect(value?.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
  expect(value).not.toHaveTextContent('$0')
  expect(within(card).getByLabelText('$1,000.00')).toBeVisible()
})

it('retries a failed usage statistic from the keyboard while preserving account values', async () => {
  usageFailed = true
  const user = await renderOverview()
  const card = screen.getByRole('region', { name: 'Credit remaining' })
  const retry = await within(card).findByRole('button', { name: 'Retry' })
  expect(within(card).getByLabelText('$1,000.00')).toBeVisible()
  expect(within(card).getByText('$17.00')).toBeVisible()
  const value = within(card).getByText('24h usage').nextElementSibling
  expect(value).toHaveTextContent('—')
  usageFailed = false
  retry.focus()
  await user.keyboard('{Enter}')
  expect(await within(card).findByText('$0.30')).toBeVisible()
  expect(
    within(card).queryByRole('button', { name: 'Retry' })
  ).not.toBeInTheDocument()
})

it('places announcements after requests and API keys outside the two-column row', async () => {
  announcementsEnabled = true
  await renderOverview()
  const keys = screen.getByRole('heading', { name: /API Keys/ })
  const column = keys.closest('[data-slot="overview-tools-column"]')
  const announcement = await screen.findByText('Announcements')
  const requests = screen.getByRole('heading', { name: 'Recent requests' })
  expect(column?.parentElement).not.toContainElement(announcement)
  expect(
    requests.compareDocumentPosition(announcement) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  expect(
    keys.compareDocumentPosition(announcement) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
})
