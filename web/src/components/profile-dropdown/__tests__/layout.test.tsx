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
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ProfileDropdown } from '@/components/profile-dropdown'
import { api } from '@/lib/api'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'

let queries: QueryClient
let account: AuthUser

beforeEach(() => {
  window.localStorage.clear()
  account = {
    id: 1,
    username: 'root',
    display_name: 'Root User',
    role: 100,
    group: 'default',
    usage_level: {
      level: 2,
      next_level_quota: 25_000_000,
      remaining_quota: 13_200_000,
      progress: 34,
    },
  }
  useAuthStore.getState().auth.setUser(account)
  queries = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queries.setQueryData(['status'], {})
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: {} } })
})

afterEach(() => {
  queries.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  window.localStorage.clear()
})

async function openProfileMenu() {
  const router = createRouter({
    routeTree: createRootRoute({ component: ProfileDropdown }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={queries}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button'))
  await screen.findByRole('menu')
  return user
}

it('names the account and its role without any usage level badge or bar', async () => {
  await openProfileMenu()

  const role = screen.getByText('Super Admin')
  // The instance only uses the default group, so the menu never shows it.
  expect(screen.queryByText('default')).not.toBeInTheDocument()
  // Role and account share one 12px line now, so the pair aligns on baseline.
  expect(role.parentElement).toHaveClass('items-baseline')
  // Levels are offline: neither the current badge nor the next-level one.
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  expect(screen.queryByText(/^LV\d/)).not.toBeInTheDocument()
  expect(screen.queryByText('Highest level reached')).not.toBeInTheDocument()
})

it('prints the balance it just read, with a way to top it up', async () => {
  const quota = 582_710_000
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({
    data: { success: true, data: url === '/api/user/self' ? { quota } : {} },
  }))

  await openProfileMenu()

  expect(await screen.findByText(formatQuotaWithCurrency(quota))).toBeVisible()
  expect(screen.getByRole('link', { name: 'Top-up' })).toHaveAttribute(
    'href',
    '/wallet'
  )
  // The figure lives in the header chip; the panel keeps it only for phones,
  // where the bar has no room for it.
  expect(
    document.querySelector('[data-slot="profile-balance"]')?.parentElement
      ?.parentElement
  ).toHaveClass('sm:hidden')
  expect(
    document.querySelector('[data-slot="profile-balance"]')
  ).not.toHaveClass('text-destructive')
})

it('turns the balance red once it is under five', async () => {
  // 1,500,000 quota units is ¥3 on a site that prices ¥1 at 500,000.
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({
    data: {
      success: true,
      data: url === '/api/user/self' ? { quota: 1_500_000 } : {},
    },
  }))

  await openProfileMenu()

  const balance = await screen.findByText(formatQuotaWithCurrency(1_500_000))
  expect(balance).toHaveClass('text-destructive')
})

it('keeps Escape closing the menu after the account refreshes', async () => {
  const user = await openProfileMenu()
  act(() => {
    useAuthStore.getState().auth.setUser({
      ...account,
      display_name: 'Renamed Root',
    })
  })

  expect(screen.getByText('Renamed Root')).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})
