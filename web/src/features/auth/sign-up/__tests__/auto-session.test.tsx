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

import { Toaster } from '@/components/ui/sonner'
import { api } from '@/lib/api'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useAuthStore } from '@/stores/auth-store'

import { SignUpForm } from '../components/sign-up-form'

let client: QueryClient
let router: ReturnType<typeof createRouter>

const now = Math.floor(Date.now() / 1000)

const registerBundle = {
  access_token: 'register-bundle-access-token',
  token_type: 'Bearer',
  access_expires_at: now + 900,
  user: { id: 42, username: 'register-user', role: 1 },
  session: {
    sid: 'register-session-sid',
    current: true,
    login_method: 'register',
    ip: '127.0.0.1',
    user_agent: 'jsdom',
    created_at: now,
    last_active_at: now,
    expires_at: now + 3600,
  },
}

const registerChallenge = {
  require_verification: true,
  flow_token: 'register-flow-token',
  expires_at: now + 300,
  methods: [{ method: '2fa', available: true }],
}

const rootRoute = createRootRoute({ component: () => <Outlet /> })

const routeTree = rootRoute.addChildren([
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/sign-up',
    component: () => <SignUpForm {...(props ?? {})} />,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/sign-in',
    component: () => <div>Sign in page</div>,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    component: () => <div>Dashboard page</div>,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/otp',
    component: () => <div>OTP page</div>,
  }),
])

let props: Parameters<typeof SignUpForm>[0] | undefined

async function setupSignUpRoute(setupProps?: Parameters<typeof SignUpForm>[0]) {
  props = setupProps
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/user/registration-device') {
      return {
        data: {
          success: true,
          data: { required: false, verified: false, available: true },
        },
      }
    }
    if (url === '/api/legal/current') {
      return {
        data: {
          success: true,
          data: { id: 1, user_agreement: '', privacy_policy: '' },
        },
      }
    }
    throw new Error(`Unexpected GET ${url}`)
  })
  client.setQueryData(STATUS_QUERY_KEY, {
    password_login_enabled: true,
    register_enabled: true,
    password_register_enabled: true,
    email_verification: false,
    oauth_register_enabled: true,
    user_agreement_enabled: false,
    privacy_policy_enabled: false,
  })
  router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/sign-up'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  )
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled()
  )
}

function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  return (async () => {
    await user.type(screen.getByLabelText('Username'), 'register-user')
    await user.type(
      screen.getByLabelText('Password (8–128 characters)'),
      'register-password-1x'
    )
    await user.type(
      screen.getByLabelText('Confirm password'),
      'register-password-1x'
    )
    await user.click(screen.getByRole('button', { name: 'Create account' }))
  })()
}

function mockSuccessfulRegisterResponse(data: unknown) {
  return vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, message: '', data },
  })
}

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
})

afterEach(() => {
  cleanup()
  client?.clear()
  useAuthStore.getState().auth.reset('idle')
  props = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('SignUpForm registration sessions', () => {
  it('signs the new account in right away and leaves the sign-up page', async () => {
    await setupSignUpRoute()
    const postSpy = mockSuccessfulRegisterResponse(registerBundle)
    const user = userEvent.setup()

    await fillAndSubmit(user)

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledTimes(1)
      expect(router.state.location.pathname).toBe('/dashboard')
    })
    await screen.findByText('Signed in successfully!')
    expect(useAuthStore.getState().auth.session?.sid).toBe(
      'register-session-sid'
    )
  })

  it('stays on the page and calls onAuthenticated for inline sign-up dialogs', async () => {
    const onAuthenticated = vi.fn()
    await setupSignUpRoute({ onAuthenticated })
    const postSpy = mockSuccessfulRegisterResponse(registerBundle)
    const user = userEvent.setup()

    await fillAndSubmit(user)

    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(useAuthStore.getState().auth.session?.sid).toBe(
        'register-session-sid'
      )
    )
    expect(router.state.location.pathname).toBe('/sign-up')
    expect(useAuthStore.getState().auth.session?.sid).toBe(
      'register-session-sid'
    )
    expect(onAuthenticated).toHaveBeenCalledTimes(1)
  })

  it('sends the two-factor challenge to /otp without a session', async () => {
    await setupSignUpRoute()
    mockSuccessfulRegisterResponse(registerChallenge)
    const user = userEvent.setup()

    await fillAndSubmit(user)

    await waitFor(() =>
      expect(
        useAuthStore.getState().auth.pendingLoginVerification?.challenge
          .flow_token
      ).toBe('register-flow-token')
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/otp'))
    expect(useAuthStore.getState().auth.session).toBeNull()
  })

  it('still redirects older deployments without a bundle to the sign-in page', async () => {
    await setupSignUpRoute()
    const postSpy = mockSuccessfulRegisterResponse(undefined)
    const user = userEvent.setup()

    await fillAndSubmit(user)

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledTimes(1)
      expect(router.state.location.pathname).toBe('/sign-in')
    })
    expect(useAuthStore.getState().auth.session).toBeNull()
  })
})
