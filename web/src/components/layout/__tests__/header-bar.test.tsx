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
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { useAuthStore } from '@/stores/auth-store'

import { AuthenticatedLayout } from '../components/authenticated-layout'
import { PublicLayout } from '../components/public-layout'

beforeEach(() => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: { success: true, data: url === '/api/notice' ? '' : {} },
  }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
})

async function renderPage(page: () => ReactNode, path = '/') {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queries.setQueryData(['status'], { system_name: 'DEMO' })
  const router = createRouter({
    routeTree: createRootRoute({ component: page }),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={queries}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return screen.findByRole('banner')
}

/** What one page's bar shows, read the way a reader sees it. */
async function readBar(page: () => ReactNode) {
  const header = await renderPage(page)
  const nav = within(header).getByRole('navigation', {
    name: 'Main navigation',
  })
  const bar = {
    heightClass: header.firstElementChild?.className,
    reservedHeightClass: document.querySelector<HTMLElement>(
      "[data-slot='header-spacer']"
    )?.className,
    links: within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent),
    current: within(nav)
      .queryAllByRole('link', { current: 'page' })
      .map((link) => link.textContent),
    mark: header.querySelector<SVGSVGElement>("[data-slot='brand-mark']"),
    logoImage: header.querySelector('img'),
    currentClassName: within(nav).queryAllByRole('link', { current: 'page' })[0]
      ?.className,
    otherClassName: within(nav)
      .getAllByRole('link')
      .find((link) => link.getAttribute('aria-current') !== 'page')?.className,
    search: Boolean(within(header).queryByRole('button', { name: 'Search' })),
    actions: within(header)
      .getAllByRole('button')
      .map(
        (button) =>
          button.getAttribute('aria-label') ?? button.textContent?.trim()
      )
      // The console's one addition: the button that opens its sidebar drawer.
      .filter((label) => label !== 'Open menu'),
  }
  cleanup()
  return bar
}

const signedIn = () => {
  useAuthStore.getState().auth.setUser({ id: 7, username: 'ada', role: 1 })
}

it('gives the console and the public pages one and the same bar', async () => {
  signedIn()
  const consoleBar = await readBar(() => (
    <AuthenticatedLayout>page</AuthenticatedLayout>
  ))
  const publicBar = await readBar(() => <PublicLayout>page</PublicLayout>)

  expect(publicBar).toEqual(consoleBar)
  expect(publicBar.heightClass).toContain('h-(--app-header-height,3.5rem)')
  expect(publicBar.reservedHeightClass).toContain(
    'h-(--app-header-height,3.5rem)'
  )
  // The search field is gone from the bar; the menu holds it instead.
  expect(publicBar.search).toBe(false)
  expect(publicBar.actions).toContain('Toggle navigation menu')
})

it('opens the account readout from the balance, with top-up and the analysis page', async () => {
  signedIn()
  const quota = 582_710_000
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: { success: true, data: url === '/api/user/self' ? { quota } : {} },
  }))

  const header = await renderPage(() => <PublicLayout>page</PublicLayout>)
  const trigger = await within(header).findByRole('button', {
    name: /Balance/,
  })
  await waitFor(() =>
    expect(trigger).toHaveTextContent(
      formatQuotaWithCurrency(quota, { locale: 'en' })
    )
  )
  expect(trigger).toHaveAttribute('data-slot', 'header-balance')

  fireEvent.click(trigger)
  const panel = await screen.findByRole('dialog')
  expect(
    within(panel).getByText(formatQuotaWithCurrency(quota, { locale: 'en' }))
  ).toBeVisible()
  expect(within(panel).getByText('24h usage')).toBeVisible()
  expect(within(panel).getByText('Total consumption')).toBeVisible()
  expect(within(panel).getByText('Request Count')).toBeVisible()
  // Both actions are the project's Button drawn over a link, so they carry
  // button semantics and a destination.
  expect(within(panel).getByRole('button', { name: 'Top-up' })).toHaveAttribute(
    'href',
    '/wallet'
  )
  expect(
    within(panel).getByRole('button', { name: 'Dashboard' })
  ).toHaveAttribute('href', '/dashboard/models')
})

it('turns the balance red once it is under five', async () => {
  signedIn()
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: {
      success: true,
      data: url === '/api/user/self' ? { quota: 1_500_000 } : {},
    },
  }))

  const header = await renderPage(() => <PublicLayout>page</PublicLayout>)
  const trigger = await within(header).findByRole('button', {
    name: /Balance/,
  })
  await waitFor(() => expect(trigger).toHaveAttribute('data-low', 'true'))
  expect(
    within(trigger).getByText(
      formatQuotaWithCurrency(1_500_000, { locale: 'en' })
    )
  ).toHaveClass('text-destructive')

  fireEvent.click(trigger)
  const panel = await screen.findByRole('dialog')
  expect(panel.querySelector("[data-slot='balance-panel-amount']")).toHaveClass(
    'text-destructive'
  )
})

it('reads the balance again once a top-up has moved it in the store', async () => {
  signedIn()
  let quota = 582_710_000
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: { success: true, data: url === '/api/user/self' ? { quota } : {} },
  }))

  const header = await renderPage(() => <PublicLayout>page</PublicLayout>)
  const trigger = await within(header).findByRole('button', {
    name: /Balance/,
  })
  await waitFor(() =>
    expect(trigger).toHaveTextContent(
      formatQuotaWithCurrency(582_710_000, { locale: 'en' })
    )
  )

  // The wallet page credits the account and updates the signed-in user; the
  // header must not keep showing what it read before the payment.
  quota = 1_082_710_000
  useAuthStore.getState().auth.setUser({
    id: 7,
    username: 'ada',
    role: 1,
    quota,
  })

  await waitFor(() =>
    expect(trigger).toHaveTextContent(
      formatQuotaWithCurrency(quota, { locale: 'en' })
    )
  )
  expect(
    get.mock.calls.filter(([url]) => url === '/api/user/self')
  ).toHaveLength(2)
})

it('leaves the bar without a balance for a visitor', async () => {
  const header = await renderPage(() => <PublicLayout>page</PublicLayout>)
  expect(
    within(header).queryByRole('button', { name: /Balance/ })
  ).not.toBeInTheDocument()
})

it('keeps the menu and the same links for a visitor', async () => {
  const visitorBar = await readBar(() => <PublicLayout>page</PublicLayout>)
  signedIn()
  const memberBar = await readBar(() => <PublicLayout>page</PublicLayout>)

  expect(visitorBar.search).toBe(false)
  expect(visitorBar.links).toEqual(memberBar.links)
  expect(visitorBar.heightClass).toBe(memberBar.heightClass)
})

it('draws the mark in the bar’s ink instead of loading a picture', async () => {
  const bar = await readBar(() => <PublicLayout>page</PublicLayout>)

  // An image carries its own colours, so a picture of the mark would stay
  // white-on-black in both themes. The drawn mark follows the text colour.
  expect(bar.mark?.getAttribute('fill')).toBe('currentColor')
  expect(bar.mark?.getAttribute('aria-hidden')).toBe('true')
  expect(bar.logoImage).toBeNull()
})

it('marks the current page once, by URL, on any page', async () => {
  signedIn()
  const bar = await readBar(() => <PublicLayout>page</PublicLayout>)

  expect(bar.current).toEqual(['Home'])
  // The current page is the one filled block in the bar; the rest stay plain
  // labels, so the row reads as a choice rather than as five weights of link.
  expect(bar.currentClassName).toContain('bg-foreground')
  expect(bar.currentClassName).toContain('text-background')
  expect(bar.otherClassName).not.toContain('bg-foreground')
})

it('folds the bar into a menu at every width, with the search inside it', async () => {
  signedIn()
  const header = await renderPage(() => <PublicLayout>page</PublicLayout>)
  const menu = within(header).getByRole('button', {
    name: 'Toggle navigation menu',
  })

  expect(menu).not.toHaveClass('lg:hidden')
  expect(menu).toHaveAttribute('aria-expanded', 'false')
  const panel = document.querySelector("[data-slot='header-menu-panel']")
  expect(panel).toHaveAttribute('aria-hidden', 'true')

  fireEvent.click(menu)
  expect(menu).toHaveAttribute('aria-expanded', 'true')
  expect(panel).toHaveClass('pointer-events-auto')
  expect(panel).toHaveAttribute('aria-hidden', 'false')
  expect(
    within(panel as HTMLElement).getByRole('button', { name: 'Search' })
  ).toBeVisible()
  fireEvent.click(
    within(panel as HTMLElement).getByRole('button', {
      name: 'Close navigation menu',
    })
  )
  expect(menu).toHaveAttribute('aria-expanded', 'false')
})

it('lists the signed-in reader’s whole workspace inside the menu', async () => {
  signedIn()
  const header = await renderPage(
    () => <PublicLayout>page</PublicLayout>,
    '/keys'
  )
  fireEvent.click(
    within(header).getByRole('button', { name: 'Toggle navigation menu' })
  )
  const workspace = document.querySelector(
    "[data-slot='header-menu-workspace']"
  ) as HTMLElement

  const links = within(workspace)
    .getAllByRole('link')
    .map((link) => link.textContent)
  expect(links).toContain('API Keys')
  expect(links).toContain('Usage Logs')
  expect(links).toContain('Top-up')
  expect(links).toContain('Feedback and tickets')
  expect(
    within(workspace).getByRole('link', { current: 'page' })
  ).toHaveTextContent('API Keys')
})

it('leaves the workspace out of the menu for a visitor', async () => {
  await renderPage(() => <PublicLayout>page</PublicLayout>)

  expect(
    document.querySelector("[data-slot='header-menu-workspace']")
  ).toBeNull()
})
