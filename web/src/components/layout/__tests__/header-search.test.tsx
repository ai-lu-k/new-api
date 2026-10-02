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
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'
import { SearchProvider } from '@/context/search-provider'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { AppHeader } from '../components/app-header'
import { PublicLayout } from '../components/public-layout'

beforeEach(() => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: { success: true, data: url === '/api/notice' ? '' : {} },
  }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
})

async function renderPage(page: () => ReactNode) {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queries.setQueryData(['status'], { system_name: 'LUK' })
  const router = createRouter({
    routeTree: createRootRoute({ component: page }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={queries}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return screen.findByRole('banner')
}

/** True when `first` comes before `second` in reading order. */
function precedes(first: HTMLElement, second: HTMLElement) {
  return Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING
  )
}

it('keeps the console search box next to the brand, ahead of the navigation', async () => {
  await renderPage(() => (
    <SearchProvider>
      <SidebarProvider>
        <AppHeader
          showNotifications={false}
          showConfigDrawer={false}
          showProfileDropdown={false}
        />
      </SidebarProvider>
    </SearchProvider>
  ))

  const search = screen.getByRole('button', { name: 'Search' })
  const brand = screen.getByRole('link', { name: 'Go to home' })
  const navigation = screen.getByRole('link', { name: 'Console' })

  expect(precedes(brand, search)).toBe(true)
  expect(precedes(search, navigation)).toBe(true)
  expect(brand.parentElement).toBe(search.parentElement)
})

it('shows the same search box on public pages to someone who is signed in', async () => {
  useAuthStore.getState().auth.setUser({ id: 7, username: 'ada', role: 1 })
  const header = await renderPage(() => <PublicLayout>page</PublicLayout>)

  const search = await screen.findByRole('button', { name: 'Search' })
  const navigation = screen.getAllByRole('link', { name: 'Console' })[0]

  expect(header).toContainElement(search)
  expect(precedes(search, navigation)).toBe(true)
})

it('leaves the search box out for a visitor, who has no console to search', async () => {
  await renderPage(() => <PublicLayout>page</PublicLayout>)

  await screen.findAllByRole('link', { name: 'Console' })
  expect(
    screen.queryByRole('button', { name: 'Search' })
  ).not.toBeInTheDocument()
})
