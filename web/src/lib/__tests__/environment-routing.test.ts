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
import { AxiosError, type AxiosAdapter } from 'axios'
import { afterEach, beforeEach, expect, it, vi, type Mock } from 'vitest'

import { createStreamRequestController } from '@/features/playground/hooks/use-stream-request'
import {
  getCommonHeaders,
  getFreshAuthHeaders,
  createRefreshRunner,
} from '@/lib/auth-session'
import {
  getAppEnvironment,
  getEnvironmentHeaders,
  requestEnvironmentReload,
  resetEnvironmentRecovery,
  blockEnvironmentRecovery,
  isEnvironmentRecoveryBlocked,
  subscribeEnvironmentChanges,
} from '@/lib/environment'
import { api } from '@/lib/http-client'
import { createAppQueryClient } from '@/lib/query-client'
import { useAuthStore } from '@/stores/auth-store'

let stopReload: () => void
let reload: Mock<() => void>
let adapter: typeof api.defaults.adapter
beforeEach(() => {
  resetEnvironmentRecovery()
  window.sessionStorage.clear()
  adapter = api.defaults.adapter
  reload = vi.fn()
  stopReload = subscribeEnvironmentChanges(reload)
  const marker = document.createElement('meta')
  marker.name = 'new-api-environment'
  marker.content = 'staging'
  document.head.append(marker)
  useAuthStore.getState().auth.setBundle({
    user: { id: 1, username: 'admin', role: 10 },
    access_token: 'test-access-token',
    token_type: 'Bearer',
    access_expires_at: Math.floor(Date.now() / 1000) + 300,
    session: {
      sid: 'test-session',
      current: true,
      login_method: 'environment',
      ip: '',
      user_agent: '',
      created_at: 0,
      last_active_at: 0,
      expires_at: Date.now(),
    },
  })
})
afterEach(() => {
  stopReload()
  vi.restoreAllMocks()
  window.sessionStorage.clear()
  vi.unstubAllGlobals()
  api.defaults.adapter = adapter
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  document.head
    .querySelectorAll('meta[name="new-api-environment"]')
    .forEach((element) => element.remove())
})
it('defaults missing or invalid page markers to production', () => {
  const marker = document.head.querySelector<HTMLMetaElement>(
    'meta[name="new-api-environment"]'
  )
  if (!marker) throw new Error('Missing environment marker fixture')
  marker.content = 'invalid'
  expect(getAppEnvironment()).toBe('production')
  marker.remove()
  expect(getEnvironmentHeaders()).toEqual({ 'X-App-Environment': 'production' })
})
it('tags management requests and fresh stream headers with the loaded environment', async () => {
  const request = vi.fn<AxiosAdapter>().mockImplementation(async (config) => ({
    config,
    data: {},
    status: 200,
    statusText: 'OK',
    headers: {},
  }))
  api.defaults.adapter = request
  await api.get('/api/user/self', { disableDuplicate: true })
  expect(request.mock.calls[0][0].headers.get('X-App-Environment')).toBe(
    'staging'
  )
  expect(getCommonHeaders()['X-App-Environment']).toBe('staging')
  const createSource = vi.fn().mockReturnValue({
    addEventListener: vi.fn(),
    close: vi.fn(),
    stream: vi.fn(),
  })
  const controller = createStreamRequestController({
    getHeaders: getFreshAuthHeaders,
    createSource,
    setStreaming: vi.fn(),
  })
  await controller.send(
    { model: 'model', messages: [], stream: true },
    { onUpdate: vi.fn(), onComplete: vi.fn(), onError: vi.fn() }
  )
  expect(createSource.mock.calls[0][1]).toMatchObject({
    'X-App-Environment': 'staging',
    Authorization: 'Bearer test-access-token',
  })
  controller.dispose()
})
it('reloads stale environments without refreshing or replaying failed mutations', async () => {
  const request = vi.fn<AxiosAdapter>().mockImplementation(async (config) => {
    throw new AxiosError('Changed', undefined, config, undefined, {
      config,
      data: { code: 'ENVIRONMENT_CHANGED' },
      status: 409,
      statusText: 'Conflict',
      headers: {},
    })
  })
  api.defaults.adapter = request
  await expect(api.post('/api/token/', { name: 'key' })).rejects.toBeInstanceOf(
    AxiosError
  )
  expect(request).toHaveBeenCalledOnce()
  expect(reload).toHaveBeenCalledOnce()
  const queryClient = createAppQueryClient()
  const retry = queryClient.getDefaultOptions().queries?.retry
  expect(typeof retry).toBe('function')
  if (typeof retry === 'function') {
    expect(
      retry(
        0,
        Object.assign(new Error('Changed'), {
          response: { data: { code: 'ENVIRONMENT_CHANGED' } },
        })
      )
    ).toBe(false)
  }
  queryClient.clear()
})

it('does not retry refresh or clear login when refresh finds an environment change', async () => {
  const request = vi
    .fn()
    .mockResolvedValue({ status: 409, data: { code: 'ENVIRONMENT_CHANGED' } })
  const clear = vi.fn()
  const runner = createRefreshRunner({
    request,
    getExpectedSID: () => 'test-session',
    parseBundle: () => null,
    acceptBundle: vi.fn(),
    clear,
    markTransient: vi.fn(),
    wait: vi.fn(),
  })
  expect((await runner()).kind).toBe('transient_error')
  expect(request).toHaveBeenCalledOnce()
  expect(clear).not.toHaveBeenCalled()
  expect(reload).toHaveBeenCalledOnce()
})

it('reloads sibling pages on a fresh environment event but ignores malformed or old events', () => {
  stopReload()
  vi.stubGlobal('BroadcastChannel', undefined)
  stopReload = subscribeEnvironmentChanges(reload)
  const send = (value: unknown) =>
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'new-api:environment:event',
        newValue: JSON.stringify(value),
      })
    )
  send({ environment: 'other', source: 'other-tab', timestamp: Date.now() })
  send({
    environment: 'staging',
    source: 'other-tab',
    timestamp: Date.now() - 120_000,
  })
  expect(reload).not.toHaveBeenCalled()
  send({
    environment: 'production',
    source: 'other-tab',
    timestamp: Date.now(),
  })
  expect(reload).toHaveBeenCalledOnce()
})

it('closes a stale raw SSE request and reloads without restarting the stream', async () => {
  const listeners = new Map<
    string,
    (event: Event & { data?: string }) => void
  >()
  const stream = {
    readyState: 2,
    close: vi.fn(),
    stream: vi.fn(),
    addEventListener: (
      name: string,
      listener: (event: Event & { data?: string }) => void
    ) => {
      listeners.set(name, listener)
    },
  }
  const createSource = vi.fn().mockReturnValue(stream)
  const controller = createStreamRequestController({
    getHeaders: getFreshAuthHeaders,
    createSource,
    setStreaming: vi.fn(),
  })
  await controller.send(
    { model: 'model', messages: [], stream: true },
    { onUpdate: vi.fn(), onComplete: vi.fn(), onError: vi.fn() }
  )
  listeners.get('error')?.(
    Object.assign(new Event('error'), {
      data: JSON.stringify({ code: 'ENVIRONMENT_CHANGED' }),
    })
  )
  expect(reload).toHaveBeenCalledOnce()
  expect(stream.close).toHaveBeenCalledOnce()
  expect(stream.stream).toHaveBeenCalledOnce()
  expect(createSource).toHaveBeenCalledOnce()
  controller.dispose()
})

it('coalesces concurrent environment conflicts into one page reload', () => {
  requestEnvironmentReload()
  requestEnvironmentReload()
  expect(reload).toHaveBeenCalledOnce()
})

it('stops automatic recovery when the reloaded document still has an environment conflict', async () => {
  requestEnvironmentReload()
  expect(reload).toHaveBeenCalledOnce()
  stopReload()
  vi.resetModules()
  const nextPage = await import('@/lib/environment')
  stopReload = nextPage.subscribeEnvironmentChanges(reload)
  nextPage.requestEnvironmentReload()
  expect(reload).toHaveBeenCalledOnce()
  expect(nextPage.isEnvironmentRecoveryBlocked()).toBe(true)
})

it('stops instead of reloading when session storage is unavailable', () => {
  vi.spyOn(
    Object.getPrototypeOf(window.sessionStorage),
    'setItem'
  ).mockImplementation(() => {
    throw new DOMException('Denied', 'SecurityError')
  })
  requestEnvironmentReload()
  expect(reload).not.toHaveBeenCalled()
  expect(isEnvironmentRecoveryBlocked()).toBe(true)
})

it('allows later recovery after a successful management response on the loaded page', async () => {
  window.sessionStorage.setItem('new-api:environment:recovery:v1', 'pending')
  api.defaults.adapter = async (config) => ({
    config,
    data: { success: true },
    status: 200,
    statusText: 'OK',
    headers: {},
  })
  await api.get('/api/status', { disableDuplicate: true })
  requestEnvironmentReload()
  expect(reload).toHaveBeenCalledOnce()
})

it('cancels background management requests while keeping production recovery available', async () => {
  const request = vi.fn<AxiosAdapter>().mockImplementation(async (config) => ({
    config,
    data: { success: true },
    status: 200,
    statusText: 'OK',
    headers: {},
  }))
  api.defaults.adapter = request
  blockEnvironmentRecovery()
  await expect(
    api.get('/api/user/self', { disableDuplicate: true })
  ).rejects.toMatchObject({ code: 'ERR_CANCELED' })
  expect(request).not.toHaveBeenCalled()
  await api.post(
    '/api/environment',
    { environment: 'production' },
    { skipAuthRefresh: true }
  )
  expect(request).toHaveBeenCalledOnce()
})

it('stops on unavailable staging and does not retry or replay the failed write', async () => {
  const request = vi.fn<AxiosAdapter>().mockImplementation(async (config) => {
    throw new AxiosError('Unavailable', undefined, config, undefined, {
      config,
      data: { code: 'ENVIRONMENT_UNAVAILABLE' },
      status: 502,
      statusText: 'Bad Gateway',
      headers: {},
    })
  })
  api.defaults.adapter = request
  await expect(api.post('/api/probe', { write: true })).rejects.toBeInstanceOf(
    AxiosError
  )
  expect(request).toHaveBeenCalledOnce()
  expect(isEnvironmentRecoveryBlocked()).toBe(true)
  expect(reload).not.toHaveBeenCalled()
})

it('keeps ordinary production switch failures on the usable production page', async () => {
  const marker = document.head.querySelector<HTMLMetaElement>(
    'meta[name="new-api-environment"]'
  )
  if (!marker) throw new Error('Missing environment fixture')
  marker.content = 'production'
  api.defaults.adapter = async (config) => {
    throw new AxiosError('Unavailable', undefined, config, undefined, {
      config,
      data: { code: 'ENVIRONMENT_UNAVAILABLE' },
      status: 502,
      statusText: 'Bad Gateway',
      headers: {},
    })
  }
  await expect(
    api.post('/api/environment', { environment: 'staging' })
  ).rejects.toBeInstanceOf(AxiosError)
  expect(isEnvironmentRecoveryBlocked()).toBe(false)
  expect(reload).not.toHaveBeenCalled()
})

it('does not start another authentication refresh after recovery is blocked', async () => {
  const request = vi
    .fn()
    .mockResolvedValue({ status: 409, data: { code: 'ENVIRONMENT_CHANGED' } })
  const runner = createRefreshRunner({
    request,
    getExpectedSID: () => 'test-session',
    parseBundle: () => null,
    acceptBundle: vi.fn(),
    clear: vi.fn(),
    markTransient: vi.fn(),
    wait: vi.fn(),
  })
  blockEnvironmentRecovery()
  expect((await runner()).kind).toBe('transient_error')
  expect(request).not.toHaveBeenCalled()
})
