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
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import type { RelayAttempt } from '../../types'
import { RelayDiagnostics } from '../dialogs/relay-diagnostics'

const clients: QueryClient[] = []
const attempt: RelayAttempt = {
  attempt: 1,
  scope: { channel_id: 18, model: 'model', path: '/v1/responses' },
  effort: 'max',
  streaming: true,
  format: 'openai_responses',
  budgets: {
    headers_seconds: 600,
    first_byte_seconds: 300,
    idle_seconds: 300,
    total_seconds: 1800,
    source: 'reasoning_default',
  },
  duration_ms: 301000,
  max_silence_ms: 300000,
  first_event_ms: 12,
  first_content_ms: null,
  first_reasoning_ms: null,
  bytes: 100,
  event_count: 1,
  upstream_heartbeats: 0,
  downstream_pings: 30,
  status: 200,
  protocol: 'HTTP/2.0',
  end_reason: 'timeout',
  timeout_phase: 'idle',
  detailed: false,
  detail_state: 'inactive',
}
function show(admin: boolean, root: boolean): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  client.setQueryData(['relay-diagnostics'], {
    windows: [],
    shared: false,
    window_seconds: 600,
    writes: { dropped: 0, failed: 0 },
  })
  render(
    <QueryClientProvider client={client}>
      <RelayDiagnostics
        outcome={{
          end_reason: 'timeout',
          timeout_phase: 'idle',
          duration_ms: 301000,
          max_silence_ms: 300000,
          first_content_ms: null,
        }}
        report={{ attempts: [attempt], truncated: false }}
        timeline={[
          {
            attempt: 1,
            events: [
              {
                sequence: 1,
                at_ms: 12,
                kind: 'lifecycle',
                direction: 'upstream',
              },
            ],
          },
        ]}
        isAdmin={admin}
        isRoot={root}
      />
    </QueryClientProvider>
  )
}
afterEach(() => {
  clients.forEach((client) => client.clear())
  clients.length = 0
})

test('ordinary users see the outcome without channel, retry or timeline details', () => {
  show(false, false)
  expect(screen.getByText('Relay diagnostics')).toBeInTheDocument()
  expect(screen.queryByText('#18')).toBeNull()
  expect(screen.queryByText('Timeout budgets')).toBeNull()
  expect(screen.queryByText('lifecycle')).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
})

test('administrators see budgets and unavailable content time but no root trace controls', () => {
  show(true, false)
  expect(screen.getByText('Timeout budgets')).toBeInTheDocument()
  expect(screen.getByText('#18')).toBeInTheDocument()
  expect(screen.getByText('First content')).toBeInTheDocument()
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.queryByText('lifecycle')).toBeNull()
})

test('root can start scoped tracing with the keyboard and sees root event classifications', async () => {
  const update = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        windows: [],
        shared: true,
        window_seconds: 600,
        writes: { dropped: 0, failed: 0 },
      },
    },
  })
  show(true, true)
  const user = userEvent.setup()
  const button = screen.getByRole('button', { name: 'Start temporary trace' })
  button.focus()
  await user.keyboard('{Enter}')
  expect(update).toHaveBeenCalledWith('/api/relay-diagnostics', {
    scope: attempt.scope,
    enabled: true,
  })
  expect(screen.getByText('lifecycle')).toBeInTheDocument()
})

test('failed trace updates remain visible and can be retried', async () => {
  vi.spyOn(api, 'put').mockRejectedValue(new Error('Trace update failed'))
  show(true, true)
  await userEvent.click(
    screen.getByRole('button', { name: 'Start temporary trace' })
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Trace update failed'
  )
  expect(
    screen.getByRole('button', { name: 'Start temporary trace' })
  ).toBeEnabled()
})

test('trace writes disable repeated clicks while pending', async () => {
  let finish: (value: { data: { success: boolean } }) => void = () => undefined
  const response = new Promise<{ data: { success: boolean } }>((resolve) => {
    finish = resolve
  })
  const update = vi.spyOn(api, 'put').mockReturnValue(response)
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        windows: [],
        shared: true,
        window_seconds: 600,
        writes: { dropped: 0, failed: 0 },
      },
    },
  })
  show(true, true)
  const button = screen.getByRole('button', { name: 'Start temporary trace' })
  await userEvent.click(button)
  expect(button).toBeDisabled()
  await userEvent.click(button)
  expect(update).toHaveBeenCalledTimes(1)
  finish({ data: { success: true } })
  await waitFor(() => expect(button).toBeEnabled())
})

test('an active trace displays its expiry and can be stopped', async () => {
  const update = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true } })
  const window = {
    scope: attempt.scope,
    until: Date.now() + 600000,
    reason: 'timeout',
    detailed: 1,
  }
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        windows: [window],
        shared: true,
        window_seconds: 600,
        writes: { dropped: 0, failed: 0 },
      },
    },
  })
  show(true, true)
  const client = clients[0]
  act(() =>
    client.setQueryData(['relay-diagnostics'], {
      windows: [window],
      shared: true,
      window_seconds: 600,
      writes: { dropped: 0, failed: 0 },
    })
  )
  expect(await screen.findByText('Expires')).toBeInTheDocument()
  expect(screen.getByText('Shared via Redis')).toBeInTheDocument()
  await userEvent.click(
    screen.getByRole('button', { name: 'Stop temporary trace' })
  )
  expect(update).toHaveBeenCalledWith('/api/relay-diagnostics', {
    scope: attempt.scope,
    enabled: false,
  })
})
