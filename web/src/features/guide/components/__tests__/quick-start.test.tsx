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
            {
              id: 'claude-sonnet-5',
              protocols: ['anthropic-messages'],
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
    system_name: 'DEMO',
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

function currentEntry(nav: HTMLElement) {
  return [...nav.querySelectorAll('[aria-current="page"]')].map(
    (entry) => entry.textContent
  )
}

it('shows the four entries that fit in the row and opens on DSH', async () => {
  const nav = await renderQuickStart('/')

  expect(
    within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent)
  ).toEqual([
    'Start with DSH',
    'Start with Claude Code',
    'Start with Codex',
    'Call the API directly',
  ])
  expect(currentEntry(nav)).toEqual(['Start with DSH'])
  expect(
    within(nav).getByRole('button', { name: 'More clients' })
  ).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByText('Set up DSH with one prompt')).toBeVisible()
})

it('opens on the client named in the address', async () => {
  const nav = await renderQuickStart('/#codex')

  expect(currentEntry(nav)).toEqual(['Start with Codex'])
  expect(await screen.findByText('Import with CC Switch')).toBeVisible()
  expect(
    screen.queryByText('Set up DSH with one prompt')
  ).not.toBeInTheDocument()
})

it("ends with calling the API from one's own code", async () => {
  const nav = await renderQuickStart('/#api')

  expect(currentEntry(nav)).toEqual(['Call the API directly'])
  expect(
    await screen.findByText(
      /curl https:\/\/ai\.example\.test\/v1\/chat\/completions/
    )
  ).toBeVisible()
})

it('falls back to DSH when the address names no client', async () => {
  const nav = await renderQuickStart('/#nothing-like-this')

  expect(currentEntry(nav)).toEqual(['Start with DSH'])
})

it('switches guides when another entry in the row is picked', async () => {
  const user = userEvent.setup()
  const nav = await renderQuickStart('/')

  await user.click(
    within(nav).getByRole('link', { name: 'Start with Claude Code' })
  )

  expect(currentEntry(nav)).toEqual(['Start with Claude Code'])
  expect(
    await screen.findByText(/CC Switch adds DEMO to Claude Code/)
  ).toBeVisible()
})

it('keeps the remaining clients in the More clients menu', async () => {
  const user = userEvent.setup()
  const nav = await renderQuickStart('/')
  const more = within(nav).getByRole('button', { name: 'More clients' })

  await user.click(more)

  expect(await screen.findByRole('menu')).toBeVisible()
  expect(more).toHaveAttribute('aria-expanded', 'true')
  expect(
    screen.getAllByRole('menuitemradio').map((item) => item.textContent)
  ).toEqual([
    'Start with OpenCode',
    'Start with OpenClaw',
    'Start with Pi',
    'Start with Grok Build',
  ])
  for (const item of screen.getAllByRole('menuitemradio')) {
    expect(item).toHaveAttribute('aria-checked', 'false')
  }
})

it('opens the guide of a client picked from the More clients menu', async () => {
  const user = userEvent.setup()
  const nav = await renderQuickStart('/')

  await user.click(within(nav).getByRole('button', { name: 'More clients' }))
  await user.click(
    await screen.findByRole('menuitemradio', { name: 'Start with OpenCode' })
  )

  expect(await screen.findByText(/@ai-sdk\/openai-compatible/)).toBeVisible()
  expect(
    within(nav).getByRole('button', { name: 'Start with OpenCode' })
  ).toHaveAttribute('aria-current', 'page')
  expect(
    within(nav)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
  ).toHaveLength(0)
})

it('opens and closes the menu from the keyboard', async () => {
  const user = userEvent.setup()
  const nav = await renderQuickStart('/')
  const more = within(nav).getByRole('button', { name: 'More clients' })

  more.focus()
  await user.keyboard('{Enter}')

  expect(await screen.findByRole('menu')).toBeVisible()
  expect(
    screen.getByRole('menuitemradio', { name: 'Start with OpenCode' })
  ).toBeVisible()

  await user.keyboard('{Escape}')

  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(more).toHaveAttribute('aria-expanded', 'false')
  expect(more).toHaveFocus()
})

it('shows a client opened from the address even when it is in the menu', async () => {
  const user = userEvent.setup()
  const nav = await renderQuickStart('/#opencode')
  const chosen = within(nav).getByRole('button', {
    name: 'Start with OpenCode',
  })

  expect(chosen).toHaveAttribute('aria-current', 'page')
  expect(await screen.findByText(/@ai-sdk\/openai-compatible/)).toBeVisible()

  await user.click(chosen)

  expect(
    await screen.findByRole('menuitemradio', { name: 'Start with OpenCode' })
  ).toHaveAttribute('aria-checked', 'true')
  expect(
    within(nav).getByRole('button', { name: 'Start with OpenCode' })
  ).toHaveAttribute('aria-expanded', 'true')
})

it('scrolls the row so that the chosen entry is centred', async () => {
  const user = userEvent.setup()
  const nav = await renderQuickStart('/')
  const apiEntry = within(nav).getByRole('link', {
    name: 'Call the API directly',
  })

  let scrollLeft = 0
  Object.defineProperty(nav, 'scrollLeft', {
    configurable: true,
    get: () => scrollLeft,
    set: (value: number) => {
      scrollLeft = value
    },
  })
  Object.defineProperty(nav, 'clientWidth', {
    configurable: true,
    value: 500,
  })
  Object.defineProperty(apiEntry, 'offsetLeft', {
    configurable: true,
    value: 600,
  })
  Object.defineProperty(apiEntry, 'clientWidth', {
    configurable: true,
    value: 100,
  })

  await user.click(apiEntry)

  expect(scrollLeft).toBe(400)
})
