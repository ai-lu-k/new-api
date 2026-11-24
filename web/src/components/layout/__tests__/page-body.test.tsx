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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { PublicLayout } from '../components/public-layout'
import { SectionPageLayout } from '../components/section-page-layout'

beforeEach(() => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: { success: true, data: url === '/api/notice' ? '' : {} },
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * The page body is the layer a navigation makes fall: it may only hold what the
 * page alone shows. Chrome keeps its own view-transition name, so containing it
 * here would drag the title down with the content (ui-motion.md §10.2).
 */
it('keeps the page title and actions out of the page body layer', () => {
  render(
    <SectionPageLayout pageIndex='个人工作台 / 01'>
      <SectionPageLayout.Title>概览</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <button type='button'>刷新</button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <p>唯一内容</p>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )

  const body = document.querySelector("[data-vt-name='page-body']")
  expect(body).not.toBeNull()

  const title = screen.getByRole('heading', { level: 1 })
  const actions = screen.getByRole('button', { name: '刷新' })
  const eyebrow = screen.getByText('个人工作台 / 01')

  expect(body?.contains(title)).toBe(false)
  expect(body?.contains(actions)).toBe(false)
  expect(body?.contains(eyebrow)).toBe(false)
  expect(body?.contains(screen.getByText('唯一内容'))).toBe(true)
})

it('styles the public page body without taking the header or footer into it', async () => {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <PublicLayout>
          <p>公开内容</p>
        </PublicLayout>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByRole('banner')

  const body = document.querySelector("[data-vt-name='page-body']")
  expect(body?.tagName).toBe('MAIN')
  // The gap under the bar belongs to the layout: 16px on a phone, 24px up.
  expect(body).toHaveClass('pt-4')
  expect(body).toHaveClass('md:pt-6')
  expect(body?.contains(screen.getByText('公开内容'))).toBe(true)
  expect(
    body?.contains(document.querySelector("[data-vt-name='header']"))
  ).toBe(false)
  expect(
    body?.contains(document.querySelector("[data-slot='public-footer']"))
  ).toBe(false)
})
