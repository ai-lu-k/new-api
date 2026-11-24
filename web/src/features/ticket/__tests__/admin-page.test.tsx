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
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { TicketAdminPage } from '../admin-page'

const OPEN_TICKET = {
  id: 12,
  user_id: 7,
  username: 'mei',
  subject: 'Channel errors',
  category: 2,
  priority: 3,
  status: 1,
  assignee_id: 0,
  assignee_name: '',
  status_updated_by: 'mei',
  status_updated_at: 1790000000,
  resolved_at: 0,
  message_count: 1,
  last_reply_at: 1790000000,
  created_at: 1790000000,
  updated_at: 1790000000,
}

const ASSIGNED_TICKET = {
  ...OPEN_TICKET,
  id: 13,
  username: 'ada',
  subject: 'Refund missing',
  category: 1,
  priority: 2,
  status: 4,
  assignee_id: 1,
  assignee_name: 'Ada',
  message_count: 2,
}

beforeEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/ticket/') {
      return {
        data: {
          success: true,
          open: 1,
          counts: { 1: 1, 4: 1 },
          data: { items: [OPEN_TICKET, ASSIGNED_TICKET], total: 2 },
        },
      }
    }
    if (url === '/api/ticket-assignees') {
      return { data: { success: true, data: [{ id: 1, name: 'Ada' }] } }
    }
    if (url === '/api/ticket/12') {
      return {
        data: {
          success: true,
          data: {
            ticket: OPEN_TICKET,
            messages: [
              {
                id: 30,
                ticket_id: 12,
                author_id: 7,
                author_name: 'mei',
                author_role: 1,
                content: 'grok returns 500 since this morning',
                created_at: 1790000000,
                attachments: [],
              },
            ],
            events: [],
          },
        },
      }
    }
    throw new Error(`Unexpected request: ${url}`)
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderPage() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <TicketAdminPage />
    </QueryClientProvider>
  )
}

function lastQueueParams(): Record<string, unknown> {
  const calls = vi
    .mocked(api.get)
    .mock.calls.filter(([url]) => url === '/api/ticket/')
  const config = calls.at(-1)?.[1] as
    | { params?: Record<string, unknown> }
    | undefined
  return config?.params ?? {}
}

it('lists every ticket with its owner and assignee', async () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role: 100 })
  renderPage()

  const table = await screen.findByRole('table')
  expect(within(table).getByRole('columnheader', { name: 'User' })).toBeTruthy()
  expect(
    within(table).getByRole('columnheader', { name: 'Assignee' })
  ).toBeTruthy()
  expect(await within(table).findByText('Channel errors')).toBeTruthy()
  expect(await within(table).findByText('Refund missing')).toBeTruthy()
  expect(within(table).getByText('ada')).toBeTruthy()
  expect(within(table).getByText('Unassigned')).toBeTruthy()
  expect(within(table).getByText('Ada')).toBeTruthy()
})

it('filters the queue by the closed tab', async () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role: 100 })
  const user = userEvent.setup()
  renderPage()

  await screen.findByRole('table')
  await user.click(screen.getByRole('tab', { name: 'Closed' }))
  expect(lastQueueParams()).toMatchObject({ status: 'closed', p: 1 })
})

it('gives an administrator the ticket fields when a ticket is opened', async () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role: 100 })
  const user = userEvent.setup()
  renderPage()

  await user.click(
    await screen.findByRole('button', { name: /Channel errors/ })
  )
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByLabelText('Status')).toBeTruthy()
  expect(within(dialog).getByLabelText('Assignee')).toBeTruthy()
  expect(within(dialog).getByLabelText('Category')).toBeTruthy()
  expect(within(dialog).getByLabelText('Priority')).toBeTruthy()
  expect(within(dialog).getByLabelText('Reply')).toBeTruthy()
})
