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
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { OverviewDashboard } from '../overview-dashboard'

let client: QueryClient
let keyLookupError: Error | null
let logRequests: string[]

beforeEach(() => {
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'dashboard-user',
    role: 1,
    quota: 1000000,
    used_quota: 1000,
    request_count: 1,
  })
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  keyLookupError = null
  logRequests = []
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    switch (url) {
      case '/api/token/?p=1&size=10':
        if (keyLookupError) throw keyLookupError
        return {
          data: {
            success: true,
            data: {
              items: [{ id: 1, name: 'App key', key: 'masked', status: 1 }],
              total: 1,
            },
          },
        }
      case '/api/status':
        return {
          data: {
            data: {
              api_info_enabled: false,
              announcements_enabled: false,
              faq_enabled: false,
              uptime_kuma_enabled: false,
            },
          },
        }
      case '/api/user/models':
        return { data: { success: true, data: ['gpt-4o-mini'] } }
      case '/api/data/self':
        return { data: { success: true, data: [] } }
      default:
        if (String(url).startsWith('/api/log/self?')) {
          logRequests.push(String(url))
          return {
            data: {
              success: true,
              data: {
                items: [
                  {
                    id: 9,
                    created_at: 1790000000,
                    type: 2,
                    model_name: 'glm-5.3-x0.25',
                    quota: 5000,
                    prompt_tokens: 1200,
                    completion_tokens: 300,
                  },
                ],
                total: 1,
              },
            },
          }
        }
        throw new Error(`Unexpected dashboard request: ${url}`)
    }
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  window.localStorage.clear()
})

async function renderOverview() {
  const router = createRouter({
    routeTree: createRootRoute({ component: OverviewDashboard }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('overview setup banner', () => {
  it('shows balance and usage alone once every step is done', async () => {
    await renderOverview()

    expect(await screen.findByText('Usage at a glance')).toBeVisible()
    await waitFor(() => expect(client.isFetching()).toBe(0))
    expect(
      screen.getAllByRole('heading').map((heading) => heading.textContent)
    ).toEqual(['Overview', 'Usage at a glance', 'Recent requests', 'API Keys1'])
    expect(
      screen.queryByRole('region', { name: 'Get started' })
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/Setup progress:/)).not.toBeInTheDocument()
  })

  it('puts the balance ahead of the usage figures', async () => {
    await renderOverview()

    const balance = await screen.findByText('Credit remaining')
    const usage = screen.getByText('Usage at a glance')
    expect(
      balance.compareDocumentPosition(usage) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Top-up' })).toHaveAttribute(
      'href',
      '/wallet'
    )
  })

  it('lists what a new account still has to do, with a link for each open step', async () => {
    useAuthStore
      .getState()
      .auth.setUser({ id: 1, username: 'new-user', role: 1 })
    await renderOverview()

    const banner = await screen.findByRole('region', { name: 'Get started' })
    expect(within(banner).getByText('Setup progress: 1/3')).toBeVisible()
    expect(
      within(banner)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')])
    ).toEqual([
      ['Add credits', '/wallet'],
      ['Send a request', '/playground'],
      ['Quick Start', '/'],
    ])
    // The finished step is named, but is no longer a link.
    expect(within(banner).getByText('Create API Key')).toBeVisible()
  })

  it('drops the banner when the last step completes', async () => {
    useAuthStore.getState().auth.setUser({
      id: 1,
      username: 'dashboard-user',
      role: 1,
      quota: 1000000,
    })
    await renderOverview()
    expect(await screen.findByText('Setup progress: 2/3')).toBeVisible()

    act(() => {
      useAuthStore.getState().auth.setUser({
        id: 1,
        username: 'dashboard-user',
        role: 1,
        quota: 1000000,
        request_count: 1,
      })
    })
    await waitFor(() =>
      expect(screen.queryByText(/Setup progress:/)).not.toBeInTheDocument()
    )
  })

  it('still asks for a key when the key lookup fails', async () => {
    keyLookupError = new Error('Key lookup unavailable')
    await renderOverview()

    const banner = await screen.findByRole('region', { name: 'Get started' })
    expect(
      within(banner).getByRole('link', { name: 'Create API Key' })
    ).toHaveAttribute('href', '/keys')
  })

  it('has no setup cards, sample request or shortcut list', async () => {
    useAuthStore
      .getState()
      .auth.setUser({ id: 1, username: 'new-user', role: 1 })
    await renderOverview()

    await screen.findByRole('region', { name: 'Get started' })
    for (const gone of [
      'Build on your API gateway in minutes',
      'Keep the platform ready',
      'First API request',
      'Recommended actions',
    ]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument()
    }
  })

  it('says who is signed in, and lists the latest requests and the keys', async () => {
    useAuthStore.getState().auth.setUser({
      id: 42,
      username: 'ada',
      display_name: 'Ada L',
      role: 1,
      group: 'default',
      quota: 1000000,
      used_quota: 1000,
      request_count: 1,
    })
    await renderOverview()

    const account = await screen.findByRole('region', { name: 'Account' })
    expect(within(account).getByText('Ada L')).toBeVisible()
    expect(within(account).getByText('User ID 42')).toBeVisible()
    expect(within(account).getByText('@ada · default')).toBeVisible()

    expect(await screen.findByText('glm-5.3-x0.25')).toBeVisible()
    // Only requests that were served and billed, and only a handful.
    expect(logRequests).toHaveLength(1)
    expect(logRequests[0]).toContain('page_size=5')
    expect(logRequests[0]).toContain('type=2')

    expect(await screen.findByText('App key')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Quick import' })).toBeEnabled()
    expect(
      screen
        .getAllByRole('link', { name: 'View all' })
        .map((link) => link.getAttribute('href'))
    ).toEqual(['/usage-logs/common', '/keys'])
  })
})
