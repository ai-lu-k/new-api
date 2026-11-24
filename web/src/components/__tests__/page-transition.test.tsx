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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AnimatedOutlet } from '../page-transition'

const originalMatchMedia = window.matchMedia

/**
 * The suite asks for reduced motion by default. Page motion is allowed here so
 * the switch — not the media query — is the only reason the outlet stays a
 * plain container.
 */
function allowMotion() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      ...originalMatchMedia(query),
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }),
  })
}

beforeEach(() => {
  allowMotion()
})

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  })
})

function createHarnessRouter() {
  const rootRoute = createRootRoute({ component: () => <AnimatedOutlet /> })
  const overviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <p data-test-page='overview'>概览</p>,
  })
  const keysRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/keys',
    component: () => <p data-test-page='keys'>密钥</p>,
  })

  return createRouter({
    routeTree: rootRoute.addChildren([overviewRoute, keysRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

/**
 * The route handoff is switched off (2026-11-05): `AnimatedOutlet` is a plain
 * container. The outgoing page is not cloned, kept mounted or keyed into a
 * remount animation — the new page replaces it in the same slot.
 */
describe('AnimatedOutlet with the page handoff switched off', () => {
  it('swaps the page in place without cloning the old one', async () => {
    const router = createHarnessRouter()
    await router.load()
    render(<RouterProvider router={router} />)

    const outlet = await screen.findByText('概览')
    const container = document.querySelector('[data-page-outlet]')
    expect(container).not.toBeNull()

    await act(async () => {
      await router.navigate({ to: '/keys' })
    })

    expect(screen.getByText('密钥')).toBeInTheDocument()
    // The old page is gone in the same commit: no clone layer stays behind.
    expect(screen.queryByText('概览')).not.toBeInTheDocument()
    expect(document.querySelectorAll('[data-test-page]')).toHaveLength(1)
    expect(outlet.isConnected).toBe(false)
    // One container across the navigation, so no key-driven remount animation.
    expect(document.querySelector('[data-page-outlet]')).toBe(container)
  })

  it('leaves the route content without any motion styles', async () => {
    const router = createHarnessRouter()
    await router.load()
    render(<RouterProvider router={router} />)

    await screen.findByText('概览')
    await act(async () => {
      await router.navigate({ to: '/keys' })
    })

    const container = document.querySelector('[data-page-outlet]')
    expect(container?.querySelector('[style]')).toBeNull()
    expect(document.querySelector('[data-motion-ghost]')).toBeNull()
  })
})
