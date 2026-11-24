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
import { render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { ProfileDropdown } from '@/components/profile-dropdown'
import { useUsersColumns } from '@/features/users/components/users-columns'
import { api } from '@/lib/api'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'

// The switch is the only thing that turns levels back on; this file keeps the
// restoration path working while the other suites assert the offline state.
vi.mock('../visibility', () => ({ USAGE_LEVEL_VISIBLE: true }))

const account: AuthUser = {
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

afterEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  vi.restoreAllMocks()
})

it('keeps the level badge out of the redesigned account menu', async () => {
  useAuthStore.getState().auth.setUser(account)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['status'], {})
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: {} } })
  const router = createRouter({
    routeTree: createRootRoute({ component: ProfileDropdown }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await userEvent.setup().click(await screen.findByRole('button'))

  // The account menu was redesigned into a single identity line, so it no
  // longer carries the level badge or the progress bar. The switch still
  // restores the level where it is still rendered (the users table below).
  expect(
    screen.queryByLabelText('Usage level 2: Regular user')
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('progressbar', { name: 'Level progress' })
  ).not.toBeInTheDocument()
  client.clear()
})

it('keeps the users table level column when the switch is on', () => {
  const { result } = renderHook(() => useUsersColumns())

  expect(result.current.some((column) => column.id === 'usage_level')).toBe(
    true
  )
})
