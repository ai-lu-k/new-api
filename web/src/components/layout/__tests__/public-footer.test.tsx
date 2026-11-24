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

For commercial licensing, please contact support@quantumnous.com.
*/
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { PublicFooter } from '../components/public-footer'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function readFooter(props: { siteName?: string } = {}) {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <PublicFooter siteName={props.siteName} />,
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(<RouterProvider router={router} />)

  const footer = await screen.findByRole('contentinfo')
  const links = within(footer)
    .getAllByRole('link')
    .map((link) => ({
      label: link.textContent,
      href: link.getAttribute('href'),
    }))
  return {
    footer,
    links,
    attribution: within(footer).getByText(/QuantumNous/).textContent,
    wordmark: footer.querySelector("[data-slot='footer-wordmark']"),
  }
}

it('offers the pages a reader looks for after the content, in order', async () => {
  const { links } = await readFooter()

  expect(links).toEqual([
    { label: 'About', href: '/about' },
    { label: 'User Agreement', href: '/user-agreement' },
    { label: 'Privacy Policy', href: '/privacy-policy' },
    { label: 'Tutorial', href: '/tutorial' },
  ])
})

it('keeps the project attribution, and the site name when one is given', async () => {
  expect((await readFooter()).attribution).toBe('new-api · © QuantumNous')
  cleanup()
  expect((await readFooter({ siteName: 'DEMO' })).attribution).toBe(
    'DEMO · © QuantumNous'
  )
})

it('draws the wordmark as decoration that spans the column it is given', async () => {
  const { wordmark } = await readFooter()
  const svg = wordmark as unknown as SVGSVGElement | null

  expect(svg?.getAttribute('aria-hidden')).toBe('true')
  // Geometry lives in the viewBox, so the mark scales with the column instead
  // of being re-set at every breakpoint.
  expect(svg?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
  expect(svg?.className.baseVal).toContain('w-full')
  expect(
    [...(svg?.querySelectorAll('text') ?? [])].map((text) => text.textContent)
  ).toEqual(['NEW API', 'NEW API'])
  // Nothing filled: the mark is outlines only until the pointer arrives.
  expect(svg?.querySelector('text')?.getAttribute('fill')).toBe('none')
})

it('lights only the part of the mark the pointer is over', async () => {
  const { wordmark } = await readFooter()
  const svg = wordmark as unknown as SVGSVGElement
  const halo = svg.querySelector('mask g')
  const filled = svg.querySelector('text[fill="currentColor"]')

  // A second copy of the word, filled, shown through a mask that the pointer
  // moves: the light is local rather than the whole mark switching on.
  expect(filled).not.toBeNull()
  expect(filled?.closest('g')?.getAttribute('mask')).toMatch(
    /^url\(#.+-mask\)$/
  )
  expect(svg.querySelector('mask circle')).not.toBeNull()
  expect(halo).not.toBeNull()
})

it('carries the light along with the pointer', async () => {
  const { wordmark } = await readFooter()
  const svg = wordmark as unknown as SVGSVGElement
  const halo = svg.querySelector('mask g') as SVGGElement
  const host = svg.parentElement as HTMLElement
  // The browser would lay the mark out; give it the box the pointer maths needs.
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1180,
    bottom: 253,
    width: 1180,
    height: 253,
    toJSON: () => ({}),
  } as DOMRect)

  const lightAt = (clientX: number, clientY: number) => {
    host.dispatchEvent(
      new MouseEvent('pointermove', { clientX, clientY, bubbles: true })
    )
    const [, x, y] =
      (halo.getAttribute('transform') ?? '').match(
        /translate\(([-\d.]+) ([-\d.]+)\)/
      ) ?? []
    return { x: Number(x), y: Number(y) }
  }

  const left = lightAt(100, 60)
  const right = lightAt(900, 200)

  expect(right.x).toBeGreaterThan(left.x)
  expect(right.y).toBeGreaterThan(left.y)
})

it('stacks the mark over the links on a phone and sets them side by side above it', async () => {
  const { footer, links } = await readFooter()
  const row = footer.querySelector('div > div')
  const list = within(footer).getAllByRole('list')[0]

  expect(row?.className).toContain('flex-col')
  expect(row?.className).toContain('sm:flex-row')
  // The links stand in one column once there is room for it.
  expect(list.className).toContain('sm:flex-col')
  expect(links).toHaveLength(4)
})
