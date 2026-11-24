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
import { DEFAULT_SYSTEM_NAME } from '@/lib/constants'
import { STATUS_QUERY_KEY } from '@/lib/status-query'

import { SignIn } from '../sign-in'
import { SignUp } from '../sign-up'

const clients: QueryClient[] = []

afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  vi.restoreAllMocks()
})

function renderAuthPage(
  page: string,
  status: Record<string, unknown> = {},
  risk = { required: false, verified: false, available: true }
) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(api, 'get').mockImplementation(async (path) => ({
    data:
      path === '/api/user/registration-device'
        ? { success: true, data: risk }
        : {
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
  }))
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  client.setQueryData(STATUS_QUERY_KEY, {
    password_login_enabled: true,
    user_agreement_enabled: true,
    privacy_policy_enabled: true,
    email_verification: true,
    ...status,
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
}

test.each(['/sign-in', '/sign-up'])(
  '%s keeps one column with the form under a hairline header',
  async (page) => {
    renderAuthPage(page)
    await screen.findByRole('checkbox')

    const card = document.querySelector('[data-slot=auth-card]') as HTMLElement
    const eyebrow = card.querySelector(
      '[data-slot=auth-eyebrow]'
    ) as HTMLElement
    const form = card.querySelector('[data-slot=auth-form]') as HTMLElement
    expect(card).toHaveClass('max-w-[460px]')
    expect(card).toHaveClass('border')
    expect(within(card).getAllByRole('main')).toHaveLength(1)
    expect(eyebrow).not.toBeNull()
    expect(form).not.toBeNull()
    expect(
      eyebrow.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  }
)

test('names the site and the way in on the hairline header', async () => {
  renderAuthPage('/sign-in')
  await screen.findByRole('checkbox')

  const eyebrow = document.querySelector('[data-slot=auth-eyebrow]')
  expect(eyebrow).toHaveTextContent(DEFAULT_SYSTEM_NAME)
  expect(eyebrow).toHaveTextContent('Sign in')
})

test('labels carry the field hints instead of placeholders', async () => {
  renderAuthPage('/sign-up')
  const password = await screen.findByLabelText('Password (8–128 characters)')
  expect(password).not.toHaveAttribute('placeholder')

  const form = document.querySelector('[data-slot=auth-form]') as HTMLElement
  const inputs = () => [...form.querySelectorAll('input')]
  expect(inputs().length).toBeGreaterThan(2)
  expect(inputs().filter((input) => input.hasAttribute('placeholder'))).toEqual(
    []
  )

  await userEvent.type(screen.getByLabelText('Username'), 'reader')
  await userEvent.type(password, 'Passw0rd!123')
  await userEvent.type(
    screen.getByLabelText('Confirm password'),
    'Passw0rd!123'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Next' }))

  await screen.findByLabelText('Email (required for verification)')
  expect(screen.getByLabelText('Verification code')).not.toHaveAttribute(
    'placeholder'
  )
  expect(screen.getByLabelText('Invite code (optional)')).not.toHaveAttribute(
    'placeholder'
  )
  expect(inputs().filter((input) => input.hasAttribute('placeholder'))).toEqual(
    []
  )
})

test('sign-up asks for the account first and the verified email second', async () => {
  renderAuthPage('/sign-up')
  await screen.findByLabelText('Username')
  expect(screen.getByLabelText('Confirm password')).toBeInTheDocument()
  expect(
    screen.queryByLabelText('Email (required for verification)')
  ).toBeNull()

  await userEvent.type(screen.getByLabelText('Username'), 'reader')
  await userEvent.type(
    screen.getByLabelText('Password (8–128 characters)'),
    'Passw0rd!123'
  )
  await userEvent.type(
    screen.getByLabelText('Confirm password'),
    'Passw0rd!123'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Next' }))

  expect(
    await screen.findByLabelText('Email (required for verification)')
  ).toBeInTheDocument()
  expect(screen.queryByLabelText('Username')).toBeNull()

  await userEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(await screen.findByLabelText('Username')).toBeInTheDocument()
})

test('keeps the fields on one page when email verification is off', async () => {
  renderAuthPage('/sign-up', { email_verification: false })
  await screen.findByLabelText('Username')

  expect(screen.getByLabelText('Confirm password')).toBeInTheDocument()
  expect(screen.getByLabelText('Invite code (optional)')).toBeInTheDocument()
  expect(
    screen.queryByLabelText('Email (required for verification)')
  ).toBeNull()
  expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
  expect(
    screen.getByRole('button', { name: 'Create account' })
  ).toBeInTheDocument()
})

test('the form column grows with the page instead of scrolling on its own', async () => {
  renderAuthPage('/sign-up')
  await screen.findByRole('checkbox')

  const page = document.querySelector('[data-slot=auth-page]') as HTMLElement
  const card = document.querySelector('[data-slot=auth-card]') as HTMLElement
  const form = document.querySelector('[data-slot=auth-form]') as HTMLElement
  expect(page).toHaveClass('min-h-svh')
  expect(page).not.toHaveClass('h-svh')
  expect(card).not.toHaveClass('h-svh')
  expect(form).not.toHaveClass('overflow-y-auto')
  expect(form).not.toHaveClass('overflow-hidden')
})

test('OAuth registration can reach local verification without entering a password', async () => {
  const post = vi.spyOn(api, 'post')
  renderAuthPage(
    '/sign-up',
    {
      email_verification: false,
      github_oauth: true,
      github_client_id: 'test-provider',
    },
    { required: true, verified: false, available: true }
  )
  const next = await screen.findByRole('button', {
    name: 'Additional registration verification',
  })
  expect(
    screen.getByRole('button', { name: /Continue with GitHub/ })
  ).toBeDisabled()
  await userEvent.click(next)
  expect(
    await screen.findByLabelText('Email (required for verification)')
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()
  expect(post).not.toHaveBeenCalled()
})
