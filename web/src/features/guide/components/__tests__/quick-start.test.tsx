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
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { QuickStart } from '../quick-start'

beforeEach(() => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url !== '/api/dsh_setup/models') {
      throw new Error(`Unexpected request: ${url}`)
    }
    return {
      data: {
        success: true,
        data: {
          auto_group: true,
          default_model: 'gpt-5.6-sol',
          models: [
            {
              id: 'gpt-5.6-sol',
              protocols: ['openai-completions', 'openai-responses'],
            },
          ],
        },
      },
    }
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function renderQuickStart(entry: string) {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queries.setQueryData(['status'], {
    system_name: 'LUK',
    server_address: 'https://ai.example.test',
    dsh_setup_enabled: true,
  })
  const router = createRouter({
    routeTree: createRootRoute({ component: QuickStart }),
    history: createMemoryHistory({ initialEntries: [entry] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={queries}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return screen.findByRole('navigation', { name: 'Quick Start' })
}

function currentOption(nav: HTMLElement) {
  return within(nav)
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'page')
    .map((link) => link.textContent)
}

it('lists the clients to start with and opens on DSH', async () => {
  const nav = await renderQuickStart('/')

  expect(
    within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent)
  ).toEqual([
    'Start with DSH',
    'Start with Claude Code',
    'Start with Codex',
    'Start with OpenCode',
    'Start with OpenClaw',
  ])
  expect(currentOption(nav)).toEqual(['Start with DSH'])
  expect(screen.getByText('Set up DSH with one prompt')).toBeVisible()
})

it('opens on the client named in the address', async () => {
  const nav = await renderQuickStart('/#codex')

  expect(currentOption(nav)).toEqual(['Start with Codex'])
  expect(await screen.findByText('Import with CC Switch')).toBeVisible()
  expect(
    screen.queryByText('Set up DSH with one prompt')
  ).not.toBeInTheDocument()
})

it('falls back to DSH when the address names no client', async () => {
  const nav = await renderQuickStart('/#nothing-like-this')

  expect(currentOption(nav)).toEqual(['Start with DSH'])
})

it('switches guides when another client is picked', async () => {
  const user = userEvent.setup()
  const nav = await renderQuickStart('/')

  await user.click(
    within(nav).getByRole('link', { name: 'Start with OpenCode' })
  )

  expect(currentOption(nav)).toEqual(['Start with OpenCode'])
  expect(await screen.findByText(/@ai-sdk\/openai-compatible/)).toBeVisible()
})
