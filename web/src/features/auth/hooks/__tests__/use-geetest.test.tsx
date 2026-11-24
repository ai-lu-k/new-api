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
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  isGeeTestUnavailable,
  useGeetest,
  type GeeTestSolution,
} from '../use-geetest'

const solution: GeeTestSolution = {
  lot_number: 'lot-1',
  captcha_output: 'output',
  pass_token: 'pass-token',
  gen_time: '1700000000',
}

interface FakeCaptcha {
  onSuccess: (callback: () => void) => FakeCaptcha
  onError: (callback: (error: unknown) => void) => FakeCaptcha
  onClose: (callback: () => void) => FakeCaptcha
  onReady: (callback: () => void) => FakeCaptcha
  showCaptcha: ReturnType<typeof vi.fn>
  getValidate: ReturnType<typeof vi.fn>
  reset: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
}

function installFakeProvider(options?: { valid?: boolean }) {
  const handlers: {
    success?: () => void
    error?: (error: unknown) => void
    close?: () => void
  } = {}
  const captcha: FakeCaptcha = {
    onReady: () => captcha,
    onSuccess: (callback) => {
      handlers.success = callback
      return captcha
    },
    onError: (callback) => {
      handlers.error = callback
      return captcha
    },
    onClose: (callback) => {
      handlers.close = callback
      return captcha
    },
    showCaptcha: vi.fn(),
    getValidate: vi.fn(() => (options?.valid === false ? false : solution)),
    reset: vi.fn(),
    destroy: vi.fn(),
  }
  const init = vi.fn((_config: Record<string, unknown>, done) => {
    done(captcha)
  })
  window.initGeetest4 = init
  return { captcha, init, handlers }
}

afterEach(() => {
  cleanup()
  delete window.initGeetest4
})

describe('useGeetest', () => {
  it('initializes the provider once with the public captcha id', async () => {
    const { init } = installFakeProvider()

    renderHook(() => useGeetest('captcha-id'))

    await waitFor(() => expect(init).toHaveBeenCalledTimes(1))
    expect(init.mock.calls[0][0]).toMatchObject({
      captchaId: 'captcha-id',
      product: 'bind',
    })
  })

  it('resolves with the solution the provider returns after a pass', async () => {
    const { captcha, handlers } = installFakeProvider()
    const { result } = renderHook(() => useGeetest('captcha-id'))
    await waitFor(() => expect(window.initGeetest4).toBeDefined())

    const pending = result.current.verify()
    expect(captcha.showCaptcha).toHaveBeenCalledTimes(1)

    act(() => handlers.success?.())

    await expect(pending).resolves.toEqual(solution)
    expect(captcha.reset).toHaveBeenCalledTimes(1)
  })

  it('rejects when the visitor closes the challenge', async () => {
    const { handlers } = installFakeProvider()
    const { result } = renderHook(() => useGeetest('captcha-id'))
    await waitFor(() => expect(window.initGeetest4).toBeDefined())

    const pending = result.current.verify()
    act(() => handlers.close?.())

    await expect(pending).rejects.toThrow(
      'Human verification expired or failed'
    )
  })

  it('rejects instead of hanging when the provider is unavailable', async () => {
    const { result } = renderHook(() => useGeetest('captcha-id'))

    const failure = await result.current.verify().catch((error) => error)
    expect(failure).toBeInstanceOf(Error)
    expect(isGeeTestUnavailable(failure)).toBe(true)
  })

  it('marks a challenge the visitor closed as cancelled, not unavailable', async () => {
    const { handlers } = installFakeProvider()
    const { result } = renderHook(() => useGeetest('captcha-id'))
    await waitFor(() => expect(window.initGeetest4).toBeDefined())

    const pending = result.current.verify()
    act(() => handlers.close?.())
    const failure = await pending.catch((error) => error)

    expect(isGeeTestUnavailable(failure)).toBe(false)
  })

  it('destroys the provider instance when the page unmounts', async () => {
    const { captcha } = installFakeProvider()
    const { unmount } = renderHook(() => useGeetest('captcha-id'))
    await waitFor(() => expect(window.initGeetest4).toBeDefined())

    unmount()

    expect(captcha.destroy).toHaveBeenCalledTimes(1)
  })
})
