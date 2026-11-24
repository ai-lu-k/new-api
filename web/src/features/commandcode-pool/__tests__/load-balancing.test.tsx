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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { LoadBalancingSection } from '../components/settings/load-balancing-section'

afterEach(() => {
  vi.restoreAllMocks()
})

it('saves what the proxy reports and leaves absent fields alone', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { maxRetries: 2, cooldownMs: 60_000 } },
  })
  const put = vi.spyOn(api, 'put').mockResolvedValue({
    data: {
      success: true,
      data: { maxRetries: 4, cooldownMs: 60_000 },
    },
  })

  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <LoadBalancingSection />
    </QueryClientProvider>
  )

  const retries = await screen.findByLabelText('Max retries')
  await userEvent.clear(retries)
  await userEvent.type(retries, '4')
  await userEvent.click(
    screen.getByRole('button', { name: 'Save load balancing' })
  )

  await waitFor(() => expect(put).toHaveBeenCalled())
  // The deployed proxy reports neither a strategy nor session affinity, so the
  // request must not carry them.
  expect(put).toHaveBeenCalledWith('/api/commandcode-pool/lb', {
    maxRetries: 4,
    cooldownMs: 60_000,
  })
  expect(screen.queryByLabelText('Strategy')).not.toBeInTheDocument()
})
