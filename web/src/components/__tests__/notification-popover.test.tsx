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
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'

import { NotificationPopover } from '@/components/notification-popover'
import { useNotifications } from '@/hooks/use-notifications'
import { getNotice } from '@/lib/api'
import { useNotificationStore } from '@/stores/notification-store'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    getNotice: vi.fn(async () => ({ success: true, data: 'Legacy notice' })),
  }
})

const ANNOUNCEMENTS = [
  {
    id: 1,
    type: 'info',
    content: 'First timeline entry',
    publishDate: '2026-10-20T10:00:00+08:00',
  },
  {
    id: 2,
    type: 'warning',
    content: 'Second timeline entry',
    publishDate: '2026-10-19T10:00:00+08:00',
  },
]

function renderNotificationCenter(announcements: object[] = ANNOUNCEMENTS) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['status'], {
    announcements_enabled: true,
    announcements,
  })

  function Harness() {
    const notifications = useNotifications()
    return (
      <NotificationPopover
        open={notifications.popoverOpen}
        onOpenChange={notifications.setPopoverOpen}
        unreadCount={notifications.unreadCount}
        announcements={notifications.announcements}
        loading={notifications.loading}
      />
    )
  }

  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  useNotificationStore.setState({ readAnnouncementKeys: [] })
  vi.mocked(getNotice).mockClear()
})

it('shows the timeline directly when the bell opens, with no notice/timeline switcher', async () => {
  const user = userEvent.setup()
  renderNotificationCenter()

  await user.click(screen.getByRole('button', { name: 'Notifications' }))

  expect(await screen.findByText('First timeline entry')).toBeInTheDocument()
  expect(screen.getByText('Second timeline entry')).toBeInTheDocument()
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  expect(screen.queryByRole('tab')).not.toBeInTheDocument()
})

it('badges the bell from unread timeline entries only, without requesting the legacy notice', async () => {
  renderNotificationCenter()

  expect(await screen.findByText('2')).toBeInTheDocument()
  expect(getNotice).not.toHaveBeenCalled()
})

it('marks the timeline read once the bell opens, clearing the badge', async () => {
  const user = userEvent.setup()
  renderNotificationCenter()

  await user.click(screen.getByRole('button', { name: 'Notifications' }))

  expect(await screen.findByText('First timeline entry')).toBeInTheDocument()
  expect(screen.queryByText('2')).not.toBeInTheDocument()
})

it('keeps the system announcements heading and empty state when no timeline entry exists', async () => {
  const user = userEvent.setup()
  renderNotificationCenter([])

  await user.click(screen.getByRole('button', { name: 'Notifications' }))

  expect(await screen.findByText('System Announcements')).toBeInTheDocument()
  expect(screen.getByText('No system announcements')).toBeInTheDocument()
})
