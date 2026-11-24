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
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi, type Mock } from 'vitest'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api } from '@/lib/api'
import {
  isEnvironmentRecoveryBlocked,
  requestEnvironmentReload,
  resetEnvironmentRecovery,
  subscribeEnvironmentChanges,
} from '@/lib/environment'
import { useAuthStore } from '@/stores/auth-store'

import { EnvironmentMenuItem } from '../components/environment-menu-item'
import { EnvironmentRecoveryBoundary } from '../components/environment-recovery-boundary'
import { EnvironmentWatermark } from '../components/environment-watermark'

let queries: QueryClient
let stopReload: () => void
let reload: Mock<() => void>
function setEnvironment(environment: string, version = '') {
  document.head
    .querySelectorAll('meta[name^="new-api-environment"]')
    .forEach((element) => element.remove())
  for (const [name, content] of [
    ['new-api-environment', environment],
    ['new-api-environment-version', version],
  ]) {
    const marker = document.createElement('meta')
    marker.name = name
    marker.content = content
    document.head.append(marker)
  }
}
beforeEach(() => {
  resetEnvironmentRecovery()
  queries = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  useAuthStore.getState().auth.setUser({ id: 1, username: 'admin', role: 10 })
  setEnvironment('production')
  reload = vi.fn()
  stopReload = subscribeEnvironmentChanges(reload)
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: { enabled: true, environment: 'production', version: 'build-1' },
    },
  })
})
afterEach(() => {
  stopReload()
  vi.unstubAllGlobals()
  queries.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  document.head
    .querySelectorAll('meta[name^="new-api-environment"]')
    .forEach((element) => element.remove())
})
async function openMenu() {
  render(
    <QueryClientProvider client={queries}>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button />}>Account</DropdownMenuTrigger>
        <DropdownMenuContent>
          <EnvironmentMenuItem />
        </DropdownMenuContent>
      </DropdownMenu>
    </QueryClientProvider>
  )
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Account' }))
  await screen.findByRole('menu')
  return user
}
it('does not request or display the switch for an ordinary user', async () => {
  useAuthStore.getState().auth.setUser({ id: 2, username: 'user', role: 1 })
  await openMenu()
  expect(api.get).not.toHaveBeenCalled()
  expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
})
it('hides the switch when the server disables environment access', async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: {
      success: true,
      data: { enabled: false, environment: 'production', version: 'build-1' },
    },
  })
  await openMenu()
  await waitFor(() => expect(queries.isFetching()).toBe(0))
  expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
})
it('retains environment, login and cached data after a failed switch', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: false, message: 'Unavailable' } })
  queries.setQueryData(['account'], { quota: 10 })
  const user = await openMenu()
  await user.click(
    await screen.findByRole('menuitem', { name: 'Switch to test environment' })
  )
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/api/environment',
      {
        environment: 'staging',
      },
      { skipAuthRefresh: true }
    )
  )
  await waitFor(() => expect(queries.isMutating()).toBe(0))
  expect(reload).not.toHaveBeenCalled()
  expect(queries.getQueryData(['account'])).toEqual({ quota: 10 })
  expect(useAuthStore.getState().auth.user?.id).toBe(1)
  expect(
    await screen.findByRole('menuitem', { name: 'Switch to test environment' })
  ).toBeVisible()
})
it('disables a pending switch, then clears volatile state and reloads only after success', async () => {
  let resolve!: (result: { data: { success: boolean } }) => void
  const post = vi.spyOn(api, 'post').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      })
  )
  queries.setQueryData(['account'], { quota: 10 })
  document.cookie = 'new_api_has_session=1; path=/'
  const user = await openMenu()
  await user.click(
    await screen.findByRole('menuitem', { name: 'Switch to test environment' })
  )
  expect(
    await screen.findByRole('menuitem', { name: 'Switch to test environment' })
  ).toHaveAttribute('aria-disabled', 'true')
  expect(reload).not.toHaveBeenCalled()
  await act(async () => resolve({ data: { success: true } }))
  await waitFor(() => expect(reload).toHaveBeenCalledOnce())
  expect(post).toHaveBeenCalledOnce()
  expect(queries.getQueryData(['account'])).toBeUndefined()
  expect(useAuthStore.getState().auth.user).toBeNull()
  expect(document.cookie).toContain('new_api_has_session=1')
  document.cookie = 'new_api_has_session=; max-age=0; path=/'
})
it('shows a noninteractive staging watermark without adding a banner or changing navigation', () => {
  setEnvironment('staging', 'test-build-42')
  render(<EnvironmentWatermark />)
  const watermark = screen.getByText('Test environment')
  expect(watermark).toHaveAttribute('aria-hidden', 'true')
  expect(watermark).toHaveClass('fixed', 'pointer-events-none', 'select-none')
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.queryByText('test-build-42')).not.toBeInTheDocument()
})
it('does not display a watermark on production', () => {
  const { container } = render(<EnvironmentWatermark />)
  expect(container).toBeEmptyDOMElement()
})
it('keeps the build version and return action in the staging account menu', async () => {
  setEnvironment('staging', 'test-build-42')
  vi.mocked(api.get).mockResolvedValue({
    data: {
      success: true,
      data: { enabled: true, environment: 'staging', version: 'test-build-42' },
    },
  })
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true } })
  const user = await openMenu()
  expect(await screen.findByText('test-build-42')).toBeVisible()
  await user.click(
    screen.getByRole('menuitem', { name: 'Return to production' })
  )
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/api/environment',
      { environment: 'production' },
      { skipAuthRefresh: true }
    )
  )
  await waitFor(() => expect(reload).toHaveBeenCalledOnce())
})

it('shows a production return action after recovery fails before the router mounts', async () => {
  const locationReload = vi.fn()
  const originalWindow = window
  vi.stubGlobal(
    'window',
    new Proxy(originalWindow, {
      get(target, key) {
        if (key === 'location') return { reload: locationReload }
        return Reflect.get(target, key, target)
      },
    })
  )
  window.sessionStorage.setItem('new-api:environment:recovery:v1', 'pending')
  requestEnvironmentReload()
  queries.setQueryData(['account'], { quota: 10 })
  document.cookie = 'new_api_has_session=1; path=/'
  let resolve!: (result: { data: { success: boolean } }) => void
  const post = vi.spyOn(api, 'post').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      })
  )
  render(
    <QueryClientProvider client={queries}>
      <EnvironmentRecoveryBoundary>
        <div>Protected console</div>
      </EnvironmentRecoveryBoundary>
    </QueryClientProvider>
  )
  expect(screen.getByText('Environment recovery stopped')).toBeVisible()
  expect(screen.queryByText('Protected console')).not.toBeInTheDocument()
  expect(useAuthStore.getState().auth.user).toBeNull()
  expect(queries.getQueryData(['account'])).toBeUndefined()
  const user = userEvent.setup()
  await user.tab()
  const button = screen.getByRole('button', { name: 'Return to production' })
  expect(button).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(button).toBeDisabled()
  expect(post).toHaveBeenCalledWith(
    '/api/environment',
    { environment: 'production' },
    { skipAuthRefresh: true }
  )
  expect(locationReload).not.toHaveBeenCalled()
  await act(async () => resolve({ data: { success: true } }))
  await waitFor(() => expect(locationReload).toHaveBeenCalledOnce())
  expect(isEnvironmentRecoveryBlocked()).toBe(false)
  expect(document.cookie).toContain('new_api_has_session=1')
  document.cookie = 'new_api_has_session=; max-age=0; path=/'
})

it('keeps failed production recovery visible and permits an explicit retry', async () => {
  window.sessionStorage.setItem('new-api:environment:recovery:v1', 'pending')
  requestEnvironmentReload()
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: false, message: 'Recovery unavailable' },
  })
  render(
    <QueryClientProvider client={queries}>
      <EnvironmentRecoveryBoundary>
        <div>Protected console</div>
      </EnvironmentRecoveryBoundary>
    </QueryClientProvider>
  )
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Return to production' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Recovery unavailable'
  )
  expect(isEnvironmentRecoveryBlocked()).toBe(true)
  expect(reload).not.toHaveBeenCalled()
  expect(screen.queryByText('Protected console')).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Return to production' })
  ).toBeEnabled()
  expect(post).toHaveBeenCalledOnce()
})
