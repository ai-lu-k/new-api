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
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useTopNavLinks } from '../use-top-nav-links'

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function topNavLinksFor(headerNavModules: object) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['status'], {
    HeaderNavModules: JSON.stringify(headerNavModules),
  })
  function Wrapper(props: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        {props.children}
      </QueryClientProvider>
    )
  }
  const { result } = renderHook(() => useTopNavLinks(), { wrapper: Wrapper })
  return result.current.map((link) => [link.title, link.href])
}

it('labels the landing page link Quick Start and lists no separate guide link', () => {
  const links = topNavLinksFor({
    home: true,
    console: true,
    pricing: { enabled: true, requireAuth: false },
    rankings: { enabled: true, requireAuth: false },
    guide: { enabled: true, requireAuth: false },
    docs: false,
    about: false,
  })

  expect(links).toEqual([
    ['Quick Start', '/'],
    ['Console', '/dashboard'],
    ['Model Square', '/pricing'],
    ['Rankings', '/rankings'],
  ])
})

it('leaves the landing page link out when the home module is switched off', () => {
  const links = topNavLinksFor({ home: false, docs: false, about: false })

  expect(links.map(([, href]) => href)).not.toContain('/')
})
