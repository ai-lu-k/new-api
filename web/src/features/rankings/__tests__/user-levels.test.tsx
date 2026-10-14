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
import { render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { UserLevelsSection } from '../components/user-levels-section'
import type { UserLevelRankings } from '../types'

beforeEach(() => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: {} } })
})

function renderLevels(data: UserLevelRankings) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <UserLevelsSection data={data} />
    </QueryClientProvider>
  )
}

const data: UserLevelRankings = {
  total_users: 51,
  levels: Array.from({ length: 7 }, (_, level) => ({
    level,
    min_quota: level,
    users: level === 1 ? 51 : 0,
  })),
  users: [
    { rank: 1, name: 'A***1', level: 1, used_quota: 10, request_count: 3 },
  ],
  me: {
    rank: 51,
    name: 'A***9',
    level: 1,
    used_quota: 10,
    request_count: 2,
    is_me: true,
  },
}

it('shows the reader below the cut-off without adding them to the published table', () => {
  renderLevels(data)
  expect(screen.getByText('Your place: #51 of 51')).toBeVisible()
  const table = screen.getByRole('table')
  expect(within(table).getByText('A***1')).toBeVisible()
  expect(within(table).queryByText('A***9')).not.toBeInTheDocument()
})

it('marks a listed reader without repeating the separate own-place card', () => {
  renderLevels({
    ...data,
    users: [{ ...data.users[0], is_me: true }],
    me: { ...data.users[0], is_me: true },
  })
  expect(within(screen.getByRole('table')).getByText('You')).toBeVisible()
  expect(screen.queryByText(/Your place:/)).not.toBeInTheDocument()
})

it('shows the empty state when no account has settled consumption', () => {
  renderLevels({ ...data, total_users: 0, users: [], me: undefined })
  expect(
    screen.getByRole('heading', { name: 'No levels to show yet' })
  ).toBeVisible()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})
