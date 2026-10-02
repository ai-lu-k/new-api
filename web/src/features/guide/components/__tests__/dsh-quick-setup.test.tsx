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
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { DshQuickSetup } from '../dsh-quick-setup'

const shellCommand =
  'curl -fsSL https://ai.example.test/api/dsh_setup/setup.sh | sh -s -- the-setup-code'
const powershellCommand =
  "$env:LUK_SETUP_CODE='the-setup-code'; irm https://ai.example.test/api/dsh_setup/setup.ps1 | iex"

let codeResponse: unknown

beforeEach(() => {
  codeResponse = {
    success: true,
    data: {
      code: 'the-setup-code',
      expires_at: Math.floor(Date.now() / 1000) + 600,
    },
  }
  vi.spyOn(api, 'post').mockImplementation(async (url) => {
    if (url !== '/api/dsh_setup/code') {
      throw new Error(`Unexpected request: ${url}`)
    }
    return { data: codeResponse }
  })
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
})

function signIn() {
  useAuthStore.getState().auth.setUser({ id: 7, username: 'ada', role: 1 })
}

async function renderQuickSetup(status: Record<string, unknown>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['status'], {
    system_name: 'LUK',
    server_address: 'https://ai.example.test',
    ...status,
  })
  const router = createRouter({
    routeTree: createRootRoute({ component: DshQuickSetup }),
    history: createMemoryHistory({ initialEntries: ['/guide'] }),
  })
  await router.load()
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

it('stays out of the page while the site has the setup switched off', async () => {
  signIn()
  const view = await renderQuickSetup({ dsh_setup_enabled: false })

  expect(view.container).toBeEmptyDOMElement()
})

it('sends a visitor to sign in and come back instead of offering a command', async () => {
  await renderQuickSetup({ dsh_setup_enabled: true })

  // The shared Button gives a link the button role.
  const link = await screen.findByRole('button', { name: 'Sign in' })
  expect(link).toHaveAttribute('href', '/sign-in?redirect=%2Fguide')
  expect(
    screen.queryByRole('button', { name: 'Generate setup command' })
  ).not.toBeInTheDocument()
})

it('shows the command for each shell once a signed-in user generates one', async () => {
  signIn()
  const user = userEvent.setup()
  await renderQuickSetup({ dsh_setup_enabled: true })

  await user.click(
    await screen.findByRole('button', { name: 'Generate setup command' })
  )

  expect(await screen.findByText(shellCommand)).toBeInTheDocument()
  await user.click(screen.getByRole('tab', { name: 'Windows' }))
  expect(await screen.findByText(powershellCommand)).toBeInTheDocument()
  expect(
    screen.getByText('Paste this into PowerShell and run it:')
  ).toBeInTheDocument()
})

it('offers the Windows command first to a visitor on Windows', async () => {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  )
  signIn()
  const user = userEvent.setup()
  await renderQuickSetup({ dsh_setup_enabled: true })

  await user.click(
    await screen.findByRole('button', { name: 'Generate setup command' })
  )

  expect(await screen.findByText(powershellCommand)).toBeInTheDocument()
  expect(screen.queryByText(shellCommand)).not.toBeInTheDocument()
})

it('copies a prompt for DSH that carries the command but not the key', async () => {
  signIn()
  const user = userEvent.setup()
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  await renderQuickSetup({ dsh_setup_enabled: true })
  await user.click(
    await screen.findByRole('button', { name: 'Generate setup command' })
  )

  await user.click(
    await screen.findByRole('button', { name: 'Copy prompt for DSH' })
  )

  expect(copy).toHaveBeenCalledTimes(1)
  const prompt = copy.mock.calls[0][0]
  expect(prompt).toContain(shellCommand)
  expect(prompt).not.toMatch(/sk-/)
})

it('offers no command when the server turns the request down', async () => {
  codeResponse = {
    success: false,
    message: 'Your account cannot use the Auto group',
  }
  signIn()
  const user = userEvent.setup()
  await renderQuickSetup({ dsh_setup_enabled: true })

  await user.click(
    await screen.findByRole('button', { name: 'Generate setup command' })
  )

  expect(
    await screen.findByText('Your account cannot use the Auto group')
  ).toBeInTheDocument()
  expect(screen.queryByText(shellCommand)).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Generate setup command' })
  ).toBeEnabled()
})

it('withdraws the command when its ten minutes are up', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  signIn()
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  await renderQuickSetup({ dsh_setup_enabled: true })
  await user.click(
    await screen.findByRole('button', { name: 'Generate setup command' })
  )
  expect(await screen.findByText(shellCommand)).toBeInTheDocument()

  act(() => {
    vi.advanceTimersByTime(601_000)
  })

  expect(screen.queryByText(shellCommand)).not.toBeInTheDocument()
  expect(screen.getByText('This command has expired.')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Generate setup command' })
  ).toBeEnabled()
})
