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

import { FeedbackPage } from '..'

const SIGNED = {
  id: 1,
  user_id: 7,
  username: 'ada',
  content: 'The model list is hard to search.',
  contact: 'ada@example.test',
  status: 2,
  reply: 'Search is on the way.',
  replied_at: 1791000000,
  created_at: 1790000000,
}
const ANONYMOUS = {
  id: 2,
  user_id: 0,
  username: '',
  content: 'Prices changed without notice.',
  contact: '',
  status: 1,
  reply: '',
  replied_at: 0,
  created_at: 1790000500,
}

beforeEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/feedback/self') {
      return { data: { success: true, data: [SIGNED] } }
    }
    if (url === '/api/feedback/') {
      return {
        data: {
          success: true,
          open: 1,
          data: { items: [ANONYMOUS, SIGNED], total: 2 },
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
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <FeedbackPage />
    </QueryClientProvider>
  )
}

it('lets a user send a message anonymously and shows replies to signed ones', async () => {
  useAuthStore.getState().auth.setUser({ id: 7, username: 'ada', role: 1 })
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, message: '' } })
  const user = userEvent.setup()
  renderPage()

  const mine = await screen.findByRole('region', { name: 'My messages' })
  expect(within(mine).getByText('Search is on the way.')).toBeTruthy()
  expect(screen.queryByRole('region', { name: 'Messages from users' })).toBeNull()

  // Too short to be useful: nothing is sent.
  await user.type(screen.getByLabelText('Your message'), 'hi')
  await user.click(screen.getByRole('button', { name: 'Send message' }))
  expect(post).not.toHaveBeenCalled()

  await user.type(screen.getByLabelText('Your message'), ' there, grok times out')
  await user.click(screen.getByRole('checkbox'))
  await user.click(screen.getByRole('button', { name: 'Send message' }))
  expect(post).toHaveBeenCalledWith('/api/feedback/', {
    content: 'hi there, grok times out',
    anonymous: true,
  })
})

it('gives an administrator the inbox, with anonymous authors left unnamed', async () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role: 100 })
  const put = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true, message: '' } })
  const user = userEvent.setup()
  renderPage()

  const inbox = await screen.findByRole('region', {
    name: 'Messages from users',
  })
  expect(await within(inbox).findByText('Anonymous')).toBeTruthy()
  expect(within(inbox).getByText(/ada · #7/)).toBeTruthy()
  expect(within(inbox).getByText(/ada@example\.test/)).toBeTruthy()

  await user.click(within(inbox).getAllByRole('button', { name: 'Handle' })[0])
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText(/will not see a reply/)).toBeTruthy()
  await user.type(within(dialog).getByLabelText('Reply (optional)'), 'Noted.')
  await user.click(
    within(dialog).getByRole('button', { name: 'Save and mark handled' })
  )
  expect(put).toHaveBeenCalledWith('/api/feedback/2', {
    status: 2,
    reply: 'Noted.',
  })
})
