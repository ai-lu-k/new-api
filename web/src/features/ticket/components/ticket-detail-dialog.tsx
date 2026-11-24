import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { useSharedName } from '@/components/motion/use-shared-name'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { formatTimestampToDate } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  getTicketAssignees,
  getTicketDetail,
  replyToTicket,
  updateTicket,
} from '../api'
import { TICKET_MAX_CONTENT, TICKET_MIN_CONTENT } from '../constants'
import { useTicketFiles } from '../hooks/use-ticket-files'
import { ticketSharedName } from '../lib/shared-name'
import { TICKET_STATUS } from '../types'
import { TicketAdminControls, type TicketPatch } from './ticket-admin-controls'
import { TicketCategoryLabel, TicketStatusBadge } from './ticket-badges'
import { TicketFilePicker } from './ticket-file-picker'
import { TicketThread } from './ticket-thread'

type TicketDetailDialogProps = {
  ticketId: number
  isAdmin: boolean
  onClose: () => void
}

/** One ticket: the conversation, and the controls of its owner or an
 * administrator. */
export function TicketDetailDialog(props: TicketDetailDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['ticket', 'detail', props.ticketId],
    queryFn: async () =>
      requireServerSuccess(await getTicketDetail(props.ticketId)),
  })
  const assigneesQuery = useQuery({
    queryKey: ['ticket', 'assignees'],
    queryFn: async () => requireServerSuccess(await getTicketAssignees()),
    enabled: props.isAdmin,
  })
  const assignees = assigneesQuery.data?.data ?? []
  const detail = query.data?.data
  const [reply, setReply] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const ticketFiles = useTicketFiles(files, setFiles)
  // This dialog holds the row's name while it is open (see TicketSharedSubject).
  const subjectName = useSharedName(ticketSharedName(props.ticketId))

  const send = async () => {
    const content = reply.trim()
    if (content.length < TICKET_MIN_CONTENT) {
      toast.error(t('Write a few more words so we can understand the problem.'))
      return
    }
    setSending(true)
    try {
      const result = await replyToTicket(props.ticketId, { content, files })
      if (!result.success) {
        handleServerError(result, t('Could not send your message'))
        return
      }
      setReply('')
      setFiles([])
      await queryClient.invalidateQueries({ queryKey: ['ticket'] })
    } catch (error: unknown) {
      handleServerError(error, t('Could not send your message'))
    } finally {
      setSending(false)
    }
  }

  const change = async (patch: TicketPatch) => {
    setSaving(true)
    try {
      const result = await updateTicket(props.ticketId, patch)
      if (!result.success) {
        handleServerError(result, t('Save failed'))
        return
      }
      toast.success(t('Saved successfully'))
      await queryClient.invalidateQueries({ queryKey: ['ticket'] })
    } catch (error: unknown) {
      handleServerError(error, t('Save failed'))
    } finally {
      setSaving(false)
    }
  }

  const ticket = detail?.ticket
  const closed = ticket?.status === TICKET_STATUS.CLOSED
  const assignee = ticket?.assignee_name
    ? t('Assigned to {{name}}', { name: ticket.assignee_name })
    : t('Unassigned')

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={
        <span className='flex flex-wrap items-center gap-2'>
          <span {...subjectName} data-shared-morph>
            {ticket?.subject ?? t('Ticket')}
          </span>
          {ticket && <TicketStatusBadge status={ticket.status} />}
        </span>
      }
      description={
        ticket ? (
          <span className='flex flex-wrap items-center gap-x-2 gap-y-1'>
            <span>#{ticket.id}</span>
            <span aria-hidden='true'>·</span>
            <TicketCategoryLabel category={ticket.category} />
            <span aria-hidden='true'>·</span>
            <span>{formatTimestampToDate(ticket.created_at)}</span>
            <span aria-hidden='true'>·</span>
            <span>{assignee}</span>
            {props.isAdmin && (
              <>
                <span aria-hidden='true'>·</span>
                <span>
                  {t('Opened by {{name}}', { name: ticket.username || '—' })}
                </span>
              </>
            )}
          </span>
        ) : null
      }
      contentHeight='48vh'
      contentClassName='sm:max-w-3xl'
      bodyClassName='space-y-4'
      footerClassName='sm:justify-start'
      footer={
        closed ? (
          <p className='text-muted-foreground text-sm'>
            {t('This ticket is closed and takes no new messages.')}
          </p>
        ) : (
          <div className='w-full space-y-2' onPaste={ticketFiles.paste}>
            <Textarea
              rows={3}
              maxLength={TICKET_MAX_CONTENT}
              aria-label={t('Reply')}
              placeholder={t('Add to the conversation')}
              value={reply}
              disabled={sending}
              onChange={(event) => setReply(event.target.value)}
            />
            <div className='flex flex-wrap items-start justify-between gap-2'>
              <TicketFilePicker
                id='ticket-reply-files'
                files={files}
                onAdd={ticketFiles.add}
                onRemove={ticketFiles.remove}
                atLimit={ticketFiles.atLimit}
                disabled={sending}
              />
              <Button onClick={send} disabled={sending}>
                {sending ? t('Sending...') : t('Send reply')}
              </Button>
            </div>
          </div>
        )
      }
    >
      {query.isLoading && (
        <div className='space-y-2'>
          <Skeleton className='h-6 w-40' />
          <Skeleton className='h-24 w-full' />
        </div>
      )}
      {query.isError && (
        <p className='text-muted-foreground text-sm'>
          {t('This ticket could not be loaded.')}
        </p>
      )}
      {detail && (
        <>
          {props.isAdmin && (
            <div className='border-b pb-3'>
              <TicketAdminControls
                ticket={detail.ticket}
                assignees={assignees}
                saving={saving}
                onChange={change}
              />
            </div>
          )}
          <TicketThread messages={detail.messages} events={detail.events} />
        </>
      )}
    </Dialog>
  )
}
