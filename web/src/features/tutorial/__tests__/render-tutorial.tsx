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
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'

import { Tutorial } from '..'

/**
 * The page inside a router, because its own copy links to the console, the
 * token page, the model square and the ticket page: those routes have to exist
 * for a link to render. They draw nothing — every test here reads the tutorial itself.
 */
export async function renderTutorial() {
  const rootRoute = createRootRoute({ component: Tutorial })
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/dashboard' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/keys' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/pricing' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/tickets' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/tutorial'] }),
  })
  await router.load()

  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )

  await screen.findByRole('heading', { level: 1 })
  return view
}
