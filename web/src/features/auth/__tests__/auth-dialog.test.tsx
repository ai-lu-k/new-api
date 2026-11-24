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
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { openAuthDialog, useAuthDialogStore } from '@/stores/auth-dialog-store'

import { AuthDialog } from '../components/auth-dialog'

let client: QueryClient
let router: ReturnType<typeof createRouter>

function homeRoute() {
  return createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Home page</div>,
  })
}

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <AuthDialog />
    </>
  ),
})

const routeTree = rootRoute.addChildren([
  homeRoute(),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/forgot-password',
    component: () => <div>Forgot password page</div>,
  }),
])

beforeEach(async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(STATUS_QUERY_KEY, {
    password_login_enabled: true,
    register_enabled: true,
    user_agreement_enabled: false,
    privacy_policy_enabled: false,
    email_verification: false,
  })
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: {} } })
  router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByText('Home page')
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthDialogStore.setState({ mode: null, redirectTo: undefined })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AuthDialog', () => {
  it('opens over the current page without navigating away', async () => {
    openAuthDialog('sign-in')

    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(screen.getByText('Home page')).toBeVisible()
    expect(router.state.location.pathname).toBe('/')
  })

  it('switches between sign in and registration in place', async () => {
    const user = userEvent.setup()
    openAuthDialog('sign-in')
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(
      await screen.findByRole('heading', { name: 'Create an account' })
    ).toBeVisible()
    expect(router.state.location.pathname).toBe('/')

    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(
      await screen.findByRole('heading', { name: 'Sign in' })
    ).toBeVisible()
  })

  it('closes when a link inside the panel navigates the page', async () => {
    const user = userEvent.setup()
    openAuthDialog('sign-in')
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('link', { name: 'Forgot password?' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(router.state.location.pathname).toBe('/forgot-password')
  })

  it('closes on Escape and leaves the page underneath untouched', async () => {
    const user = userEvent.setup()
    openAuthDialog('sign-in')
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Home page')).toBeVisible()
    expect(useAuthDialogStore.getState().mode).toBeNull()
  })

  it('opens directly in registration mode when requested', async () => {
    openAuthDialog('sign-up')

    expect(
      await screen.findByRole('heading', { name: 'Create an account' })
    ).toBeVisible()
  })
})
