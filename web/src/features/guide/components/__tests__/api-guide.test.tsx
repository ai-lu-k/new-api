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
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { ApiGuide } from '../api-guide'

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
        protocols: ['openai-completions', 'anthropic-messages'],
      },
      { id: 'codex-only', protocols: ['openai-responses'] },
    ],
  }
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/dsh_setup/models') {
      return { data: { success: true, data: catalog } }
    }
    if (String(url).startsWith('/api/token/search?')) {
      return {
        data: {
          success: true,
          data: {
            items: [
              {
                id: 21,
                name: 'Quick Start',
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
    if (url === '/api/token/21/key') {
      return { data: { success: true, data: { key: 'full-secret-key-21' } } }
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

async function renderGuide() {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queries.setQueryData(['status'], {
    system_name: 'LUK',
    server_address: 'https://ai.example.test',
  })
  const router = createRouter({
    routeTree: createRootRoute({ component: ApiGuide }),
    history: createMemoryHistory({ initialEntries: ['/#api'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={queries}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByText('Call the API directly')
}

it('shows a visitor a runnable request with a placeholder and where to sign in', async () => {
  await renderGuide()

  expect(screen.getByRole('button', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/sign-in?redirect=%2F%23api'
  )
  // The site's default model, in the first language offered.
  expect(
    screen.getByText(/curl https:\/\/ai\.example\.test\/v1\/chat\/completions/)
  ).toHaveTextContent('Authorization: Bearer YOUR_API_KEY')
  expect(
    screen.getByRole('combobox', { name: 'Pick the model to call:' })
  ).toHaveValue('deepseek/deepseek-v4.1-flash')
  expect(screen.getByText('https://ai.example.test/v1')).toBeVisible()
})

it('offers only models one of the two formats can call', async () => {
  await renderGuide()

  expect(
    screen.getAllByRole('option').map((option) => option.textContent)
  ).toEqual([
    'claude-sonnet-5-5',
    'DeepSeek V4.1 Flash (deepseek/deepseek-v4.1-flash)',
  ])
})

it('prepares a key, shows it masked in the example and copies the example whole', async () => {
  signIn()
  const user = userEvent.setup()
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  await renderGuide()

  await user.click(
    screen.getByRole('button', { name: 'Create and copy API key' })
  )

  expect(copy).toHaveBeenLastCalledWith('sk-full-secret-key-21')
  const shown = await screen.findByText(/Authorization: Bearer sk-fu…y-21/)
  expect(screen.queryByText(/full-secret-key-21/)).not.toBeInTheDocument()

  const block = shown.closest('div')
  if (!block) throw new Error('the example has no wrapper')
  await user.click(
    block.querySelector('button') ?? document.createElement('button')
  )
  expect(copy.mock.lastCall?.[0]).toContain(
    'Authorization: Bearer sk-full-secret-key-21'
  )
})

it('switches to the Anthropic format for a model served only on it', async () => {
  const user = userEvent.setup()
  await renderGuide()

  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Pick the model to call:' }),
    'claude-sonnet-5-5'
  )

  expect(
    screen.getByText(/curl https:\/\/ai\.example\.test\/v1\/messages/)
  ).toHaveTextContent('x-api-key: YOUR_API_KEY')
  expect(
    screen.getByText(
      'This model is called through the Anthropic Messages API. Base URL:'
    )
  ).toBeVisible()
  // The Anthropic SDKs add the path themselves.
  expect(screen.getByText('https://ai.example.test')).toBeVisible()
})

it('gives the same request in each language', async () => {
  const user = userEvent.setup()
  await renderGuide()

  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
    'cURL',
    'Python',
    'Node.js',
    'Go',
    'Java',
  ])

  await user.click(screen.getByRole('tab', { name: 'Python' }))
  expect(await screen.findByText(/from openai import OpenAI/)).toBeVisible()

  await user.click(screen.getByRole('tab', { name: 'Go' }))
  expect(await screen.findByText(/http\.NewRequest\("POST"/)).toBeVisible()
})

it('explains how to create a key by hand when the site cannot prepare one', async () => {
  catalog.auto_group = false
  signIn()
  await renderGuide()

  expect(screen.getByRole('button', { name: 'API Keys' })).toHaveAttribute(
    'href',
    '/keys'
  )
  expect(
    screen.queryByRole('button', { name: 'Create and copy API key' })
  ).not.toBeInTheDocument()
  expect(screen.getByText(/choose Create API Key/)).toBeVisible()
})
