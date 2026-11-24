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
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { Finance } from '..'
import { monthBalance, totalGift, totalTopUp } from '../lib'
import type { UpstreamAccount } from '../types'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { to: string; children: React.ReactNode }) => (
    <a href={props.to}>{props.children}</a>
  ),
}))

vi.mock('@visactor/react-vchart', () => ({
  VChart: (props: { spec: { data: { values: unknown[] }[] } }) => (
    <div data-testid='chart' data-points={props.spec.data[0].values.length} />
  ),
}))

const MONTHS = [
  {
    month: '2026-10',
    online_topup: 300,
    manual_topup: 50,
    gift_manual: 20,
    gift_checkin: 5.5,
    gift_redemption: 10,
    gift_event: 1.25,
    expenses: 410,
  },
  {
    month: '2026-09',
    online_topup: 120,
    manual_topup: 0,
    gift_manual: 0,
    gift_checkin: 3,
    gift_redemption: 0,
    gift_event: 0,
    expenses: 100,
  },
]

const DAILY_DAYS = [
  {
    date: '2026-10-12',
    online_topup: 300,
    manual_topup: 50,
    expenses: 410,
    gift: 20,
    plan_free: 10,
    gift_consumed: 4,
    consumption: 120,
    new_users: 2,
  },
  {
    date: '2026-10-13',
    online_topup: 0,
    manual_topup: 0,
    expenses: 0,
    gift: 0,
    plan_free: 5,
    gift_consumed: 0,
    consumption: 80,
    new_users: 1,
  },
]
let dailyDays: typeof DAILY_DAYS = DAILY_DAYS
const dailyRequests: { start_timestamp: number; end_timestamp: number }[] = []

const OPERATIONS = {
  wallet: {
    users: 3,
    balance: 120.5,
    paid: 80,
    gift: 30,
    as_of: 1,
  },
  consumption: {
    total: 60,
    plan_free: 18,
    gift_consumed: 12,
    wallet: 42,
    start: 1,
    end: 2,
  },
  token_plan: {
    users: 3,
    activated_users: 2,
    total_quota: 300,
    used_quota: 120,
    reserved_quota: 20,
    remaining_quota: 160,
    wallet_used: 9,
    as_of: 1,
  },
}

const RESERVES = {
  as_of: 1,
  baseline: { amount: 600, scope: 'all_history' as const, as_of: 1 },
  daily: {
    window_days: 7,
    horizon_days: 3,
    window_start: 1,
    window_end: 2,
    cost: 210,
    daily_average: 30,
    target: 90,
    gap: 0,
    excess: 510,
    complete: true,
    has_reports: true,
    accounts: [
      {
        id: 1,
        name: 'OpenAI main',
        provider: 'openai',
        usage_7d: 30,
        cost: 210,
        included: true,
        status: 'ok' as const,
        window_end: 2,
        checked_at: 1,
      },
    ],
    missing_accounts: [] as string[],
    stale_accounts: [] as string[],
    subscription_accounts: 0,
  },
  extreme: {
    horizon_days: 3,
    wallet: 120.5,
    plan_remaining: 160,
    face_value: 280.5,
    target: 280.5,
    gap: 0,
    excess: 319.5,
    complete: true,
  },
}

const ACCOUNTS: UpstreamAccount[] = [
  {
    id: 1,
    name: 'OpenAI main',
    provider: 'openai',
    base_url: '',
    balance_channel_id: 0,
    manual_balance: 5,
    manual_balance_updated_at: 1,
    usage_7d: 70,
    usage_window_start: 1,
    usage_window_end: 2,
    usage_checked_at: 1,
    usage_status: 'ok',
    usage_error: '',
    created_at: 1,
    updated_at: 1,
    balance: 5,
    balance_source: 'api',
    balance_updated_at: 1,
    remote_balance_at: 1,
    balance_error: '',
    currency: 'CNY',
    exchange_rate: 1,
    topup_count: 0,
    topup_total: 0,
    topup_checked_at: 0,
    balance_stale: false,
    daily_average: 10,
    target_3d: 30,
    gap: 25,
    has_credential: true,
  },
  {
    id: 2,
    name: 'Anthropic pooled',
    provider: 'anthropic',
    base_url: '',
    balance_channel_id: 0,
    manual_balance: null,
    manual_balance_updated_at: 0,
    usage_7d: 0,
    usage_window_start: 0,
    usage_window_end: 0,
    usage_checked_at: 0,
    usage_status: 'error',
    usage_error: 'the provider does not expose this cost report',
    created_at: 2,
    updated_at: 2,
    balance: null,
    balance_source: 'none',
    balance_updated_at: 0,
    remote_balance_at: 0,
    balance_error: '',
    currency: 'CNY',
    exchange_rate: 1,
    topup_count: 0,
    topup_total: 0,
    topup_checked_at: 0,
    balance_stale: false,
    daily_average: null,
    target_3d: null,
    gap: null,
    has_credential: true,
  },
]
let operations = OPERATIONS
let accounts = ACCOUNTS
let reserves = RESERVES

beforeEach(() => {
  dailyDays = DAILY_DAYS
  dailyRequests.length = 0
  operations = OPERATIONS
  accounts = ACCOUNTS
  reserves = RESERVES
  vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
    if (url === '/api/finance/daily') {
      const params = config?.params as {
        start_timestamp: number
        end_timestamp: number
      }
      dailyRequests.push(params)
      return {
        data: {
          success: true,
          data: { days: dailyDays },
        },
      }
    }
    if (url === '/api/finance/operations') {
      return { data: { success: true, data: operations } }
    }
    if (url === '/api/finance/reserves') {
      return { data: { success: true, data: reserves } }
    }
    if (url === '/api/finance/upstream_accounts') {
      return { data: { success: true, data: { items: accounts } } }
    }
    if (url !== '/api/finance/summary') {
      throw new Error(`Unexpected request: ${url}`)
    }
    return {
      data: {
        success: true,
        data: {
          months: MONTHS,
          excluded_users: 2,
          total: {
            online_topup: 900,
            manual_topup: 100,
            gift_manual: 0,
            gift_checkin: 0,
            gift_redemption: 0,
            gift_event: 0,
            expenses: 400,
          },
        },
      },
    }
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('adds top-ups and gifts up and leaves gifts out of the net', () => {
  expect(totalTopUp(MONTHS[0])).toBe(350)
  expect(totalGift(MONTHS[0])).toBe(36.75)
  expect(monthBalance(MONTHS[0])).toBe(-60)
  expect(monthBalance(MONTHS[1])).toBe(20)
})

it('lists one row per month with the money and gift split', async () => {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Finance />
    </QueryClientProvider>
  )

  const monthly = await screen.findByRole('region', {
    name: 'Monthly breakdown',
  })
  expect(within(monthly).getByText('October 2026')).toBeVisible()
  const monthTable = within(monthly).getByRole('table')
  expect(within(monthTable).getAllByRole('row')).toHaveLength(3)
  expect(within(monthTable).getByText('Expense month')).toBeVisible()
  expect(screen.getByText(/leave out 2 accounts/)).toBeTruthy()
})

it('shows daily income and expenses and a wider range on request', async () => {
  const user = userEvent.setup()
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Finance />
    </QueryClientProvider>
  )

  const daily = await screen.findByRole('region', {
    name: 'Daily overview',
  })
  // Income is money received: the checkout payment plus the paid offline one.
  expect(within(daily).getByText(/350\.00/)).toBeTruthy()
  expect(within(daily).getByText(/410\.00/)).toBeTruthy()
  expect(within(daily).getByText(/-.*60\.00/)).toBeTruthy()
  // Gifts are quota given away that day, not money; consumption is what users
  // were charged, and new users are a count.
  expect(within(daily).getByText(/20\.00/)).toBeTruthy()
  expect(within(daily).getByText(/200\.00/)).toBeTruthy()
  expect(within(daily).getByText(/^3$/)).toBeTruthy()

  const monthly = dailyRequests[0]
  expect(monthly.end_timestamp - monthly.start_timestamp).toBeLessThan(
    32 * 86400
  )
  await user.click(within(daily).getByRole('tab', { name: 'Last 90 days' }))
  await screen.findByRole('region', { name: 'Daily overview' })
  await vi.waitFor(() => expect(dailyRequests).toHaveLength(2))
  const wider = dailyRequests[1]
  expect(wider.end_timestamp - wider.start_timestamp).toBeGreaterThan(
    88 * 86400
  )
})

it('plots only the days that hold figures instead of the empty range', async () => {
  // Two dead days at the start of the window: the chart starts one day before
  // the first figure, not at the range boundary.
  const emptyDay = {
    ...DAILY_DAYS[0],
    online_topup: 0,
    manual_topup: 0,
    expenses: 0,
    gift: 0,
    plan_free: 0,
    consumption: 0,
    new_users: 0,
  }
  dailyDays = [
    { ...emptyDay, date: '2026-10-01' },
    { ...emptyDay, date: '2026-10-02' },
    ...DAILY_DAYS,
  ]
  renderFinance()

  const daily = await screen.findByRole('region', {
    name: 'Daily overview',
  })
  // Three plotted days (one zero baseline plus the two with figures) and three
  // money series: income, spending and the quota given away.
  expect(
    (await within(daily).findAllByTestId('chart'))[0].getAttribute(
      'data-points'
    )
  ).toBe('9')
})

it('says so when the range has neither income nor expenses', async () => {
  dailyDays = []
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Finance />
    </QueryClientProvider>
  )

  const daily = await screen.findByRole('region', {
    name: 'Daily overview',
  })
  expect(
    await within(daily).findByText('No income or expenses in this period.')
  ).toBeVisible()
  expect(within(daily).queryAllByTestId('chart')).toHaveLength(0)
})

function renderFinance() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Finance />
    </QueryClientProvider>
  )
}

it('splits the wallet and lists the reserve target of each funding pool', async () => {
  renderFinance()

  const overview = await screen.findByRole('region', {
    name: 'Operations overview',
  })
  expect(await within(overview).findByText('Ordinary users')).toBeVisible()
  expect(within(overview).getByText(/120\.50/)).toBeVisible()
  expect(within(overview).getByText(/30\.00/)).toBeVisible()
  // The wallet row of the consumption list is what the wallet paid, not a
  // subscription fee.
  expect(within(overview).getByText('Wallet balance spent')).toBeVisible()
  expect(within(overview).getByText(/42\.00/)).toBeVisible()

  const upstream = await screen.findByRole('region', {
    name: 'Upstream funding accounts',
  })
  expect(
    await within(upstream).findByText(
      '1 accounts are below the three-day reserve target.'
    )
  ).toBeVisible()
  expect(within(upstream).getByText('OpenAI main')).toBeVisible()
  expect(within(upstream).getByText(/25\.00/)).toBeVisible()
  // A balance read from the gateway names its own source.
  expect(within(upstream).getByText('API balance')).toBeVisible()
  // Without a balance the target is unknown instead of guessed.
  expect(within(upstream).getByText('Anthropic pooled')).toBeVisible()
  expect(within(upstream).getByText('Refresh failed')).toBeVisible()
  // The failure reason is shown in the reader's language.
  expect(
    within(upstream).getByText('The provider does not expose a cost report.')
  ).toBeVisible()
})

it('shows an honest empty state when no funding pool is recorded', async () => {
  accounts = []
  renderFinance()

  const upstream = await screen.findByRole('region', {
    name: 'Upstream funding accounts',
  })
  expect(
    await within(upstream).findByText(
      'No upstream accounts yet. Add the pools you fund.'
    )
  ).toBeVisible()
  expect(
    within(upstream).queryByText('below the three-day reserve target')
  ).toBeNull()
})

it('shows pool credits, partial observations and rounded subscription replenishment', async () => {
  accounts = [
    {
      ...ACCOUNTS[0],
      name: 'CommandCode pool',
      provider: 'commandcode',
      balance: 5,
      balance_source: 'pool',
      usage_7d: 14,
      target_3d: 18,
      gap: 13,
      topup_count: 2,
      topup_total: 45,
      pool: {
        observed_days: 1.5,
        usage_complete: false,
        usage_estimated: false,
        target_estimated: true,
        window_usage: 7,
        wallet_balance: 40,
        unknown_count: 1,
        stale_count: 0,
        plans: [
          {
            plan: 'go',
            count: 1,
            enabled: 1,
            cost_cny: 10,
            weekly_cap: 6,
            available: 5,
          },
          {
            plan: 'goat',
            count: 1,
            enabled: 0,
            cost_cny: 35,
            weekly_cap: 35,
            available: 0,
          },
        ],
      },
    },
  ]
  renderFinance()
  const section = await screen.findByRole('region', {
    name: 'Upstream funding accounts',
  })
  const row = await within(section).findByRole('row', {
    name: /CommandCode pool/,
  })
  expect(within(row).getByText('5 credits')).toBeVisible()
  expect(within(row).getByText('14 credits')).toBeVisible()
  expect(
    within(row).getByText('Go: 1 / 1 enabled · Goat: 0 / 1 enabled')
  ).toBeVisible()
  expect(within(row).getByText('1.5/7 days')).toBeVisible()
  expect(within(row).getByText('Estimated')).toBeVisible()
  // Only the gap carries the subscription equivalent; every other amount is a
  // single number.
  expect(within(row).getByText('18 credits')).toBeVisible()
  expect(within(row).getByText('13 credits')).toBeVisible()
  expect(within(row).getByText('2.17go/0.37goat')).toBeVisible()
  expect(within(row).queryByText('Wallet credit: 40')).toBeNull()
  expect(
    within(row).queryByText('Current weekly windows: 7 credits')
  ).toBeNull()
  expect(
    within(row).queryByText(
      'Estimated from observed usage or current weekly windows'
    )
  ).toBeNull()
  expect(within(row).queryByText(/\(weekly quota\)/)).toBeNull()
  expect(
    within(row).getByText('1 accounts have unknown plans or unavailable quota.')
  ).toBeVisible()
  expect(
    within(row).getByRole('button', { name: 'Subscription purchases' })
  ).toBeEnabled()
})

it('adds a CommandCode source without asking for an upstream credential', async () => {
  const user = userEvent.setup()
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, data: { id: 3 } } })
  renderFinance()
  await user.click(await screen.findByRole('button', { name: 'Add account' }))
  const dialog = screen.getByRole('dialog')
  await user.selectOptions(
    within(dialog).getByLabelText('Provider'),
    'commandcode'
  )
  expect(within(dialog).queryByLabelText('Admin key')).not.toBeInTheDocument()
  expect(within(dialog).queryByLabelText('Base URL')).not.toBeInTheDocument()
  expect(
    within(dialog).queryByLabelText('Manual balance (USD)')
  ).not.toBeInTheDocument()
  await user.type(
    within(dialog).getByLabelText('Account name'),
    'CommandCode pool'
  )
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))
  expect(post).toHaveBeenCalledWith(
    '/api/finance/upstream_accounts',
    expect.objectContaining({
      provider: 'commandcode',
      credential: '',
      currency: 'CNY',
    })
  )
})

it('asks for a refresh token and a provider address for codex789', async () => {
  const user = userEvent.setup()
  renderFinance()
  await user.click(await screen.findByRole('button', { name: 'Add account' }))
  const dialog = screen.getByRole('dialog')
  await user.selectOptions(
    within(dialog).getByLabelText('Provider'),
    'codex789'
  )
  // The credential is the panel's refresh token, never a model API key.
  expect(within(dialog).getByLabelText('Refresh token')).toBeVisible()
  expect(within(dialog).queryByLabelText('Admin key')).not.toBeInTheDocument()
  expect(
    within(dialog).getByPlaceholderText(
      'Provider address, for example https://provider.example.test'
    )
  ).toBeVisible()
  // The wallet is read from the panel, so no channel is picked by hand.
  expect(
    within(dialog).queryByLabelText('Balance channel')
  ).not.toBeInTheDocument()
})

it('saves a codex789 account with its provider address and refresh token', async () => {
  const user = userEvent.setup()
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, data: { id: 3 } } })
  renderFinance()
  await user.click(await screen.findByRole('button', { name: 'Add account' }))
  const dialog = screen.getByRole('dialog')
  await user.selectOptions(
    within(dialog).getByLabelText('Provider'),
    'codex789'
  )
  await user.type(
    within(dialog).getByLabelText('Account name'),
    'island AI Coding'
  )
  await user.type(
    within(dialog).getByLabelText('Refresh token'),
    'refresh-token-value'
  )
  await user.type(
    within(dialog).getByLabelText('Base URL'),
    'https://provider.example.test'
  )
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))
  expect(post).toHaveBeenCalledWith(
    '/api/finance/upstream_accounts',
    expect.objectContaining({
      provider: 'codex789',
      base_url: 'https://provider.example.test',
      credential: 'refresh-token-value',
      // The panel prices in USD and a $10 code costs about ¥10.3, so the
      // dialog books the payments at that rate.
      currency: 'USD',
      exchange_rate: 1.03,
    })
  )
})

it('refuses to save a codex789 account without an address or a refresh token', async () => {
  const user = userEvent.setup()
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, data: { id: 3 } } })
  renderFinance()
  await user.click(await screen.findByRole('button', { name: 'Add account' }))
  const dialog = screen.getByRole('dialog')
  await user.selectOptions(
    within(dialog).getByLabelText('Provider'),
    'codex789'
  )
  await user.type(
    within(dialog).getByLabelText('Account name'),
    'island AI Coding'
  )
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))
  expect(post).not.toHaveBeenCalled()
  await user.type(
    within(dialog).getByLabelText('Base URL'),
    'https://provider.example.test'
  )
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))
  expect(post).not.toHaveBeenCalled()
})

it('saves an OpenLux account with the account id and its access token', async () => {
  const user = userEvent.setup()
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, data: { id: 4 } } })
  renderFinance()
  await user.click(await screen.findByRole('button', { name: 'Add account' }))
  const dialog = screen.getByRole('dialog')
  await user.selectOptions(within(dialog).getByLabelText('Provider'), 'openlux')
  // OpenLux reads the user APIs with the account id beside the token, so the
  // field asks for both instead of a bare key.
  expect(
    within(dialog).getByLabelText('Account id and access token')
  ).toBeVisible()
  await user.type(within(dialog).getByLabelText('Account name'), 'OpenLux')
  await user.type(
    within(dialog).getByLabelText('Account id and access token'),
    '42:olux-token'
  )
  await user.type(
    within(dialog).getByLabelText('Base URL'),
    'https://gateway.example'
  )
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))
  expect(post).toHaveBeenCalledWith(
    '/api/finance/upstream_accounts',
    expect.objectContaining({
      provider: 'openlux',
      base_url: 'https://gateway.example',
      credential: '42:olux-token',
      // OpenLux charges in USD; the rate is the operator's to correct.
      currency: 'USD',
      exchange_rate: 6.69,
    })
  )
})

it('labels an OpenLux account by its own provider and offers its receipts', async () => {
  accounts = [{ ...ACCOUNTS[0], name: 'OpenLux main', provider: 'openlux' }]
  renderFinance()

  const upstream = await screen.findByRole('region', {
    name: 'Upstream funding accounts',
  })
  expect(await within(upstream).findByText('OpenLux main')).toBeVisible()
  expect(within(upstream).getByText('OpenLux')).toBeVisible()
  // The gateway keeps the payment history, so the receipts button is offered.
  expect(
    within(upstream).getByRole('button', { name: 'Top-up history' })
  ).toBeVisible()
})

it('labels a codex789 account by its own provider', async () => {
  accounts = [
    { ...ACCOUNTS[0], name: 'island AI Coding', provider: 'codex789' },
  ]
  renderFinance()

  const upstream = await screen.findByRole('region', {
    name: 'Upstream funding accounts',
  })
  expect(await within(upstream).findByText('island AI Coding')).toBeVisible()
  expect(within(upstream).getByText('codex789')).toBeVisible()
  // The redemption codes are its payments, so the receipts button is offered.
  expect(
    within(upstream).getByRole('button', { name: 'Top-up history' })
  ).toBeVisible()
})

it('shows each WorkBuddy realm and links both pool pages', async () => {
  accounts = [
    {
      ...ACCOUNTS[0],
      name: 'WorkBuddy pool',
      provider: 'workbuddy',
      workbuddy: {
        observed_days: 7,
        usage_complete: true,
        window_start: 1,
        usage_7d: 100,
        target_3d: 40,
        balance: 200,
        expiring_credits: 0,
        accounts_total: 11,
        accounts_enabled: 11,
        realms: [
          { realm: 'cn', total: 11, enabled: 11 },
          { realm: 'intl', total: 0, enabled: 0 },
        ],
        stale_count: 0,
      },
    },
    {
      ...ACCOUNTS[0],
      id: 9,
      name: 'CommandCode pool',
      provider: 'commandcode',
    },
  ]
  renderFinance()

  const upstream = await screen.findByRole('region', {
    name: 'Upstream funding accounts',
  })
  // Domestic and international accounts are counted apart, so an empty foreign
  // realm is visible instead of hiding inside one pool total.
  expect(
    await within(upstream).findByText('Domestic 11 · International 0')
  ).toBeVisible()
  // Both pools are managed on their own page.
  expect(
    within(upstream).getAllByRole('link', { name: 'Manage pool' })
  ).toHaveLength(2)
})

it('compares the cumulative balance with both reserve targets', async () => {
  renderFinance()

  const targets = await screen.findByRole('region', { name: 'Reserve targets' })
  expect(await within(targets).findByText(/600\.00/)).toBeVisible()
  // Each target prints its own arithmetic, so a daily target that happens to
  // equal the extreme one is not read as the same figure listed twice.
  expect(
    within(targets).getByText(/Seven-day average ¥30\.00 × 3 = ¥90\.00/)
  ).toBeVisible()
  expect(
    within(targets).getByText(
      /¥120\.50 in wallets plus ¥160\.00 in Token Plan quota = ¥280\.50/
    )
  ).toBeVisible()
  expect(within(targets).getAllByText(/Above target by/)).toHaveLength(2)
  expect(within(targets).queryByText('Cost data incomplete')).toBeNull()
})

it('flags an incomplete cost report instead of presenting a precise target', async () => {
  reserves = {
    ...RESERVES,
    daily: {
      ...RESERVES.daily,
      complete: false,
      missing_accounts: ['Anthropic pooled'],
    },
  }
  renderFinance()

  const targets = await screen.findByRole('region', { name: 'Reserve targets' })
  expect(await within(targets).findByText('Cost data incomplete')).toBeVisible()
  expect(
    within(targets).getByText(/Anthropic pooled.*lower than reality/)
  ).toBeVisible()
})

it('explains a metric on request instead of printing long notes', async () => {
  const user = userEvent.setup()
  renderFinance()

  const targets = await screen.findByRole('region', { name: 'Reserve targets' })
  await user.click(
    await within(targets).findByRole('button', { name: 'Cumulative balance' })
  )

  expect(
    await screen.findByText(
      /The balance is money received minus money spent since the site began/
    )
  ).toBeVisible()
})
