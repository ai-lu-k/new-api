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
import { afterEach, describe, expect, it, vi } from 'vitest'

import { withViewTransition } from '../view-transition'

// `withViewTransition` now follows `PAGE_TRANSITIONS_ENABLED`, which ships as
// false (2026-11-05, see `lib/motion.ts`). These cases guard the behaviour that
// comes back when the switch is turned on again, so they run with the switch
// overridden; `page-transitions-disabled.test.ts` covers the shipped state.
vi.mock('@/lib/motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/motion')>()
  return {
    ...actual,
    PAGE_TRANSITIONS_ENABLED: true,
    // The gate lives inside the mocked module, so it cannot see the overridden
    // flag from the outside; this stub keeps the one condition these cases rely
    // on — reduced motion still wins over support.
    pageTransitionsEnabled: () => !actual.prefersReducedMotion(),
  }
})

const originalMatchMedia = window.matchMedia

/** The suite asks for reduced motion by default; this restores page motion. */
function allowMotion() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      ...originalMatchMedia(query),
      matches: false,
    }),
  })
}

afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition')
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  })
})

describe('withViewTransition', () => {
  it('applies the state change directly when the browser cannot transition', () => {
    allowMotion()
    const run = vi.fn()

    withViewTransition(run)

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runs the state change inside a single transition when it can', () => {
    allowMotion()
    const startViewTransition = vi.fn((callback: () => void) => {
      callback()
    })
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    })
    const run = vi.fn()

    withViewTransition(run)

    expect(startViewTransition).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('never starts a transition when the reader asked for reduced motion', () => {
    const startViewTransition = vi.fn((callback: () => void) => {
      callback()
    })
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    })
    const run = vi.fn()

    withViewTransition(run)

    expect(startViewTransition).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('applies the change directly while another transition is still running', async () => {
    allowMotion()
    let settle: () => void = () => {}
    const finished = new Promise<void>((resolve) => {
      settle = resolve
    })
    const startViewTransition = vi.fn((callback: () => void) => {
      callback()
      return {
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        finished,
      }
    })
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    })
    const run = vi.fn()

    withViewTransition(() => run())
    withViewTransition(() => run())

    // The second call must not open a second (overlapping) transition, and it
    // must not lose the state change either.
    expect(startViewTransition).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(2)

    settle()
    await finished
    await Promise.resolve()
  })

  it('swallows the skip rejection and releases the guard afterwards', async () => {
    allowMotion()
    const skipped = () => Promise.reject(new Error('Transition was skipped'))
    const rejected = {
      ready: skipped(),
      updateCallbackDone: skipped(),
      finished: skipped(),
    }
    const startViewTransition = vi.fn((callback: () => void) => {
      callback()
      return rejected
    })
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    })
    const run = vi.fn()

    expect(() => withViewTransition(run)).not.toThrow()

    // The rejection is consumed by the module, so it never reaches the window
    // as a pageerror, and the next handoff is free to start again.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    withViewTransition(() => run())
    expect(startViewTransition).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenCalledTimes(2)
  })
})
