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
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { STATUS_QUERY_KEY } from '@/lib/status-query'

import { SignIn } from '../sign-in'
import { SignUp } from '../sign-up'

const clients: QueryClient[] = []

afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  vi.restoreAllMocks()
})

test.each([
  { page: '/sign-in', password: true, button: 'Sign in', riskPaused: false },
  {
    page: '/sign-up',
    password: true,
    button: 'Create account',
    riskPaused: false,
  },
  {
    page: '/sign-up',
    password: true,
    button: 'Create account',
    riskPaused: true,
  },
  {
    page: '/sign-in',
    password: false,
    button: /Continue with GitHub/,
    riskPaused: false,
  },
])(
  '$page with password=$password and riskPaused=$riskPaused keeps consent and verification gates on the action',
  async ({ page, password, button, riskPaused }) => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    vi.spyOn(api, 'get').mockImplementation(async (path) =>
      path === '/api/user/registration-device'
        ? {
            data: {
              success: true,
              data: {
                required: riskPaused,
                verified: false,
                available: false,
                site_key: '',
              },
            },
          }
        : {
            data: {
              success: true,
              data: {
                id: 1,
                user_agreement: 'Terms',
                privacy_policy: 'Privacy',
                required_version: 1,
                digest: 'version-one',
                published_at: 100,
              },
            },
          }
    )
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    clients.push(client)
    client.setQueryData(STATUS_QUERY_KEY, {
      user_agreement_enabled: true,
      privacy_policy_enabled: true,
      password_login_enabled: password,
      github_oauth: !password,
      github_client_id: 'test-provider',
    })
    const root = createRootRoute({ component: Outlet })
    const auth = createRoute({
      getParentRoute: () => root,
      id: '(auth)',
      component: Outlet,
    })
    const signIn = createRoute({
      getParentRoute: () => auth,
      path: 'sign-in',
      component: SignIn,
    })
    const signUp = createRoute({
      getParentRoute: () => auth,
      path: 'sign-up',
      component: SignUp,
    })
    const router = createRouter({
      routeTree: root.addChildren([auth.addChildren([signIn, signUp])]),
      history: createMemoryHistory({ initialEntries: [page] }),
    })
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )

    const checkbox = await screen.findByRole('checkbox')
    if (password) {
      const username = screen.getByLabelText(
        page === '/sign-up' ? 'Username' : 'Username or Email'
      )
      await userEvent.type(username, 'draft-reader')
    }
    if (riskPaused) {
      await userEvent.type(
        screen.getByLabelText('Password (8–128 characters)'),
        'Passw0rd!123'
      )
      await userEvent.type(
        screen.getByLabelText('Confirm password'),
        'Passw0rd!123'
      )
      await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    const action = await screen.findByRole('button', {
      name: button,
    })
    expect(
      screen.getAllByRole('button', { name: 'User Agreement' })
    ).toHaveLength(1)
    expect(
      screen.getAllByRole('button', { name: 'Privacy Policy' })
    ).toHaveLength(1)
    expect(
      checkbox.compareDocumentPosition(action) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(checkbox).not.toBeChecked()
    expect(action).toBeDisabled()
    for (const document of [
      { title: 'User Agreement', content: 'Terms' },
      { title: 'Privacy Policy', content: 'Privacy' },
    ]) {
      const trigger = screen.getByRole('button', { name: document.title })
      await userEvent.click(trigger)
      const dialog = await screen.findByRole('dialog', { name: document.title })
      expect(within(dialog).getByText(document.content)).toBeVisible()
      expect(within(dialog).getByText('Version 1')).toBeVisible()
      expect(router.state.location.pathname).toBe(page)
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Close' })
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
      if (password && !riskPaused) {
        expect(
          screen.getByLabelText(
            page === '/sign-up' ? 'Username' : 'Username or Email'
          )
        ).toHaveValue('draft-reader')
      }
      expect(checkbox).not.toBeChecked()
      expect(action).toBeDisabled()
    }
    await userEvent.click(checkbox)
    if (riskPaused) {
      expect(action).toBeDisabled()
      expect(
        await screen.findByText(
          'Human verification is temporarily unavailable. Registration is paused. Please try again later.'
        )
      ).toBeVisible()
      await userEvent.click(screen.getByRole('button', { name: 'Back' }))
      expect(screen.getByLabelText('Username')).toHaveValue('draft-reader')
      return
    }
    expect(action).toBeEnabled()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'User Agreement' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Privacy Policy' })).toHaveFocus()
    await userEvent.tab()
    expect(action).toHaveFocus()
  }
)

test('the invite code is prefilled from the invite link and stays editable', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        id: 1,
        user_agreement: 'Terms',
        privacy_policy: 'Privacy',
        required_version: 1,
        digest: 'version-one',
        published_at: 100,
      },
    },
  })
  window.history.replaceState({}, '', '/sign-up?aff=FROMURL')
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  client.setQueryData(STATUS_QUERY_KEY, {
    user_agreement_enabled: true,
    privacy_policy_enabled: true,
    password_login_enabled: true,
  })
  const root = createRootRoute({ component: Outlet })
  const auth = createRoute({
    getParentRoute: () => root,
    id: '(auth)',
    component: Outlet,
  })
  const signUp = createRoute({
    getParentRoute: () => auth,
    path: 'sign-up',
    component: SignUp,
  })
  const router = createRouter({
    routeTree: root.addChildren([auth.addChildren([signUp])]),
    history: createMemoryHistory({ initialEntries: ['/sign-up?aff=FROMURL'] }),
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )

  const input = await screen.findByLabelText('Invite code (optional)')
  expect(input).toHaveValue('FROMURL')

  await userEvent.clear(input)
  await userEvent.type(input, 'EDITED')
  expect(input).toHaveValue('EDITED')

  window.history.replaceState({}, '', '/')
})
