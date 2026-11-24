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
export const TICKET_STATUS = {
  OPEN: 1,
  IN_PROGRESS: 2,
  RESOLVED: 3,
  CLOSED: 4,
} as const

export const TICKET_CATEGORY = {
  BILLING: 1,
  CHANNEL: 2,
  ACCOUNT: 3,
  OTHER: 4,
} as const

export const TICKET_PRIORITY = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
} as const

export const TICKET_AUTHOR = {
  USER: 1,
  ADMIN: 2,
} as const

export const TICKET_EVENT = {
  STATUS: 'status',
  CATEGORY: 'category',
  PRIORITY: 'priority',
  ASSIGNEE: 'assignee',
} as const

/** A support thread between one user and the administrators. */
export type Ticket = {
  id: number
  user_id: number
  username: string
  subject: string
  category: number
  priority: number
  status: number
  assignee_id: number
  assignee_name: string
  status_updated_by: string
  status_updated_at: number
  resolved_at: number
  message_count: number
  last_reply_at: number
  created_at: number
  updated_at: number
}

export type TicketAttachment = {
  id: number
  ticket_id: number
  message_id: number
  file_name: string
  mime_type: string
  size: number
  created_at: number
}

export type TicketMessage = {
  id: number
  ticket_id: number
  author_id: number
  author_name: string
  author_role: number
  content: string
  created_at: number
  attachments: TicketAttachment[]
}

/** One administrator change, shown in the thread so the trail stays visible. */
export type TicketEvent = {
  id: number
  ticket_id: number
  actor_id: number
  actor_name: string
  kind: string
  from_value: string
  to_value: string
  created_at: number
}

export type TicketAssignee = {
  id: number
  name: string
}

export type TicketDetail = {
  ticket: Ticket
  messages: TicketMessage[]
  events: TicketEvent[]
}

/** The page-level status filter: open keeps open and in progress together. */
export const TICKET_STATUS_FILTER = {
  ALL: 'all',
  OPEN: 'open',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
} as const

export type TicketStatusFilter =
  (typeof TICKET_STATUS_FILTER)[keyof typeof TICKET_STATUS_FILTER]

export type TicketFilters = {
  status: TicketStatusFilter
  category: number
  priority: number
  assigneeId: number
  keyword: string
}
