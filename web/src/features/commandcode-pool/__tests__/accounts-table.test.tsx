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
import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { AccountsTab } from '../components/accounts-tab'

function poolKey(id: number, label: string) {
  return {
    id: `key_${id}`,
    label,
    keyPrefix: `user_${id}abcdef…`,
    weight: 1,
    enabled: true,
    priority: 0,
    createdAt: 1_760_000_000_000,
    lastUsedAt: null,
    lastErrorAt: null,
    errorCount: 0,
    consecutiveFailures: 0,
    autoDisabled: null,
    cooldownUntil: 0,
    cooling: false,
    credits: {
      plan: 'individual-go',
      creditsRemaining: 100 * id,
      windows: [{ name: 'weekly', used: 10 * id, cap: 500 }],
      fetchedAt: 1_760_000_000_000,
      expiresAt: null,
    },
    expiresAt: null,
    activeSessions: 0,
    inflight: 0,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

it('renders one row per key in the order the proxy dispatches', async () => {
  const calls: string[] = []
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    calls.push(url)
    if (url === '/api/commandcode-pool/pool') {
      return {
        data: {
          success: true,
          data: {
            apiBase: 'https://api.commandcode.ai',
            lb: { maxRetries: 2, cooldownMs: 60000 },
            settings: {
              mode: 'session',
              failThreshold: 3,
              sessionTtlMs: 21600000,
              creditsRefreshMs: 900000,
              autoDisableExhausted: true,
              onAllExhausted: 'error',
            },
            creditsRefresh: {
              intervalMs: 900000,
              running: false,
              lastAt: 0,
              nextAt: 0,
              lastDurationMs: 0,
              lastOk: 0,
              lastFailed: 0,
              lastError: null,
            },
            serverTime: 1_760_000_000_000,
            // Only the keys that can serve right now, in dispatch order.
            poolOrder: [
              {
                id: 'key_3',
                label: 'Key 3',
                priority: 0,
                inflight: 0,
                sessions: 0,
                idle: true,
                expiresAt: null,
              },
              {
                id: 'key_1',
                label: 'Key 1',
                priority: 0,
                inflight: 0,
                sessions: 0,
                idle: true,
                expiresAt: null,
              },
            ],
            sessions: [],
            keys: Array.from({ length: 8 }, (_, index) =>
              poolKey(index + 1, `Key ${index + 1}`)
            ),
          },
        },
      }
    }
    return { data: { success: true, data: {} } }
  })

  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AccountsTab />
    </QueryClientProvider>
  )

  await screen.findByText('Key 3')
  expect(screen.getByText('Key 8')).toBeInTheDocument()
  // The header row plus one row per key.
  const rows = screen.getAllByRole('row')
  expect(rows).toHaveLength(9)
  // Pool members lead in the proxy's dispatch order; the rest follow.
  expect(rows[1]).toHaveTextContent('Key 3')
  expect(rows[2]).toHaveTextContent('Key 1')
  expect(rows[3]).toHaveTextContent('Key 2')
  expect(calls).toContain('/api/commandcode-pool/pool')
})
