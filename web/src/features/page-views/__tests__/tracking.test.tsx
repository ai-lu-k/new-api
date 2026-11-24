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
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { usePageViewTracker } from '../hooks/use-page-view-tracker'

let client: QueryClient
let posted: string[]

function RootComponent() {
  usePageViewTracker()
  return <Outlet />
}

function pageRoute(path: '/keys' | '/wallet' | '/profile' | '/sign-in') {
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: () => <div>{path}</div>,
  })
}

const rootRoute = createRootRoute({ component: RootComponent })
const routeTree = rootRoute.addChildren([
  pageRoute('/keys'),
  pageRoute('/wallet'),
  pageRoute('/profile'),
  pageRoute('/sign-in'),
])

async function openAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return router
}

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
  posted = []
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], {})
  useAuthStore.getState().auth.setUser({ id: 1, username: 'alice', role: 1 })
  vi.spyOn(api, 'post').mockImplementation(((
    _url: string,
    body: { page: string }
  ) => {
    posted.push(body.page)
    return Promise.resolve({ data: { success: true } })
  }) as unknown as typeof api.post)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  useAuthStore.getState().auth.reset()
})

describe('usePageViewTracker', () => {
  it('does not count the page the session opened on', async () => {
    await openAt('/keys')

    expect(posted).toEqual([])
  })

  it('counts one visit per user-initiated navigation', async () => {
    const router = await openAt('/keys')

    await router.navigate({ to: '/wallet' })
    await waitFor(() => expect(posted).toEqual(['/wallet']))

    await router.navigate({ to: '/keys' })
    await waitFor(() => expect(posted).toEqual(['/wallet', '/keys']))
  })

  it('does not count again when only the search string changes', async () => {
    const router = await openAt('/keys')

    await router.navigate({ to: '/wallet' })
    await waitFor(() => expect(posted).toEqual(['/wallet']))

    // A later navigation proves the earlier search change produced no report.
    await router.history.push('/wallet?page=2')
    await router.navigate({ to: '/keys' })
    await waitFor(() => expect(posted).toEqual(['/wallet', '/keys']))
  })

  it('ignores pages outside the navigation', async () => {
    const router = await openAt('/keys')

    // Sign-in has no navigation entry, so the following visit is the first
    // report even though two navigations happened.
    await router.navigate({ to: '/sign-in' })
    await router.navigate({ to: '/wallet' })
    await waitFor(() => expect(posted).toEqual(['/wallet']))
  })

  it('stays silent when the report itself fails', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new Error('offline'))
    const router = await openAt('/keys')

    await router.navigate({ to: '/profile' })
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(posted).toEqual([])
  })
})
