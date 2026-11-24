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
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { TicketPage } from '..'

const TICKET = {
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

const MESSAGE = {
  id: 30,
  ticket_id: 12,
  author_id: 7,
  author_name: 'mei',
  author_role: 1,
  content: 'grok returns 500 since this morning',
  created_at: 1790000000,
  attachments: [],
}

beforeEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/ticket/self') {
      return { data: { success: true, data: { items: [TICKET], total: 1 } } }
    }
    if (url === '/api/ticket/12') {
      return {
        data: {
          success: true,
          data: { ticket: TICKET, messages: [MESSAGE], events: [] },
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
      <TicketPage />
    </QueryClientProvider>
  )
}

/** The last list request, as the API received it. */
function lastListParams(): Record<string, unknown> {
  const calls = vi
    .mocked(api.get)
    .mock.calls.filter(([url]) => url === '/api/ticket/self')
  const config = calls.at(-1)?.[1] as
    | { params?: Record<string, unknown> }
    | undefined
  return config?.params ?? {}
}

it('shows a user their tickets as a table with status, priority and category', async () => {
  useAuthStore.getState().auth.setUser({ id: 7, username: 'mei', role: 1 })
  renderPage()

  const table = await screen.findByRole('table')
  expect(
    within(table).getByRole('columnheader', { name: 'Subject' })
  ).toBeTruthy()
  expect(await within(table).findByText('Channel errors')).toBeTruthy()
  expect(within(table).getByText('Open')).toBeTruthy()
  expect(within(table).getByText('Channel')).toBeTruthy()
  expect(within(table).getByText('High')).toBeTruthy()
  expect(lastListParams()).toMatchObject({ p: 1, page_size: 20 })
})

it('narrows the list by status tab and by the subject search', async () => {
  useAuthStore.getState().auth.setUser({ id: 7, username: 'mei', role: 1 })
  const user = userEvent.setup()
  renderPage()

  await screen.findByRole('table')
  await user.click(screen.getByRole('tab', { name: 'Resolved' }))
  expect(lastListParams()).toMatchObject({ status: 'resolved', p: 1 })

  await user.type(screen.getByLabelText('Search by subject'), 'grok')
  await user.click(screen.getByRole('button', { name: 'View' }))
  expect(lastListParams()).toMatchObject({ keyword: 'grok', p: 1 })
})

it('keeps the status tabs a named tab group that moves the list with it', async () => {
  useAuthStore.getState().auth.setUser({ id: 7, username: 'mei', role: 1 })
  const user = userEvent.setup()
  renderPage()

  await screen.findByRole('table')
  const tabs = screen.getByRole('tablist', { name: 'Status' })
  const all = within(tabs).getByRole('tab', { name: 'All' })
  expect(all).toHaveAttribute('aria-selected', 'true')

  await user.click(within(tabs).getByRole('tab', { name: 'Resolved' }))

  expect(within(tabs).getByRole('tab', { name: 'Resolved' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  expect(lastListParams()).toMatchObject({ status: 'resolved', p: 1 })
})

it('opens the thread from the subject and sends a reply', async () => {
  useAuthStore.getState().auth.setUser({ id: 7, username: 'mei', role: 1 })
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, data: TICKET } })
  const user = userEvent.setup()
  renderPage()

  await user.click(
    await screen.findByRole('button', { name: /Channel errors/ })
  )
  const dialog = await screen.findByRole('dialog')
  expect(
    within(dialog).getByText('grok returns 500 since this morning')
  ).toBeTruthy()
  // The user cannot change administrator fields.
  expect(within(dialog).queryByLabelText('Assignee')).toBeNull()

  await user.type(
    within(dialog).getByLabelText('Reply'),
    'It happens with every model on that channel.'
  )
  await user.click(within(dialog).getByRole('button', { name: 'Send reply' }))

  expect(post).toHaveBeenCalledTimes(1)
  const [url, body] = post.mock.calls[0]
  expect(url).toBe('/api/ticket/12/messages')
  expect((body as FormData).get('content')).toBe(
    'It happens with every model on that channel.'
  )
})

it('takes a pasted screenshot as an attachment', async () => {
  useAuthStore.getState().auth.setUser({ id: 7, username: 'mei', role: 1 })
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, data: TICKET } })
  const user = userEvent.setup()
  renderPage()

  const newTickets = await screen.findAllByRole('button', {
    name: 'New ticket',
  })
  await user.click(newTickets[0])
  const dialog = await screen.findByRole('dialog')
  await user.type(within(dialog).getByLabelText('Subject'), 'Channel errors')
  const textarea = within(dialog).getByLabelText('What happened?')
  await user.type(textarea, 'grok returns 500 since this morning')

  const screenshot = new File(['png'], 'shot.png', { type: 'image/png' })
  fireEvent.paste(textarea, {
    clipboardData: {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => screenshot }],
    },
  })
  expect(within(dialog).getByText('shot.png')).toBeTruthy()

  await user.click(within(dialog).getByRole('button', { name: 'Open ticket' }))
  const [url, body] = post.mock.calls[0]
  expect(url).toBe('/api/ticket/')
  const form = body as FormData
  expect(form.get('subject')).toBe('Channel errors')
  expect((form.getAll('files') as File[])[0]?.name).toBe('shot.png')
})

it('opens a ticket whose only message carries no screenshot', async () => {
  useAuthStore.getState().auth.setUser({ id: 7, username: 'mei', role: 1 })
  // A message without screenshots can reach the page as a null list; the
  // thread has to render it instead of taking the whole page down.
  vi.mocked(api.get).mockImplementation(async (url) => {
    if (url === '/api/ticket/self') {
      return { data: { success: true, data: { items: [TICKET], total: 1 } } }
    }
    if (url === '/api/ticket/12') {
      return {
        data: {
          success: true,
          data: {
            ticket: TICKET,
            messages: [{ ...MESSAGE, attachments: null }],
            events: [],
          },
        },
      }
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  const user = userEvent.setup()
  renderPage()

  await user.click(
    await screen.findByRole('button', { name: /Channel errors/ })
  )
  const dialog = await screen.findByRole('dialog')
  expect(
    within(dialog).getByText('grok returns 500 since this morning')
  ).toBeTruthy()
})
