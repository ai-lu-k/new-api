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
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { DshQuickSetup } from '../dsh-quick-setup'

function shellCommand(code: string) {
  return `curl -fsSL https://ai.example.test/api/dsh_setup/setup.sh | sh -s -- ${code}`
}

function powershellCommand(code: string) {
  return `$env:LUK_SETUP_CODE='${code}'; irm https://ai.example.test/api/dsh_setup/setup.ps1 | iex`
}

/**
 * Matches the prompt that carries this code. The queries collapse whitespace
 * first, so the line break after the command is a space by then.
 */
function promptFor(code: string) {
  return new RegExp(`sh -s -- ${code} `)
}

/** What the server answers instead of a code, when it refuses. */
let refusal: string | null
let codeRequests: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  refusal = null
  let issued = 0
  codeRequests = vi.spyOn(api, 'post').mockImplementation(async (url) => {
    if (url !== '/api/dsh_setup/code') {
      throw new Error(`Unexpected request: ${url}`)
    }
    if (refusal) return { data: { success: false, message: refusal } }
    issued += 1
    return {
      data: {
        success: true,
        data: {
          code: `code-${issued}`,
          expires_at: Math.floor(Date.now() / 1000) + 600,
        },
      },
    }
  })
})

/** What the models listing answers; null makes it fail. */
let models: { id: string; name?: string }[] | null

beforeEach(() => {
  models = [
    { id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' },
    { id: 'glm-5.3' },
  ]
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url !== '/api/dsh_setup/models') {
      throw new Error(`Unexpected request: ${url}`)
    }
    if (models === null) return { data: { success: false, message: 'down' } }
    return {
      data: {
        success: true,
        data: { auto_group: true, default_model: 'glm-5.3', models },
      },
    }
  })
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

function showPage(visibility: 'visible' | 'hidden') {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(visibility)
  fireEvent(document, new Event('visibilitychange'))
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
    history: createMemoryHistory({ initialEntries: ['/#dsh'] }),
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
  expect(codeRequests).not.toHaveBeenCalled()
})

it('has a visitor sign in first and come back, without asking for a code', async () => {
  await renderQuickSetup({ dsh_setup_enabled: true })

  // The shared Button gives a link the button role.
  const link = await screen.findByRole('button', { name: 'Sign in' })
  expect(link).toHaveAttribute('href', '/sign-in?redirect=%2F%23dsh')
  expect(
    screen.queryByRole('button', { name: 'Copy prompt' })
  ).not.toBeInTheDocument()
  expect(screen.queryByText('Set it up by hand')).not.toBeInTheDocument()
  expect(codeRequests).not.toHaveBeenCalled()
})

it('shows a signed-in user the prompt at once, with the command for each system', async () => {
  signIn()
  await renderQuickSetup({ dsh_setup_enabled: true })

  const prompt = await screen.findByText(/Please connect the LUK models to DSH/)
  expect(prompt).toHaveTextContent(shellCommand('code-1'))
  expect(prompt).toHaveTextContent(powershellCommand('code-1'))
  expect(codeRequests).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('tab')).not.toBeInTheDocument()
})

it('has DSH ask which model to use and match it to the official model itself', async () => {
  signIn()
  await renderQuickSetup({ dsh_setup_enabled: true })

  const prompt = await screen.findByText(/Please connect the LUK models to DSH/)
  const text = prompt.textContent ?? ''
  // The question comes first, with the models as its choices.
  expect(text).toMatch(
    /Step 1\. Ask me which model I want to use\..*ask_user_question.*\n- deepseek\/deepseek-v4\.1-flash — DeepSeek V4\.1 Flash\n- glm-5\.3\n/
  )
  expect(text.indexOf('Step 1.')).toBeLessThan(text.indexOf('Step 2.'))
  expect(text.indexOf(shellCommand('code-1'))).toBeLessThan(
    text.indexOf('Step 3.')
  )
  // The site keeps no limits per model: DSH is sent to look them up.
  expect(text).toMatch(
    /Step 3\..*agent-default-model.*look up its official specifications yourself.*contextWindow, maxTokens, input and reasoningEfforts/
  )
  expect(text).toContain('do not read or print .credentials.yaml')
  // Declared levels do nothing until one is selected, so the default is set too.
  expect(text).toMatch(/set reasoningEffort in agent-default-model/)
  expect(text).toMatch(/docs\S+user\S+guide\S+providers\.md/)
})

it('still gives a prompt when the models cannot be listed', async () => {
  models = null
  signIn()
  await renderQuickSetup({ dsh_setup_enabled: true })

  const prompt = await screen.findByText(/Please connect the LUK models to DSH/)
  expect(prompt).toHaveTextContent(shellCommand('code-1'))
  expect(prompt.textContent).not.toMatch(/\n- /)
})

it('gives the bare command to run by hand, one per system', async () => {
  signIn()
  const user = userEvent.setup()
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  await renderQuickSetup({ dsh_setup_enabled: true })
  await screen.findByText(/Please connect the LUK models to DSH/)

  expect(screen.getByText('Set it up by hand')).toBeVisible()
  expect(screen.getByText(shellCommand('code-1'))).toBeVisible()
  expect(screen.getByText(powershellCommand('code-1'))).toBeVisible()

  // The test translations escape the slash in the system's name.
  await user.click(
    screen.getByRole('button', { name: /^Copy the command for macOS/ })
  )

  expect(copy).toHaveBeenLastCalledWith(shellCommand('code-1'))
  // A copied command counts as used too.
  expect(await screen.findByText(shellCommand('code-2'))).toBeVisible()
})

it('copies the prompt without the key and lines up a fresh one', async () => {
  signIn()
  const user = userEvent.setup()
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  await renderQuickSetup({ dsh_setup_enabled: true })

  await user.click(await screen.findByRole('button', { name: 'Copy prompt' }))

  expect(copy).toHaveBeenCalledTimes(1)
  const copied = copy.mock.calls[0][0]
  expect(copied).toContain(shellCommand('code-1'))
  expect(copied).toContain(powershellCommand('code-1'))
  expect(copied).not.toMatch(/sk-/)
  // The copied prompt counts as used, so the page moves on to the next code.
  expect(await screen.findByText(promptFor('code-2'))).toBeInTheDocument()
  expect(codeRequests).toHaveBeenCalledTimes(2)
})

it('moves on to a fresh prompt when the text is copied by hand', async () => {
  signIn()
  await renderQuickSetup({ dsh_setup_enabled: true })
  const prompt = await screen.findByText(promptFor('code-1'))

  fireEvent.copy(prompt)

  expect(await screen.findByText(promptFor('code-2'))).toBeInTheDocument()
})

it('says why there is no prompt when the server turns the request down', async () => {
  refusal = 'Your account cannot use the Auto group'
  signIn()
  const user = userEvent.setup()
  await renderQuickSetup({ dsh_setup_enabled: true })

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Your account cannot use the Auto group'
  )
  expect(
    screen.queryByRole('button', { name: 'Copy prompt' })
  ).not.toBeInTheDocument()

  refusal = null
  await user.click(screen.getByRole('button', { name: 'Retry' }))

  expect(await screen.findByText(promptFor('code-1'))).toBeInTheDocument()
})

it('replaces the prompt a minute before its ten minutes are up', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  signIn()
  await renderQuickSetup({ dsh_setup_enabled: true })
  expect(await screen.findByText(promptFor('code-1'))).toBeInTheDocument()

  act(() => {
    vi.advanceTimersByTime(8 * 60 * 1000)
  })
  expect(codeRequests).toHaveBeenCalledTimes(1)

  act(() => {
    vi.advanceTimersByTime(61 * 1000)
  })

  expect(await screen.findByText(promptFor('code-2'))).toBeInTheDocument()
  expect(codeRequests).toHaveBeenCalledTimes(2)
})

it('leaves a hidden page alone and catches up when it is shown again', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  signIn()
  await renderQuickSetup({ dsh_setup_enabled: true })
  expect(await screen.findByText(promptFor('code-1'))).toBeInTheDocument()

  showPage('hidden')
  act(() => {
    vi.advanceTimersByTime(11 * 60 * 1000)
  })
  expect(codeRequests).toHaveBeenCalledTimes(1)

  showPage('visible')
  act(() => {
    vi.advanceTimersByTime(1)
  })

  // The dead prompt is withdrawn before its successor arrives.
  await waitFor(() =>
    expect(screen.queryByText(promptFor('code-1'))).not.toBeInTheDocument()
  )
  expect(await screen.findByText(promptFor('code-2'))).toBeInTheDocument()
  expect(codeRequests).toHaveBeenCalledTimes(2)
})
