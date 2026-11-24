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
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import type { TokenPlanStatus } from '../../api'
import { TokenPlanCard } from '../token-plan-card'

let client: QueryClient
let status: TokenPlanStatus
let rotationFails: boolean
let vouchers: { id: number; face_value: number; expires_at: number }[]
const secret = 'sk-tp_unit-test-credential'

// 500000 quota is one unit of display currency, so a balance of 5000000 reads
// as ¥10.00 under the CNY configuration set up below.
const BALANCE = 5_000_000

beforeEach(() => {
  rotationFails = false
  vouchers = []
  localStorage.clear()
  useSystemConfigStore.getState().setConfig({
    currency: {
      ...useSystemConfigStore.getState().config.currency,
      quotaDisplayType: 'CNY',
      usdExchangeRate: 1,
    },
  })
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'user',
    role: 1,
    quota: BALANCE,
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // The key dialog reads /api/status through the shared cache, which maps the
  // display currency back into the config store. Seed it so the balance below
  // is formatted the same way from the first paint.
  client.setQueryData(['status'], {
    quota_display_type: 'CNY',
    usd_exchange_rate: 1,
    quota_per_unit: 500000,
  })
  status = {
    level: 2,
    base_quota: 500000,
    multiplier: 1,
    personal_cycle: false,
    coupon_count: 0,
    coupon_expires_at: 0,
    total_quota: 500000,
    used_quota: 125000,
    remaining_quota: 375000,
    week_start: 1791129600,
    resets_at: 1791734400,
    token_id: 10,
    wallet_fallback: false,
    auto_reset_coupon: false,
    masked_key: 'sk-tp_****last',
  }
  vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
    if (url === '/api/user/vouchers/pending') {
      return { data: { success: true, data: { items: vouchers } } }
    }
    if (url === '/api/token/plan') {
      return { data: { success: true, data: status } }
    }
    if (url === '/api/verify/methods') {
      return {
        data: {
          success: true,
          data: {
            scope: (config?.params as { scope?: string })?.scope,
            methods: [{ method: 'password', available: true }],
            oauth_providers: [],
            password_encryption_enabled: false,
          },
        },
      }
    }
    return { data: { success: true, data: {} } }
  })
  vi.spyOn(api, 'patch').mockImplementation(async (url, data) => {
    if (url === '/api/token/plan/settings') {
      const change = data as {
        wallet_fallback?: boolean
        auto_reset_coupon?: boolean
      }
      status = {
        ...status,
        wallet_fallback: change.wallet_fallback ?? status.wallet_fallback,
        auto_reset_coupon: change.auto_reset_coupon ?? status.auto_reset_coupon,
      }
      return { data: { success: true, data: status } }
    }
    throw new Error('Unexpected request')
  })
  vi.spyOn(api, 'post').mockImplementation(async (url, data) => {
    if (url === '/api/token/plan') {
      status = { ...status, token_id: 10, masked_key: 'sk-tp_****last' }
      return { data: { success: true, data: status } }
    }
    if (url === '/api/verify') {
      return {
        data: {
          success: true,
          data: {
            proof_token: 'one-use-proof',
            scope: (data as { scope: string }).scope,
            method: 'password',
            expires_at: Math.floor(Date.now() / 1000) + 300,
          },
        },
      }
    }
    if (url === '/api/token/plan/rotate' && rotationFails) {
      throw new Error('Rotation failed')
    }
    if (url === '/api/token/plan/key' || url === '/api/token/plan/rotate') {
      return { data: { success: true, data: { key: secret.slice(3) } } }
    }
    throw new Error('Unexpected request')
  })
})
afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
})

async function renderPlan(compact = false) {
  const view = render(
    <QueryClientProvider client={client}>
      <TokenPlanCard compact={compact} />
    </QueryClientProvider>
  )
  if (status.retired) {
    await screen.findByRole('heading', { name: 'API Key' })
  } else {
    await screen.findByRole('switch', { name: 'Continue with balance' })
  }
  return view
}
async function verify(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    await screen.findByLabelText('Password', { selector: 'input' }),
    'current-password'
  )
  await user.click(screen.getByRole('button', { name: 'Verify' }))
}

it('shows an ordinary key and hides free-quota continuation after cutover', async () => {
  status.retired = true
  await renderPlan()
  expect(
    screen.queryByRole('switch', { name: 'Continue with balance' })
  ).toBeNull()
  expect(screen.getByRole('button', { name: 'Reset Key' })).toBeEnabled()
})

it('shows the account balance instead of a weekly allowance', async () => {
  await renderPlan()
  const balance = screen.getByRole('region', { name: 'Balance' })
  expect(within(balance).getByText('¥10.00')).toBeVisible()
  expect(
    screen.queryByRole('progressbar', { name: 'Weekly quota usage' })
  ).not.toBeInTheDocument()
  expect(screen.queryByText(/Resets at/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Weekly remaining quota/)).not.toBeInTheDocument()
})

it('reports how many vouchers are waiting and when the nearest one lapses', async () => {
  vouchers = [
    { id: 41, face_value: 1_500_000, expires_at: 1_800_000_000 },
    { id: 42, face_value: 1_500_000, expires_at: 1_700_000_000 },
  ]
  await renderPlan()
  const balance = screen.getByRole('region', { name: 'Balance' })

  expect(await within(balance).findByText('2 vouchers to open')).toBeVisible()
  // The nearest deadline is the one worth showing, not the first in the list.
  const deadline = within(balance).getByText(/Nearest expires at/)
  expect(deadline.tagName).toBe('TIME')
  expect(deadline).toHaveAttribute(
    'datetime',
    new Date(1_700_000_000 * 1000).toISOString()
  )
})

it('says so when nothing is waiting to be opened', async () => {
  await renderPlan()
  const balance = screen.getByRole('region', { name: 'Balance' })
  expect(await within(balance).findByText('No vouchers to open')).toBeVisible()
  expect(within(balance).queryByText(/Nearest expires at/)).toBeNull()
})

it('provisions one permanent key slot and displays only masked status before verification', async () => {
  status = { ...status, token_id: 0, masked_key: '' }
  await renderPlan()
  expect(await screen.findByText('sk-tp_****last')).toBeVisible()
  expect(api.post).toHaveBeenCalledWith(
    '/api/token/plan',
    undefined,
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  )
  expect(
    screen.queryByRole('button', { name: /Delete/ })
  ).not.toBeInTheDocument()
  expect(screen.queryByText(secret)).not.toBeInTheDocument()
})

it('requires security verification to reveal a key and keeps plaintext out of query caches and storage', async () => {
  const user = userEvent.setup()
  await renderPlan()
  await screen.findByText(status.masked_key)
  await user.click(screen.getByRole('button', { name: 'Show' }))
  expect(api.post).not.toHaveBeenCalledWith(
    '/api/token/plan/key',
    expect.anything(),
    expect.anything()
  )
  await verify(user)
  expect(await screen.findByText(secret)).toBeVisible()
  expect(api.post).toHaveBeenCalledWith(
    '/api/token/plan/key',
    undefined,
    expect.objectContaining({
      singleUseAuthorization: true,
      headers: { 'X-Security-Proof': 'one-use-proof' },
    })
  )
  expect(
    JSON.stringify(
      client
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data)
    )
  ).not.toContain(secret)
  expect(JSON.stringify(localStorage)).not.toContain(secret)
  await user.click(screen.getByRole('button', { name: 'Hide' }))
  expect(screen.queryByText(secret)).not.toBeInTheDocument()
})

it('confirms rotation and verifies its separate scope', async () => {
  const user = userEvent.setup()
  await renderPlan()
  await screen.findByText(status.masked_key)
  await user.click(screen.getByRole('button', { name: 'Reset Key' }))
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await verify(user)
  expect(await screen.findByText(secret)).toBeVisible()
  expect(api.get).toHaveBeenCalledWith(
    '/api/verify/methods',
    expect.objectContaining({ params: { scope: 'token_plan.key.rotate' } })
  )
})

it('removes a revealed credential when switching accounts', async () => {
  const user = userEvent.setup()
  await renderPlan()
  await screen.findByText(status.masked_key)
  await user.click(screen.getByRole('button', { name: 'Show' }))
  await verify(user)
  await screen.findByText(secret)
  act(() =>
    useAuthStore
      .getState()
      .auth.setUser({ id: 2, username: 'another-user', role: 1 })
  )
  await waitFor(() =>
    expect(screen.queryByText(secret)).not.toBeInTheDocument()
  )
})

it('clears the old revealed credential after an ambiguous rotation failure', async () => {
  const user = userEvent.setup()
  await renderPlan()
  await screen.findByText(status.masked_key)
  await user.click(screen.getByRole('button', { name: 'Show' }))
  await verify(user)
  await screen.findByText(secret)
  rotationFails = true
  await user.click(screen.getByRole('button', { name: 'Reset Key' }))
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await verify(user)
  await waitFor(() =>
    expect(screen.queryByText(secret)).not.toBeInTheDocument()
  )
  expect(await screen.findByRole('button', { name: 'Show' })).toBeEnabled()
})

it('changes balance continuation only after security verification and a successful save', async () => {
  const user = userEvent.setup()
  await renderPlan()
  await screen.findByText(status.masked_key)
  const toggle = screen.getByRole('switch', { name: 'Continue with balance' })
  expect(toggle).not.toBeChecked()
  await user.click(toggle)
  expect(api.patch).not.toHaveBeenCalled()
  expect(toggle).not.toBeChecked()
  expect(toggle).toHaveAttribute('aria-disabled', 'true')
  await verify(user)
  await waitFor(() => expect(toggle).toBeChecked())
  expect(
    JSON.stringify(
      client
        .getMutationCache()
        .getAll()
        .map((entry) => entry.state.variables)
    )
  ).not.toContain('one-use-proof')
  expect(api.patch).toHaveBeenCalledWith(
    '/api/token/plan/settings',
    { wallet_fallback: true },
    expect.objectContaining({
      headers: { 'X-Security-Proof': 'one-use-proof' },
      singleUseAuthorization: true,
    })
  )
  expect(api.get).toHaveBeenCalledWith(
    '/api/verify/methods',
    expect.objectContaining({ params: { scope: 'token_plan.settings' } })
  )
  await user.click(toggle)
  await verify(user)
  await waitFor(() => expect(toggle).not.toBeChecked())
})

it('keeps balance continuation disabled if the settings request fails', async () => {
  const user = userEvent.setup()
  vi.mocked(api.patch).mockRejectedValue(new Error('Save failed'))
  await renderPlan()
  await screen.findByText(status.masked_key)
  const toggle = screen.getByRole('switch', { name: 'Continue with balance' })
  await user.click(toggle)
  await verify(user)
  await waitFor(() =>
    expect(toggle).not.toHaveAttribute('aria-disabled', 'true')
  )
  expect(toggle).not.toBeChecked()
})

it('explains balance continuation on demand instead of printing the rule inline', async () => {
  const user = userEvent.setup()
  await renderPlan()
  expect(
    screen.queryByText(/the excess is charged to your balance/)
  ).not.toBeInTheDocument()
  await user.click(
    screen.getByRole('button', { name: 'Explain balance continuation' })
  )
  expect(
    await screen.findByText(/the excess is charged to your balance/)
  ).toBeVisible()
})

it('groups the plan key actions separately from the balance', async () => {
  await renderPlan()
  const balance = screen.getByRole('region', { name: 'Balance' })
  const key = screen.getByRole('region', { name: 'API Key' })
  expect(
    within(key).getByRole('button', { name: 'Quick import' })
  ).toBeEnabled()
  expect(within(key).getByText(status.masked_key)).toBeVisible()
  expect(
    within(key).getByRole('switch', { name: 'Continue with balance' })
  ).toBeVisible()
  expect(within(balance).queryByText(status.masked_key)).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Settings' })
  ).not.toBeInTheDocument()
})

it.each([true, false])(
  'puts the balance in the narrower column with the key beside it (compact: %s)',
  async (compact) => {
    await renderPlan(compact)
    const balance = screen.getByRole('region', { name: 'Balance' })
    const planKey = screen.getByRole('region', { name: 'API Key' })
    const grid = balance.parentElement
    if (!grid) throw new Error('Missing plan grid')
    expect(grid).toHaveClass('lg:grid-cols-5')
    expect(balance).toHaveClass('lg:col-span-2')
    expect(planKey.parentElement).toBe(grid)
    expect(planKey).toHaveClass('lg:col-span-3')
  }
)

it('reveals the compact plan key in place and copies it from the row', async () => {
  const user = userEvent.setup()
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
  await renderPlan(true)
  const key = screen.getByRole('region', { name: 'API Key' })
  await user.click(within(key).getByRole('button', { name: 'Show' }))
  await verify(user)
  expect(await screen.findByText(secret)).toBeVisible()
  expect(within(key).getByRole('button', { name: 'Hide' })).toBeVisible()
  await user.click(within(key).getByRole('button', { name: 'Copy API key' }))
  expect(writeText).toHaveBeenCalledWith(secret)
})

it('copies the compact plan key once the copy button reveals it', async () => {
  const user = userEvent.setup()
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
  await renderPlan(true)
  const key = screen.getByRole('region', { name: 'API Key' })
  await user.click(within(key).getByRole('button', { name: 'Copy' }))
  await verify(user)
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(secret))
})
