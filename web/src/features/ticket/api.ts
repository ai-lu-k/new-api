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
import { api } from '@/lib/api'

import {
  TICKET_STATUS_FILTER,
  type Ticket,
  type TicketAssignee,
  type TicketDetail,
  type TicketEvent,
  type TicketFilters,
  type TicketStatusFilter,
} from './types'

type Result<T = undefined> = { success: boolean; message?: string; data?: T }

export type TicketPage = { items: Ticket[]; total: number }

export type TicketQueue = Result<TicketPage> & {
  open?: number
  counts?: Record<string, number>
}

/** The administrators a ticket can be assigned to. */
export async function getTicketAssignees(): Promise<Result<TicketAssignee[]>> {
  const res = await api.get('/api/ticket-assignees')
  return res.data
}

export type TicketUpdateResult = { ticket: Ticket; events: TicketEvent[] }

export type TicketListParams = {
  page: number
  pageSize: number
  status: TicketStatusFilter
  category: number
  priority: number
  keyword: string
}

function ticketListQuery(
  params: TicketListParams
): Record<string, string | number> {
  const query: Record<string, string | number> = {
    p: params.page,
    page_size: params.pageSize,
  }
  if (params.status !== TICKET_STATUS_FILTER.ALL) query.status = params.status
  if (params.category) query.category = params.category
  if (params.priority) query.priority = params.priority
  if (params.keyword.trim()) query.keyword = params.keyword.trim()
  return query
}

/** The tickets the signed-in user opened. */
export async function getMyTickets(
  params: TicketListParams
): Promise<Result<TicketPage>> {
  const res = await api.get('/api/ticket/self', {
    params: ticketListQuery(params),
  })
  return res.data
}

/** Every ticket, for administrators. Zero means "any" in `filters`. */
export async function getTicketQueue(
  filters: TicketFilters,
  params: { page: number; pageSize: number }
): Promise<TicketQueue> {
  const query = ticketListQuery({ ...filters, ...params })
  if (filters.assigneeId) query.assignee_id = filters.assigneeId
  const res = await api.get('/api/ticket/', { params: query })
  return res.data
}

export async function getTicketDetail(
  id: number
): Promise<Result<TicketDetail>> {
  const res = await api.get(`/api/ticket/${id}`)
  return res.data
}

function ticketForm(
  fields: {
    content: string
    subject?: string
    category?: number
    priority?: number
  },
  files: File[]
): FormData {
  const form = new FormData()
  form.set('content', fields.content)
  if (fields.subject !== undefined) form.set('subject', fields.subject)
  if (fields.category !== undefined) {
    form.set('category', String(fields.category))
  }
  if (fields.priority !== undefined) {
    form.set('priority', String(fields.priority))
  }
  for (const file of files) {
    form.append('files', file)
  }
  return form
}

export async function createTicket(payload: {
  subject: string
  category: number
  priority: number
  content: string
  files: File[]
}): Promise<Result<Ticket>> {
  const res = await api.post('/api/ticket/', ticketForm(payload, payload.files))
  return res.data
}

export async function replyToTicket(
  id: number,
  payload: { content: string; files: File[] }
): Promise<Result<Ticket>> {
  const res = await api.post(
    `/api/ticket/${id}/messages`,
    ticketForm(payload, payload.files)
  )
  return res.data
}

export async function updateTicket(
  id: number,
  patch: {
    status?: number
    category?: number
    priority?: number
    assignee_id?: number
  }
): Promise<Result<TicketUpdateResult>> {
  const res = await api.put(`/api/ticket/${id}`, patch)
  return res.data
}

/**
 * A screenshot is fetched through the shared client, not an `<img src>`: the
 * request needs the dashboard credentials and the current environment.
 */
export async function getTicketAttachment(
  id: number,
  signal?: AbortSignal
): Promise<Blob> {
  const response = await api.get<Blob>(`/api/ticket-attachment/${id}`, {
    responseType: 'blob',
    signal,
    disableDuplicate: true,
    skipErrorHandler: true,
  })
  return response.data
}
