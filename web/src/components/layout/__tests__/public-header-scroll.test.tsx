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
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { PublicHeader } from '../components/public-header'

const scrollYDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY')

beforeEach(() => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: { success: true, data: url === '/api/notice' ? '' : {} },
  }))
})

afterEach(() => {
  if (scrollYDescriptor) {
    Object.defineProperty(window, 'scrollY', scrollYDescriptor)
  }
})

async function renderPublicHeader() {
  const router = createRouter({
    routeTree: createRootRoute({ component: PublicHeader }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByRole('banner')
}

function readBarLayout() {
  const header = screen.getByRole('banner')
  const [nav] = within(header).getAllByRole('navigation')
  return [header.className, nav.className]
}

it('keeps the same bar layout when the page is scrolled down', async () => {
  await renderPublicHeader()
  const layoutBeforeScroll = readBarLayout()

  Object.defineProperty(window, 'scrollY', { configurable: true, value: 400 })
  fireEvent.scroll(window)

  expect(readBarLayout()).toEqual(layoutBeforeScroll)
})
