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
import { useState, useMemo } from 'react'

import { useStatus } from '@/hooks/use-status'
import { useNotificationStore } from '@/stores/notification-store'

function hashString(input: string): string {
  let hash = 0
  if (!input) return '0'

  for (let i = 0; i < input.length; i += 1) {
    const chr = input.charCodeAt(i)
    hash = (hash << 5) - hash + chr
    hash |= 0
  }

  return hash.toString(36)
}

/**
 * Generate a unique key for an announcement
 * Prefer backend id, fall back to a content hash so edits register
 */
function getAnnouncementKey(item: Record<string, unknown>): string {
  if (!item) return ''

  if (item.id !== undefined && item.id !== null) {
    return `id:${item.id}`
  }

  const fingerprint = JSON.stringify({
    publishDate: (item?.publishDate as string) || '',
    content: ((item?.content as string) || '').trim(),
    extra: ((item?.extra as string) || '').trim(),
    type: (item?.type as string) || '',
    title: ((item?.title as string) || '').trim(),
    link: ((item?.link as string) || '').trim(),
  })
  return `hash:${hashString(fingerprint)}`
}

/**
 * Hook to manage the notification center (announcement timeline)
 * Provides unread counts and read status management
 */
export function useNotifications() {
  const [popoverOpen, setPopoverOpen] = useState(false)

  // Fetch Announcements from status
  const { status, loading: statusLoading } = useStatus()
  const announcementsEnabled = status?.announcements_enabled ?? false
  const announcements = useMemo<Record<string, unknown>[]>(() => {
    if (!announcementsEnabled) return []
    return ((status?.announcements || []) as Record<string, unknown>[]).slice(
      0,
      20
    )
  }, [announcementsEnabled, status?.announcements])

  // Notification store
  const readAnnouncementKeys = useNotificationStore(
    (state) => state.readAnnouncementKeys
  )
  const markAnnouncementsRead = useNotificationStore(
    (state) => state.markAnnouncementsRead
  )

  // Unread announcements drive the badge
  const unreadCount = useMemo(() => {
    const readKeys = new Set(readAnnouncementKeys)
    return announcements.filter(
      (item: Record<string, unknown>) => !readKeys.has(getAnnouncementKey(item))
    ).length
  }, [announcements, readAnnouncementKeys])

  const markAnnouncementsAsRead = () => {
    if (announcements.length > 0) {
      const allKeys = announcements.map((item: Record<string, unknown>) =>
        getAnnouncementKey(item)
      )
      markAnnouncementsRead(allKeys)
    }
  }

  // Opening the notification center marks the visible timeline as read
  const handlePopoverOpenChange = (open: boolean) => {
    if (open) {
      markAnnouncementsAsRead()
    }

    setPopoverOpen(open)
  }

  return {
    // Data
    announcements,
    loading: statusLoading,

    // Unread count
    unreadCount,

    // Popover state
    popoverOpen,
    setPopoverOpen: handlePopoverOpenChange,
  }
}
