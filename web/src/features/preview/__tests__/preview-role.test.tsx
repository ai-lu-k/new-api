import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
import axios, {
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api } from '@/lib/api'
import {
  isPreviewRoleEnabled,
  PREVIEW_ROLE_HEADER,
  setPreviewRole,
} from '@/lib/preview-mode'
import { useAuthStore } from '@/stores/auth-store'

import { PreviewRoleMenuItem } from '../components/preview-role-menu-item'
import { PreviewRoleNotice } from '../components/preview-role-notice'

let reload: ReturnType<typeof vi.fn>

function renderMenu() {
  return render(
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button />}>Account</DropdownMenuTrigger>
      <DropdownMenuContent>
        <PreviewRoleMenuItem />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

beforeEach(() => {
  reload = vi.fn()
  const current = window.location
  vi.spyOn(window, 'location', 'get').mockReturnValue({
    href: current.href,
    origin: current.origin,
    pathname: current.pathname,
    search: current.search,
    hash: current.hash,
    reload,
  } as unknown as Location)
})

afterEach(() => {
  window.localStorage.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
})

it('enables the preview from the account menu and reloads with the stored flag', async () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'admin', role: 10 })
  const user = userEvent.setup()
  renderMenu()
  await user.click(screen.getByRole('button', { name: 'Account' }))
  await user.click(
    await screen.findByRole('menuitem', { name: 'Preview as user' })
  )
  expect(isPreviewRoleEnabled()).toBe(true)
  expect(reload).toHaveBeenCalledOnce()
})

it('shows the notice only while the server reports an active preview', async () => {
  useAuthStore.getState().auth.setUser({ id: 2, username: 'user', role: 1 })
  const first = render(<PreviewRoleNotice />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  first.unmount()

  useAuthStore
    .getState()
    .auth.setUser({ id: 2, username: 'user', role: 1, preview_active: true })
  render(<PreviewRoleNotice />)
  expect(screen.getByRole('status')).toHaveTextContent(
    'Viewing as an ordinary user'
  )

  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Exit preview' }))
  expect(isPreviewRoleEnabled()).toBe(false)
  expect(reload).toHaveBeenCalledOnce()
})

it('sends the preview role header only while the flag is stored', async () => {
  const seen: (string | null)[] = []
  const adapter = async (
    config: InternalAxiosRequestConfig
  ): Promise<AxiosResponse> => {
    const header = config.headers.get(PREVIEW_ROLE_HEADER)
    seen.push(typeof header === 'string' ? header : null)
    return {
      data: { success: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }
  }

  await api.get('/api/user/self', { adapter, disableDuplicate: true })
  setPreviewRole(true)
  await api.get('/api/user/self', { adapter, disableDuplicate: true })

  expect(seen).toEqual([null, 'user'])
})

it('carries the preview header on the session refresh that rebuilds the identity', async () => {
  const originalAdapter = axios.defaults.adapter
  const seen: (string | null)[] = []
  axios.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const header = config.headers.get(PREVIEW_ROLE_HEADER)
    seen.push(typeof header === 'string' ? header : null)
    return {
      data: { success: false },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    } as AxiosResponse
  }
  // The refresh client snapshots axios defaults when its module is evaluated, so
  // the adapter has to be in place before that module is created.
  vi.resetModules()
  try {
    setPreviewRole(true)
    const { refreshAuthentication } = await import('@/lib/auth-session')
    await refreshAuthentication()
  } finally {
    axios.defaults.adapter = originalAdapter
    vi.resetModules()
  }

  expect(seen.length).toBeGreaterThan(0)
  expect(seen.every((value) => value === 'user')).toBe(true)
})
