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
import { useAuthStore } from '@/stores/auth-store'

import { AGENT_CLIENTS, type AgentClient } from '../../lib/agents'
import { AgentGuide } from '../agent-guide'

function clientNamed(id: string): AgentClient {
  const found = AGENT_CLIENTS.find((client) => client.id === id)
  if (!found) throw new Error(`no client ${id}`)
  return found
}

const codex = clientNamed('codex')
const claudeCode = clientNamed('claude-code')

let catalog: Record<string, unknown>

beforeEach(() => {
  catalog = {
    auto_group: true,
    default_model: 'deepseek/deepseek-v4.1-flash',
    models: [
      { id: 'claude-sonnet-5-5', protocols: ['anthropic-messages'] },
      {
        id: 'deepseek/deepseek-v4.1-flash',
        name: 'DeepSeek V4.1 Flash',
        protocols: ['openai-completions', 'openai-responses'],
      },
      { id: 'glm-5.3', protocols: ['openai-completions'] },
      {
        id: 'gpt-5.6-sol',
        name: 'GPT-5.6 Sol',
        protocols: ['openai-completions', 'openai-responses'],
      },
    ],
  }
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/dsh_setup/models') {
      return { data: { success: true, data: catalog } }
    }
    if (String(url).startsWith('/api/token/search?keyword=Codex')) {
      return {
        data: {
          success: true,
          data: {
            items: [
              {
                id: 11,
                name: 'Codex',
                key: 'masked',
                status: 1,
                group: 'auto',
                unlimited_quota: true,
                expired_time: -1,
                model_limits_enabled: false,
                allow_ips: '',
              },
            ],
          },
        },
      }
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.spyOn(api, 'post').mockImplementation(async (url) => {
    if (url === '/api/token/11/key') {
      return { data: { success: true, data: { key: 'full-secret-key-11' } } }
    }
    throw new Error(`Unexpected request: ${url}`)
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
})

function signIn() {
  useAuthStore.getState().auth.setUser({ id: 7, username: 'ada', role: 1 })
}

async function renderGuide(client: AgentClient) {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queries.setQueryData(['status'], {
    system_name: 'LUK',
    server_address: 'https://ai.example.test',
  })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <AgentGuide client={client} />,
    }),
    history: createMemoryHistory({ initialEntries: ['/#codex'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={queries}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return screen.findByRole('combobox', { name: 'Model to start with' })
}

it('offers the models the client can speak to, starting with its own family', async () => {
  const select = await renderGuide(codex)

  expect(select).toHaveValue('gpt-5.6-sol')
  expect(
    within(select)
      .getAllByRole('option')
      .map((option) => option.textContent)
  ).toEqual([
    'DeepSeek V4.1 Flash (deepseek/deepseek-v4.1-flash)',
    'GPT-5.6 Sol (gpt-5.6-sol)',
  ])
})

it('hands CC Switch the prepared key, the address and the chosen model', async () => {
  signIn()
  const user = userEvent.setup()
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  const select = await renderGuide(codex)

  await user.selectOptions(select, 'deepseek/deepseek-v4.1-flash')
  await user.click(screen.getByRole('button', { name: 'Import to CC Switch' }))

  expect(open).toHaveBeenCalledTimes(1)
  const [link, target] = open.mock.calls[0]
  expect(target).toBe('_self')
  expect(Object.fromEntries(new URL(String(link)).searchParams)).toMatchObject({
    app: 'codex',
    name: 'LUK',
    endpoint: 'https://ai.example.test/v1',
    apiKey: 'sk-full-secret-key-11',
    model: 'deepseek/deepseek-v4.1-flash',
  })
})

it('copies the key, then shows the config with the key masked but copies it whole', async () => {
  signIn()
  const user = userEvent.setup()
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  await renderGuide(codex)
  expect(screen.getByText(/export LUK_API_KEY="YOUR_API_KEY"/)).toBeVisible()

  await user.click(
    screen.getByRole('button', { name: 'Create and copy API key' })
  )

  expect(copy).toHaveBeenLastCalledWith('sk-full-secret-key-11')
  const exported = await screen.findByText(/export LUK_API_KEY="sk-fu…y-11"/)
  expect(screen.queryByText(/full-secret-key-11/)).not.toBeInTheDocument()

  const row = exported.closest('li')
  if (!row) throw new Error('the export line is not inside a step')
  await user.click(
    within(row).getByRole('button', { name: 'Copy to clipboard' })
  )
  expect(copy).toHaveBeenLastCalledWith(
    'export LUK_API_KEY="sk-full-secret-key-11"'
  )
})

it('asks a visitor to sign in and shows the config with a placeholder', async () => {
  await renderGuide(claudeCode)

  expect(screen.getByRole('button', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/sign-in?redirect=%2F%23codex'
  )
  expect(
    screen.queryByRole('button', { name: 'Import to CC Switch' })
  ).not.toBeInTheDocument()
  expect(
    screen.getByText(/"ANTHROPIC_AUTH_TOKEN": "YOUR_API_KEY"/)
  ).toBeVisible()
  expect(
    screen.getByText(/"ANTHROPIC_MODEL": "claude-sonnet-5-5"/)
  ).toBeVisible()
})

it('points to the console when one key cannot reach every model', async () => {
  catalog.auto_group = false
  signIn()
  await renderGuide(codex)

  expect(screen.getByRole('button', { name: 'API Keys' })).toHaveAttribute(
    'href',
    '/keys'
  )
  expect(
    screen.queryByRole('button', { name: 'Import to CC Switch' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Create and copy API key' })
  ).not.toBeInTheDocument()
})

it('says so when the site has no model the client can use', async () => {
  catalog.models = [{ id: 'glm-5.3', protocols: ['openai-completions'] }]
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queries.setQueryData(['status'], { system_name: 'LUK' })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <AgentGuide client={codex} />,
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={queries}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )

  expect(
    await screen.findByText('This site has no model that Codex can use yet.')
  ).toBeVisible()
})
