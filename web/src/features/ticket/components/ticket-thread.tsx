import type { TFunction } from 'i18next'
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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { formatTimestampToDate } from '@/lib/format'

import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from '../constants'
import {
  TICKET_AUTHOR,
  TICKET_EVENT,
  type TicketEvent,
  type TicketMessage,
} from '../types'
import { TicketAttachmentImage } from './ticket-attachment-image'

type ThreadEntry =
  | { kind: 'message'; id: number; at: number; message: TicketMessage }
  | { kind: 'event'; id: number; at: number; event: TicketEvent }

function describeEvent(event: TicketEvent, t: TFunction): string | null {
  const actor = event.actor_name || t('An administrator')
  if (event.kind === TICKET_EVENT.STATUS) {
    const from = TICKET_STATUS_LABELS[Number(event.from_value)]
    const to = TICKET_STATUS_LABELS[Number(event.to_value)]
    if (!to) return null
    return from
      ? t('{{actor}} changed the status from {{from}} to {{to}}', {
          actor,
          from: t(from),
          to: t(to),
        })
      : t('{{actor}} changed the status to {{to}}', { actor, to: t(to) })
  }
  if (event.kind === TICKET_EVENT.PRIORITY) {
    const to = TICKET_PRIORITY_LABELS[Number(event.to_value)]
    return to
      ? t('{{actor}} changed the priority to {{to}}', { actor, to: t(to) })
      : null
  }
  if (event.kind === TICKET_EVENT.CATEGORY) {
    const to = TICKET_CATEGORY_LABELS[Number(event.to_value)]
    return to
      ? t('{{actor}} changed the category to {{to}}', { actor, to: t(to) })
      : null
  }
  if (event.kind === TICKET_EVENT.ASSIGNEE) {
    if (!event.to_value) return t('{{actor}} cleared the assignee', { actor })
    return t('{{actor}} assigned this ticket to {{to}}', {
      actor,
      to: event.to_value,
    })
  }
  return null
}

/** The whole conversation, with the administrator changes in between. */
export function TicketThread(props: {
  messages?: TicketMessage[]
  events?: TicketEvent[]
}) {
  const { t } = useTranslation()
  const entries = useMemo(() => {
    // A partial payload must not take the thread down: an older response
    // without events still shows the conversation.
    const messages = props.messages ?? []
    const events = props.events ?? []
    const merged: ThreadEntry[] = [
      ...messages.map((message) => ({
        kind: 'message' as const,
        id: message.id,
        at: message.created_at,
        message,
      })),
      ...events.map((event) => ({
        kind: 'event' as const,
        id: event.id,
        at: event.created_at,
        event,
      })),
    ]
    return merged.sort((a, b) => (a.at === b.at ? a.id - b.id : a.at - b.at))
  }, [props.messages, props.events])

  return (
    <ol className='space-y-3'>
      {entries.map((entry) => {
        if (entry.kind === 'event') {
          const text = describeEvent(entry.event, t)
          if (!text) return null
          return (
            <li
              key={`event-${entry.id}`}
              className='text-muted-foreground flex flex-wrap items-baseline gap-x-1.5 text-xs'
            >
              <span>{text}</span>
              <span aria-hidden='true'>·</span>
              <span>{formatTimestampToDate(entry.event.created_at)}</span>
            </li>
          )
        }
        const message = entry.message
        // A message without screenshots is stored empty; keeping that tolerant
        // means one attachment-free message cannot take the page down.
        const attachments = message.attachments ?? []
        const fromAdministrator = message.author_role === TICKET_AUTHOR.ADMIN
        return (
          <li
            key={`message-${entry.id}`}
            className={
              fromAdministrator
                ? 'bg-muted/50 space-y-1.5 rounded-lg px-3 py-2'
                : 'space-y-1.5'
            }
          >
            <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-xs'>
              <span className='text-foreground font-medium'>
                {message.author_name ||
                  (fromAdministrator ? t('An administrator') : t('You'))}
              </span>
              {fromAdministrator && (
                <Badge variant='secondary' className='h-4 px-1.5 text-[10px]'>
                  {t('Administrator')}
                </Badge>
              )}
              <span className='text-muted-foreground'>
                {formatTimestampToDate(message.created_at)}
              </span>
            </div>
            <p className='text-sm break-words whitespace-pre-wrap'>
              {message.content}
            </p>
            {attachments.length > 0 && (
              <div className='flex flex-wrap gap-2'>
                {attachments.map((attachment) => (
                  <TicketAttachmentImage
                    key={attachment.id}
                    attachment={attachment}
                  />
                ))}
              </div>
            )}
          </li>
        )
      })}
      {entries.length === 0 && (
        <li className='text-muted-foreground text-sm'>
          {t('No messages yet.')}
        </li>
      )}
    </ol>
  )
}
