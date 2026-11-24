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
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { TokenPlanAdmin } from '..'
import type { TokenPlanTab } from '../tabs'

const planUser = {
  user_id: 42,
  username: 'plan-user',
  display_name: 'Plan user',
  status: 1,
  activated: true,
  wallet_fallback: true,
  level: 2,
  base_quota: 500000,
  multiplier: 3,
  total_quota: 1500000,
  used_quota: 500000,
  reserved_quota: 250000,
  remaining_quota: 1000000,
  wallet_used_quota: 250000,
  week_start: 1791820800,
  resets_at: 1792425600,
  personal_cycle: true,
  coupon_cycle: true,
}

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await i18n.changeLanguage('en')
})

function mockStatistics() {
  return vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url.endsWith('/overview')) {
      return {
        data: {
          success: true,
          data: {
            users: 1,
            activated_users: 1,
            total_quota: 1500000,
            used_quota: 500000,
            reserved_quota: 250000,
            remaining_quota: 1000000,
            wallet_used_quota: 250000,
            as_of: 1792022400,
          },
        },
      }
    }
    if (url.endsWith('/users')) {
      return {
        data: { success: true, data: { items: [planUser], total: 1 } },
      }
    }
    if (url.endsWith('/trend')) {
      return {
        data: {
          success: true,
          data: {
            days: [],
            total: { requests: 0, free_used: 0, wallet_used: 0 },
            undated: { requests: 0, free_used: 0, wallet_used: 0 },
          },
        },
      }
    }
    if (url.endsWith('/api/admin/vouchers/batches')) {
      return { data: { success: true, data: { items: [], total: 0 } } }
    }
    throw new Error(`Unexpected URL: ${url}`)
  })
}

function renderPage(initialTab: TokenPlanTab) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const seen: TokenPlanTab[] = []
  function Harness() {
    const [tab, setTab] = useState<TokenPlanTab>(initialTab)
    return (
      <TokenPlanAdmin
        tab={tab}
        onTabChange={(next) => {
          seen.push(next)
          setTab(next)
        }}
      />
    )
  }
  const view = render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>
  )
  return { ...view, seen }
}

it('loads only the requested section and offers the four sections once', async () => {
  const get = mockStatistics()
  renderPage('users')
  expect(screen.getAllByRole('tab')).toHaveLength(4)
  expect(screen.getByRole('tab', { name: 'User details' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  expect(await screen.findByText('plan-user')).toBeVisible()
  expect(
    screen.queryByRole('region', { name: 'Current cycle overview' })
  ).not.toBeInTheDocument()
  expect(get.mock.calls.some(([url]) => url.endsWith('/overview'))).toBe(false)
})

it('switches sections from the tab list and keeps the visited one mounted', async () => {
  mockStatistics()
  const actor = userEvent.setup()
  const page = renderPage('users')
  await screen.findByText('plan-user')
  await actor.click(screen.getByRole('tab', { name: 'Usage trend' }))
  expect(page.seen).toEqual(['trend'])
  expect(
    await screen.findByRole('region', { name: 'Daily usage' })
  ).toBeVisible()
  await actor.click(screen.getByRole('tab', { name: 'User details' }))
  expect(page.seen).toEqual(['trend', 'users'])
  expect(await screen.findByText('plan-user')).toBeVisible()
})

it('opens the trend for the user selected in the list', async () => {
  const get = mockStatistics()
  const actor = userEvent.setup()
  renderPage('users')
  await screen.findByText('plan-user')
  await actor.click(screen.getByRole('button', { name: 'View trend' }))
  expect(
    await screen.findByRole('heading', { name: /Daily usage.*#42 plan-user/ })
  ).toBeVisible()
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith(
      '/api/token-plan/statistics/trend',
      expect.objectContaining({
        params: expect.objectContaining({ user_id: 42 }),
      })
    )
  )
})

it('prepares a coupon grant for the selected user without issuing anything', async () => {
  const get = mockStatistics()
  const post = vi.spyOn(api, 'post')
  const actor = userEvent.setup()
  renderPage('users')
  await screen.findByText('plan-user')
  await actor.click(screen.getByRole('button', { name: 'Issue vouchers' }))
  const status = await screen.findByRole('status')
  expect(status).toHaveTextContent('Target user')
  expect(status).toHaveTextContent('#42 plan-user')
  expect(screen.getByLabelText('Recipients')).toHaveValue('users')
  expect(screen.getByLabelText('User IDs')).toHaveValue('42')
  expect(post).not.toHaveBeenCalled()
  expect(get).toHaveBeenCalledWith(
    '/api/admin/vouchers/batches',
    expect.anything()
  )
  await actor.click(screen.getByRole('button', { name: 'Clear' }))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Recipients')).toHaveValue('all')
  expect(screen.getByLabelText('User IDs')).toHaveValue('')
  expect(post).not.toHaveBeenCalled()
})
