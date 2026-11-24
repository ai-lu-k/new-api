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

import { pageTransitionsEnabled } from '../motion'
import { withViewTransition } from '../view-transition'

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

/** Makes the document look like a browser that *could* run a transition. */
function installStartViewTransition(onRun: () => void) {
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: vi.fn((callback: () => void) => {
      onRun()
      callback()
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

/**
 * The shipped state (2026-11-05): the page handoff is switched off, so nothing
 * may start a View Transition even in a browser that supports it and a reader
 * who allows motion. Turning `PAGE_TRANSITIONS_ENABLED` back on is expected to
 * retire this file.
 */
describe('with the page handoff switched off', () => {
  it('reports page transitions as disabled even when the browser supports them', () => {
    allowMotion()
    installStartViewTransition(() => undefined)

    expect(pageTransitionsEnabled()).toBe(false)
  })

  it('applies a state change directly instead of starting a transition', () => {
    allowMotion()
    const startViewTransition = vi.fn()
    installStartViewTransition(startViewTransition)
    const run = vi.fn()

    withViewTransition(run)

    expect(startViewTransition).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledTimes(1)
  })
})
