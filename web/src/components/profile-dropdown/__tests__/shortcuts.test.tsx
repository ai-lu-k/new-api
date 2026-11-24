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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ProfileDropdown } from '@/components/profile-dropdown'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

let queries: QueryClient

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
  queries = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queries.setQueryData(['status'], {})
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'alice',
    role: 1,
    group: 'default',
  })
  vi.spyOn(api, 'get').mockImplementation(((url: string) => {
    if (url === '/api/page_views/popular') {
      return Promise.resolve({
        data: {
          success: true,
          message: '',
          data: [
            { page: '/usage-logs/common', views: 90 },
            { page: '/keys', views: 70 },
            { page: '/wallet', views: 50 },
            { page: '/playground', views: 30 },
            { page: '/profile', views: 10 },
          ],
        },
      })
    }
    return Promise.resolve({ data: { success: true, data: {} } })
  }) as unknown as typeof api.get)
})

afterEach(() => {
  queries.clear()
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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
  return { user, router }
}

it('replaces the fixed account entries with the four most visited pages', async () => {
  await openProfileMenu()

  await waitFor(() =>
    expect(screen.getByRole('menuitem', { name: 'Usage Logs' })).toBeVisible()
  )
  const labels = screen
    .getAllByRole('menuitem')
    .map((item) => item.textContent?.trim())
  expect(labels.slice(0, 4)).toEqual([
    'Usage Logs',
    'API Keys',
    'Top-up',
    'Model Test',
  ])
  expect(screen.queryByRole('menuitem', { name: 'Settings' })).toBeNull()
  expect(
    screen.queryByRole('menuitem', { name: 'Security & Access' })
  ).toBeNull()
  expect(screen.queryByRole('menuitem', { name: 'System Settings' })).toBeNull()
})

it('navigates to the chosen page and closes the menu', async () => {
  const { user, router } = await openProfileMenu()

  await user.click(screen.getByRole('menuitem', { name: 'API Keys' }))

  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  expect(router.state.location.pathname).toBe('/keys')
})
