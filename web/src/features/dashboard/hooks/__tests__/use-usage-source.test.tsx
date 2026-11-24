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
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { useUsageSource } from '../use-usage-source'

let client: QueryClient

afterEach(() => {
  client.clear()
  vi.restoreAllMocks()
})

function renderUsageSource() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderHook(() => useUsageSource(), {
    wrapper: (props: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        {props.children}
      </QueryClientProvider>
    ),
  })
}

it('keeps the funding split the account endpoint returns', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        gift_used: 100_000_000,
        token_plan_used: 25_000_000,
        gift_plan_used: 125_000_000,
        gift_known: true,
      },
    },
  })

  const { result } = renderUsageSource()

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data?.gift_used).toBe(100_000_000)
  expect(result.current.data?.gift_known).toBe(true)
})

it('stays quiet when a deployment does not serve the endpoint yet', async () => {
  vi.spyOn(api, 'get').mockRejectedValue(
    new Error('Request failed with status code 404')
  )

  const { result } = renderUsageSource()

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.data).toBeUndefined()
})

it('drops a payload without the traceability flag instead of guessing', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { gift_used: 12, token_plan_used: 3 } },
  })

  const { result } = renderUsageSource()

  await waitFor(() => expect(result.current.isFetched).toBe(true))
  expect(result.current.data).toBeNull()
})
