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
import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { Profile } from '..'

let client: QueryClient

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        id: 1,
        username: 'alice',
        display_name: 'Alice',
        role: 1,
        group: 'default',
        quota: 1_000_000,
        used_quota: 500_000,
        request_count: 12,
        status: 1,
        usage_level: {
          level: 2,
          next_level_quota: 25_000_000,
          remaining_quota: 16_500_000,
          progress: 17.5,
        },
      },
    },
  })
})

afterEach(() => {
  client.clear()
  vi.restoreAllMocks()
})

it('leaves the usage level group out of the settings list while levels are offline', async () => {
  const router = createRouter({
    routeTree: createRootRoute({ component: Profile }),
    history: createMemoryHistory(),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )

  const groups = await screen.findByRole('navigation', { name: 'Settings' })
  expect(
    within(groups).getByRole('link', { name: 'Notifications' })
  ).toBeVisible()
  expect(
    within(groups).queryByRole('link', { name: 'Usage level' })
  ).not.toBeInTheDocument()
  expect(screen.queryByText('Usage level')).not.toBeInTheDocument()
  expect(screen.queryByText('Level thresholds')).not.toBeInTheDocument()
})
