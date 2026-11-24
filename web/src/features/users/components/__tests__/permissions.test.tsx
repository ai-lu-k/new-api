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
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import type { User } from '../../types'
import { UsersMutateDrawer } from '../users-mutate-drawer'
import { UsersProvider } from '../users-provider'

const target: User = {
  id: 2,
  username: 'managed-admin',
  display_name: 'Managed admin',
  role: 10,
  status: 1,
  quota: 0,
  used_quota: 0,
  request_count: 0,
  group: 'default',
}
const label = "View other accounts' audit logs"
const description =
  'View audit records from user and admin roles. Root records are always excluded.'

function renderPermissions(
  viewerRole: number,
  allowed?: boolean,
  dailyLimits?: Record<string, number>,
  pendingUser?: Promise<{ data: { success: boolean; data: User } }>
) {
  useAuthStore
    .getState()
    .auth.setUser({ id: 1, username: 'operator', role: viewerRole })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (pendingUser && url === '/api/user/2') return pendingUser
    if (url === '/api/authz/catalog') {
      return {
        data: {
          success: true,
          data: {
            resources: [
              {
                resource: 'audit',
                label_key: 'Audit Logs',
                actions: [
                  {
                    action: 'read',
                    label_key: label,
                    description_key: description,
                  },
                ],
              },
            ],
            roles: [{ key: 'admin', grants: { audit: { read: false } } }],
          },
        },
      }
    }
    if (url === '/api/group/') {
      return { data: { success: true, data: ['default'] } }
    }
    return {
      data: {
        success: true,
        data: {
          ...target,
          model_daily_token_defaults: { 'deepseek-v4.1-flash-x0.1': 200000000 },
          model_daily_token_limits: dailyLimits,
          admin_permissions:
            allowed === undefined ? {} : { audit: { read: allowed } },
        },
      },
    }
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <UsersProvider>
        <UsersMutateDrawer
          open
          onOpenChange={() => undefined}
          currentRow={target}
        />
      </UsersProvider>
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.getState().auth.reset()
})

it.each([undefined, true])(
  'root can save an audit grant or revocation from the existing editor (previous=%s)',
  async (allowed) => {
    const put = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })
    renderPermissions(100, allowed)
    await screen.findByDisplayValue('Managed admin')
    const checkbox = await screen.findByRole('checkbox', {
      name: new RegExp(label),
    })
    await waitFor(() =>
      expect(checkbox).toHaveAttribute('aria-checked', String(!!allowed))
    )
    expect(screen.getByText(description)).toBeVisible()
    await userEvent.click(checkbox)
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        '/api/user/',
        expect.objectContaining({
          id: 2,
          admin_permissions: { audit: { read: !allowed } },
        })
      )
    )
  }
)

it('admin cannot edit the audit permission even when the catalog is available', async () => {
  renderPermissions(10)
  await screen.findByDisplayValue('Managed admin')
  expect(
    screen.queryByRole('checkbox', { name: new RegExp(label) })
  ).not.toBeInTheDocument()
})

it.each(['inherit', 'custom', 'unlimited'])(
  'the user editor saves the selected daily token mode: %s',
  async (mode) => {
    const put = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })
    renderPermissions(100, undefined, {
      'deepseek-v4.1-flash-x0.1': 50000000,
    })
    await screen.findByDisplayValue('Managed admin')
    const selector = screen.getByRole('combobox', {
      name: 'Daily token limit mode for deepseek-v4.1-flash-x0.1',
    })
    await userEvent.click(selector)
    const labels = {
      inherit: 'Inherit global limit',
      custom: 'Custom daily limit',
      unlimited: 'Unlimited',
    }
    await userEvent.click(
      screen.getByRole('option', { name: labels[mode as keyof typeof labels] })
    )
    let expected: Record<string, number> = {}
    if (mode === 'custom') {
      const input = screen.getByRole('spinbutton', {
        name: 'deepseek-v4.1-flash-x0.1',
      })
      await userEvent.clear(input)
      await userEvent.type(input, '100000000')
      expected = { 'deepseek-v4.1-flash-x0.1': 100000000 }
    }
    if (mode === 'unlimited') expected = { 'deepseek-v4.1-flash-x0.1': -1 }
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        '/api/user/',
        expect.objectContaining({ id: 2, model_daily_token_limits: expected })
      )
    )
  }
)

it('keeps saving disabled until the account and its fresh daily limits have loaded', async () => {
  type Response = { data: { success: boolean; data: User } }
  let resolveUser: (value: Response) => void = vi.fn()
  const pendingUser = new Promise<Response>((resolve) => {
    resolveUser = resolve
  })
  renderPermissions(100, undefined, undefined, pendingUser)
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  resolveUser({
    data: {
      success: true,
      data: {
        ...target,
        model_daily_token_defaults: { 'deepseek-v4.1-flash-x0.1': 200000000 },
        model_daily_token_limits: { 'deepseek-v4.1-flash-x0.1': 50000000 },
      },
    },
  })
  await screen.findByDisplayValue('Managed admin')
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  )
  expect(
    screen.getByRole('spinbutton', { name: 'deepseek-v4.1-flash-x0.1' })
  ).toHaveValue(50000000)
})
