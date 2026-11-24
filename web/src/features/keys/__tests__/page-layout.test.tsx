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
import { cleanup, render, screen, within } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { ApiKeys } from '..'
import { apiKeySchema, type ApiKey } from '../types'

const key: ApiKey = apiKeySchema.parse({
  id: 7,
  name: 'production',
  key: 'demo********1234',
  status: 1,
  remain_quota: 40_000_000,
  used_quota: 60_000_000,
  unlimited_quota: false,
  expired_time: -1,
  created_time: 0,
  accessed_time: 0,
  group: 'default',
  model_limits_enabled: false,
})

const i18n = createInstance()
await i18n.init({
  lng: 'en',
  resources: { en: { translation: {} } },
  initAsync: false,
})

let client: QueryClient
let keys: ApiKey[]

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().auth.setUser({ id: 1, username: 'user', role: 1 })
  keys = [key]
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (String(url).startsWith('/api/token/')) {
      return {
        data: { success: true, data: { items: keys, total: keys.length } },
      }
    }
    return { data: { success: true, data: {} } }
  })
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: {} },
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  localStorage.clear()
})

async function renderKeysPage() {
  const root = createRootRoute()
  const auth = createRoute({ getParentRoute: () => root, id: '_authenticated' })
  const keysRoute = createRoute({
    getParentRoute: () => auth,
    path: 'keys/',
    component: ApiKeys,
  })
  const router = createRouter({
    routeTree: root.addChildren([auth.addChildren([keysRoute])]),
    history: createMemoryHistory({ initialEntries: ['/keys/'] }),
  })
  await router.load()
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nextProvider>
  )
  await screen.findByRole('heading', { name: 'API Keys' })
}

it('puts the key list below the page actions without a retired plan panel', async () => {
  await renderKeysPage()
  const create = screen.getByRole('button', { name: 'Create API Key' })
  const nameColumn = await screen.findByRole('columnheader', { name: 'Name' })
  expect(
    create.compareDocumentPosition(nameColumn) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  const credential = screen.getByRole('columnheader', { name: 'API Key' })
  const status = screen.getByRole('columnheader', { name: 'Status' })
  expect(
    credential.compareDocumentPosition(status) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  expect(within(screen.getByRole('table')).getByText(key.name)).toBeVisible()
  expect(
    screen.queryByRole('columnheader', { name: 'Group' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: /Token Plan/ })
  ).not.toBeInTheDocument()
})

it('keeps the create action available when the key list is empty', async () => {
  keys = []
  await renderKeysPage()
  expect(await screen.findByText('No API Keys Found')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Create API Key' })).toBeEnabled()
})
