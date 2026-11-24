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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { formatTimestampToDate } from '@/lib/format'

import type { Ticket } from '../types'
import {
  TicketCategoryLabel,
  TicketPriorityBadge,
  TicketStatusBadge,
} from './ticket-badges'

type TicketListProps = {
  tickets: Ticket[]
  /** Show who opened the ticket; for the administrator queue. */
  showAuthor?: boolean
  onOpen: (ticket: Ticket) => void
  empty: ReactNode
}

/** One scannable row per ticket; the whole row opens the thread. */
export function TicketList(props: TicketListProps) {
  const { t } = useTranslation()
  if (props.tickets.length === 0) return props.empty

  return (
    <ul className='bg-card divide-y overflow-hidden rounded-xl border'>
      {props.tickets.map((ticket) => (
        <li key={ticket.id}>
          <button
            type='button'
            onClick={() => props.onOpen(ticket)}
            className='hover:bg-muted/40 flex w-full flex-wrap items-start gap-3 px-4 py-3 text-start transition-colors duration-(--motion-fast) ease-(--ease-out)'
          >
            <span className='flex min-w-0 flex-1 flex-col gap-1'>
              <span className='flex flex-wrap items-center gap-2'>
                <span className='truncate text-sm font-medium'>
                  {ticket.subject}
                </span>
                <TicketPriorityBadge priority={ticket.priority} />
              </span>
              <span className='text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs'>
                <span>#{ticket.id}</span>
                <span aria-hidden='true'>·</span>
                <TicketCategoryLabel category={ticket.category} />
                {props.showAuthor && (
                  <>
                    <span aria-hidden='true'>·</span>
                    <span>{ticket.username || '—'}</span>
                  </>
                )}
                <span aria-hidden='true'>·</span>
                <span>
                  {ticket.assignee_name
                    ? t('Assigned to {{name}}', { name: ticket.assignee_name })
                    : t('Unassigned')}
                </span>
                <span aria-hidden='true'>·</span>
                <span>
                  {t('{{count}} messages', { count: ticket.message_count })}
                </span>
                <span aria-hidden='true'>·</span>
                <span>
                  {formatTimestampToDate(
                    ticket.last_reply_at || ticket.created_at
                  )}
                </span>
              </span>
            </span>
            <TicketStatusBadge status={ticket.status} />
          </button>
        </li>
      ))}
    </ul>
  )
}
