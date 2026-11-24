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
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { Wallet } from '@/features/wallet'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useTopupCampaignStore } from '@/stores/topup-campaign-store'

import { CampaignEntry } from '../campaign-entry'

const clients: QueryClient[] = []
const originalAdapter = api.defaults.adapter
const campaign = {
  id: 'double-11-2026',
  starts_at: 1794236623,
  ends_at: 1794499200,
  server_time: 1794240000,
  active: true,
  base_percent: 5,
  threshold_cny: 100,
  threshold_percent: 15,
}

beforeEach(() => {
  localStorage.clear()
  api.defaults.adapter = async (config) => {
    let data: unknown = {}
    if (config.url === '/api/topup/campaign') data = campaign
    if (config.url === '/api/subscription/plans') data = []
    if (config.url === '/api/user/self') {
      data = { id: 7, username: 'reader', quota: 5000000 }
    }
    if (config.url === '/api/status') {
      data = { price: 1, quota_per_unit: 500000, usd_exchange_rate: 1 }
    }
    if (config.url === '/api/user/topup/info') {
      data = {
        enable_online_topup: true,
        enable_stripe_topup: false,
        pay_methods: [{ name: 'Alipay', type: 'alipay' }],
        min_topup: 10,
        stripe_min_topup: 1,
        amount_options: [10, 100],
        discount: {},
      }
    }
    if (config.url === '/api/user/amount') {
      const request = JSON.parse(config.data) as { amount: number }
      const quote =
        request.amount === 100
          ? { data: '100.00', campaign_bonus_quota: 7500000 }
          : { data: '10.00', campaign_bonus_quota: 250000 }
      return {
        data: { success: true, payment_currency: 'CNY', ...quote },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }
    return {
      data: { success: true, data },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }
  }
  useTopupCampaignStore.setState({ seen: {} })
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useAuthStore.getState().auth.setUser({ id: 7, username: 'reader', role: 1 })
  useAuthStore.getState().auth.setBootstrapState('complete')
})

afterEach(() => {
  cleanup()
  clients.forEach((client) => client.clear())
  clients.length = 0
  vi.useRealTimers()
  vi.restoreAllMocks()
  api.defaults.adapter = originalAdapter
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useTopupCampaignStore.setState({ seen: {} })
  localStorage.clear()
})

async function renderEntry(
  offer = campaign,
  seed = true,
  page = CampaignEntry
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  if (seed) client.setQueryData(['topup-campaign'], offer)
  const router = createRouter({
    routeTree: createRootRoute({ component: page }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>
  )
}

it('loads the offer after StrictMode aborts the first network observer', async () => {
  api.defaults.adapter = async (config) => ({
    data: { success: true, data: campaign },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  })
  await renderEntry(campaign, false)
  expect(await screen.findByRole('dialog')).toHaveTextContent('15%')
})

it('announces once even when refreshed while open, and still opens from the badge', async () => {
  await renderEntry()
  expect(await screen.findByRole('dialog')).toHaveTextContent('15%')
  const stored = localStorage.getItem('topup-campaign:v1')
  if (!stored) throw new Error('Campaign presentation was not persisted')
  cleanup()
  // A fresh store instance restores the browser's persisted acknowledgement.
  useTopupCampaignStore.setState({ seen: {} })
  localStorage.setItem('topup-campaign:v1', stored)
  await useTopupCampaignStore.persist.rehydrate()
  await renderEntry()
  expect(
    await screen.findByRole('button', { name: 'Double 11 top-up offer' })
  ).toBeVisible()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  const user = userEvent.setup()
  await user.click(
    screen.getByRole('button', { name: 'Double 11 top-up offer' })
  )
  expect(await screen.findByRole('dialog')).toBeVisible()
  await user.keyboard('{Escape}')
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
})

it('waits for the account to load and announces separately for another account', async () => {
  useAuthStore.getState().auth.setBootstrapState('checking')
  await renderEntry()
  await screen.findByRole('button', { name: 'Double 11 top-up offer' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  act(() => useAuthStore.getState().auth.setBootstrapState('complete'))
  await screen.findByRole('dialog')
  fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0])
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  act(() =>
    useAuthStore.getState().auth.setUser({ id: 8, username: 'other', role: 1 })
  )
  expect(await screen.findByRole('dialog')).toBeVisible()
})

it('announces to a visitor whose public bootstrap skips the missing session', async () => {
  useAuthStore.getState().auth.reset('idle')
  await renderEntry()
  expect(await screen.findByRole('dialog')).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Sign in to top up' })
  ).toBeVisible()
})

it('announces again in a browser without the previous acknowledgement', async () => {
  await renderEntry()
  await screen.findByRole('dialog')
  cleanup()
  localStorage.clear()
  useTopupCampaignStore.setState({ seen: {} })
  await renderEntry()
  expect(await screen.findByRole('dialog')).toBeVisible()
})

it('removes the badge and open dialog exactly when the server window expires', async () => {
  await renderEntry({ ...campaign, ends_at: campaign.server_time + 1 })
  await screen.findByRole('dialog')
  vi.useFakeTimers()
  // Force an up-to-date server response so the boundary timer uses fake time.
  act(() =>
    clients[0].setQueryData(['topup-campaign'], {
      ...campaign,
      ends_at: campaign.server_time + 1,
    })
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1001)
  })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Double 11 top-up offer' })
  ).not.toBeInTheDocument()
})

it('does not announce or expose an entry outside the activity window', async () => {
  await renderEntry({ ...campaign, active: false })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Double 11 top-up offer' })
  ).not.toBeInTheDocument()
})

it('lets a signed-in reader top up inside the offer and shows the quoted voucher before payment', async () => {
  await renderEntry()
  const dialog = await screen.findByRole('dialog')
  const amount = await within(dialog).findByRole('spinbutton', {
    name: 'Custom Amount',
  })
  await within(dialog).findByText('Bonus voucher')
  expect(within(dialog).getByLabelText('+$0.50')).toBeVisible()
  const user = userEvent.setup()
  const preset = within(dialog).getByRole('button', {
    name: '100 You Pay $100.00',
  })
  await user.click(preset)
  expect(preset).toHaveAttribute('aria-pressed', 'true')
  expect(await within(dialog).findByLabelText('+$15.00')).toBeVisible()
  await user.clear(amount)
  expect(preset).toHaveAttribute('aria-pressed', 'false')
  await user.type(amount, '100')
  expect(await within(dialog).findByLabelText('+$15.00')).toBeVisible()
  await user.click(within(dialog).getByRole('button', { name: 'Alipay' }))
  const confirmation = await screen.findByRole('alertdialog')
  expect(within(confirmation).getByText('Bonus voucher')).toBeVisible()
  expect(within(confirmation).getByText('+$15.00')).toBeVisible()
})

it('shows the same offer rules and voucher preview on the workspace top-up page', async () => {
  await renderEntry(campaign, true, () => <Wallet />)
  expect(
    await screen.findByRole('region', { name: 'Double 11 top-up offer' })
  ).toHaveTextContent('15%')
  expect(await screen.findByText('Bonus voucher')).toBeVisible()
  expect(screen.getByRole('textbox', { name: 'Have a Code?' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Order History' })).toBeVisible()
})

it('keeps the offer concise and exposes full rules on demand', async () => {
  await renderEntry()
  const dialog = await screen.findByRole('dialog')
  expect(
    within(dialog).getByRole('heading', {
      name: '5% bonus, 15% for single payments of CNY 100+',
    })
  ).toBeVisible()
  expect(within(dialog).getByText('Below CNY 100: 5% bonus')).toBeVisible()
  expect(
    screen.queryByText(
      'Bonus credit is calculated from the credited top-up amount. Only online payments in CNY qualify.'
    )
  ).not.toBeInTheDocument()
  const user = userEvent.setup()
  await user.click(
    within(dialog).getByRole('button', { name: 'Double 11 rules' })
  )
  expect(
    await screen.findByText(
      'Bonus credit is calculated from the credited top-up amount. Only online payments in CNY qualify.'
    )
  ).toBeVisible()
  await user.keyboard('{Escape}')
  expect(
    within(dialog).getByRole('heading', {
      name: '5% bonus, 15% for single payments of CNY 100+',
    })
  ).toBeVisible()
})

it('keeps redemption and order history out of the campaign checkout', async () => {
  await renderEntry()
  const dialog = await screen.findByRole('dialog')
  await within(dialog).findByRole('spinbutton', { name: 'Custom Amount' })
  expect(
    within(dialog).queryByRole('button', { name: 'Have a Code?' })
  ).not.toBeInTheDocument()
  expect(
    within(dialog).queryByRole('button', { name: 'Order History' })
  ).not.toBeInTheDocument()
  expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()
})

it('keeps the last voucher visible while a replacement quote is pending', async () => {
  const adapter = api.defaults.adapter
  if (typeof adapter !== 'function') {
    throw new Error('Expected the test network adapter')
  }
  let finishQuote: (() => void) | undefined
  const pending = new Promise<void>((resolve) => {
    finishQuote = resolve
  })
  api.defaults.adapter = async (config) => {
    if (
      config.url === '/api/user/amount' &&
      JSON.parse(config.data).amount === 100
    ) {
      await pending
    }
    return adapter(config)
  }
  await renderEntry()
  const dialog = await screen.findByRole('dialog')
  const previousAmount = await within(dialog).findByLabelText('+$0.50')
  const user = userEvent.setup()
  await user.click(
    within(dialog).getByRole('button', { name: '100 You Pay $100.00' })
  )
  try {
    expect(previousAmount).toBeVisible()
    expect(
      within(dialog).getByRole('status', { name: 'Bonus voucher' })
    ).toHaveAttribute('aria-busy', 'true')
  } finally {
    finishQuote?.()
  }
  expect(await within(dialog).findByLabelText('+$15.00')).toBeVisible()
  expect(
    within(dialog).getByRole('status', { name: 'Bonus voucher' })
  ).not.toHaveAttribute('aria-busy', 'true')
})

it('clears a retained voucher when the completed quote is ineligible', async () => {
  await renderEntry()
  const dialog = await screen.findByRole('dialog')
  await within(dialog).findByLabelText('+$0.50')
  const adapter = api.defaults.adapter
  if (typeof adapter !== 'function') {
    throw new Error('Expected the test network adapter')
  }
  api.defaults.adapter = async (config) => {
    const response = await adapter(config)
    if (config.url === '/api/user/amount') {
      response.data = { success: true, data: '100.00', payment_currency: 'USD' }
    }
    return response
  }
  const user = userEvent.setup()
  await user.click(
    within(dialog).getByRole('button', { name: '100 You Pay $100.00' })
  )
  await waitFor(() =>
    expect(
      within(dialog).queryByRole('status', { name: 'Bonus voucher' })
    ).not.toBeInTheDocument()
  )
})
