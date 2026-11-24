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
import { useCallback, useEffect, useRef } from 'react'

/** The four fields GeeTest returns from getValidate(). */
export interface GeeTestSolution {
  lot_number: string
  captcha_output: string
  pass_token: string
  gen_time: string
}

/** The provider could not load or answer, so no solution can be produced. */
export const GEETEST_UNAVAILABLE = 'geetest-unavailable'
/** The visitor closed the challenge or failed it. */
export const GEETEST_CANCELLED = 'geetest-cancelled'

function geeTestError(message: string, name: string): Error {
  const error = new Error(message)
  error.name = name
  return error
}

export function isGeeTestUnavailable(error: unknown): boolean {
  return error instanceof Error && error.name === GEETEST_UNAVAILABLE
}

interface GeeTestCaptcha {
  onReady: (callback: () => void) => GeeTestCaptcha
  onSuccess: (callback: () => void) => GeeTestCaptcha
  onError: (callback: (error: unknown) => void) => GeeTestCaptcha
  onClose: (callback: () => void) => GeeTestCaptcha
  showCaptcha: () => void
  getValidate: () => GeeTestSolution | false
  reset: () => void
  destroy: () => void
}

declare global {
  interface Window {
    initGeetest4?: (
      options: Record<string, unknown>,
      callback: (captcha: GeeTestCaptcha) => void
    ) => void
  }
}

const SCRIPT_ID = 'geetest-v4'
const SCRIPT_SRC = 'https://static.geetest.com/v4/gt4.js'

let scriptLoader: Promise<void> | null = null

// The provider asks for the library to be initialized while the page loads: it
// reads the visitor's behaviour from the page, not from the click that opens
// the challenge. The script is fetched once per page.
function loadGeetest(): Promise<void> {
  if (window.initGeetest4) return Promise.resolve()
  if (scriptLoader) return scriptLoader
  scriptLoader = new Promise<void>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`#${SCRIPT_ID}`)
    const fail = () => {
      scriptLoader = null
      script?.remove()
      reject(
        geeTestError('Unable to load the security check', GEETEST_UNAVAILABLE)
      )
    }
    if (!script) {
      script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = SCRIPT_SRC
      script.async = true
      document.head.appendChild(script)
    }
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', fail, { once: true })
  })
  return scriptLoader
}

interface PendingCheck {
  resolve: (solution: GeeTestSolution) => void
  reject: (error: Error) => void
}

/**
 * Initializes one GeeTest challenge for the page and resolves with a solution
 * each time the visitor passes it. The captcha id is public; the signing key
 * only ever lives on the server.
 */
export function useGeetest(captchaId?: string) {
  const captcha = useRef<GeeTestCaptcha | null>(null)
  const pending = useRef<PendingCheck | null>(null)

  useEffect(() => {
    if (!captchaId) return
    let cancelled = false
    const rejectPending = (error: Error) => {
      const current = pending.current
      pending.current = null
      current?.reject(error)
    }
    const rejectUnavailable = () =>
      rejectPending(
        geeTestError('Unable to load the security check', GEETEST_UNAVAILABLE)
      )
    const rejectCancelled = () =>
      rejectPending(
        geeTestError('Human verification expired or failed', GEETEST_CANCELLED)
      )
    void loadGeetest()
      .then(() => {
        if (cancelled || captcha.current || !window.initGeetest4) return
        window.initGeetest4(
          { captchaId, product: 'bind', protocol: 'https://', timeout: 10000 },
          (instance) => {
            if (cancelled) {
              instance.destroy()
              return
            }
            captcha.current = instance
            instance
              .onSuccess(() => {
                const solution = instance.getValidate()
                const current = pending.current
                pending.current = null
                if (solution) {
                  current?.resolve(solution)
                } else {
                  current?.reject(
                    geeTestError('Human verification failed', GEETEST_CANCELLED)
                  )
                }
                instance.reset()
              })
              .onError(rejectUnavailable)
              .onClose(rejectCancelled)
          }
        )
      })
      .catch(rejectUnavailable)
    return () => {
      cancelled = true
      rejectCancelled()
      captcha.current?.destroy()
      captcha.current = null
    }
  }, [captchaId])

  // showCaptcha only renders reliably after onReady; GeeTest queues the call
  // itself, so a click before readiness still opens the challenge.
  const verify = useCallback((): Promise<GeeTestSolution> => {
    const instance = captcha.current
    if (!instance) {
      return Promise.reject(
        geeTestError('Unable to load the security check', GEETEST_UNAVAILABLE)
      )
    }
    pending.current?.reject(
      geeTestError('Human verification replaced', GEETEST_CANCELLED)
    )
    return new Promise<GeeTestSolution>((resolve, reject) => {
      pending.current = { resolve, reject }
      instance.showCaptcha()
    })
  }, [])

  return { verify }
}
