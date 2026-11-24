import { useQueryClient } from '@tanstack/react-query'
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
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import { createTicket } from '../api'
import {
  TICKET_MAX_CONTENT,
  TICKET_MAX_SUBJECT,
  TICKET_MIN_CONTENT,
  TICKET_MIN_SUBJECT,
} from '../constants'
import { useTicketFiles } from '../hooks/use-ticket-files'
import { TICKET_CATEGORY, TICKET_PRIORITY, type Ticket } from '../types'
import { TicketFilePicker } from './ticket-file-picker'
import { TicketCategorySelect, TicketPrioritySelect } from './ticket-selects'

type TicketCreateDialogProps = {
  onClose: () => void
  onCreated: (ticket: Ticket) => void
}

type TicketFormErrors = { subject?: string; content?: string }

/** A user opens a ticket: one subject, a category, a priority, a description. */
export function TicketCreateDialog(props: TicketCreateDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState<number>(TICKET_CATEGORY.CHANNEL)
  const [priority, setPriority] = useState<number>(TICKET_PRIORITY.NORMAL)
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [errors, setErrors] = useState<TicketFormErrors>({})
  const subjectRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const ticketFiles = useTicketFiles(files, setFiles)

  const submit = async () => {
    const trimmedSubject = subject.trim()
    const trimmedContent = content.trim()
    // The two required fields carry their own message and take the focus, so
    // the submit never ends in a toast the fields do not explain.
    if (trimmedSubject.length < TICKET_MIN_SUBJECT) {
      setErrors({ subject: t('Give the ticket a short subject.') })
      subjectRef.current?.focus()
      return
    }
    if (trimmedContent.length < TICKET_MIN_CONTENT) {
      setErrors({
        content: t('Write a few more words so we can understand the problem.'),
      })
      contentRef.current?.focus()
      return
    }
    setErrors({})
    setSending(true)
    try {
      const result = await createTicket({
        subject: trimmedSubject,
        category,
        priority,
        content: trimmedContent,
        files,
      })
      if (!result.success || !result.data) {
        handleServerError(result, t('Could not create the ticket'))
        return
      }
      toast.success(t('Your ticket is open.'))
      await queryClient.invalidateQueries({ queryKey: ['ticket'] })
      props.onCreated(result.data)
    } catch (error: unknown) {
      handleServerError(error, t('Could not create the ticket'))
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={t('New ticket')}
      description={t(
        'The administrators answer here, and the whole thread stays on this page.'
      )}
      contentClassName='sm:max-w-xl'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button variant='outline' onClick={props.onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={sending}>
            {sending ? t('Sending...') : t('Open ticket')}
          </Button>
        </>
      }
    >
      <div className='space-y-4' onPaste={ticketFiles.paste}>
        <div className='space-y-2'>
          <Label htmlFor='ticket-subject'>{t('Subject')}</Label>
          <Input
            ref={subjectRef}
            id='ticket-subject'
            maxLength={TICKET_MAX_SUBJECT}
            placeholder={t('Channel errors, a charge that looks wrong…')}
            value={subject}
            aria-invalid={Boolean(errors.subject)}
            aria-describedby={
              errors.subject ? 'ticket-subject-error' : undefined
            }
            onChange={(event) => {
              setSubject(event.target.value)
              if (errors.subject) {
                setErrors((prev) => ({ ...prev, subject: undefined }))
              }
            }}
          />
          {errors.subject ? (
            <FieldError id='ticket-subject-error'>{errors.subject}</FieldError>
          ) : null}
        </div>
        <div className='grid gap-3 sm:grid-cols-2'>
          <div className='space-y-2'>
            <Label htmlFor='ticket-category'>{t('Category')}</Label>
            <TicketCategorySelect
              id='ticket-category'
              label={t('Category')}
              value={category}
              onChange={setCategory}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='ticket-priority'>{t('Priority')}</Label>
            <TicketPrioritySelect
              id='ticket-priority'
              label={t('Priority')}
              value={priority}
              onChange={setPriority}
            />
          </div>
        </div>
        <div className='space-y-2'>
          <Label htmlFor='ticket-content'>{t('What happened?')}</Label>
          <Textarea
            ref={contentRef}
            id='ticket-content'
            rows={6}
            maxLength={TICKET_MAX_CONTENT}
            placeholder={t(
              'What you did, what you expected, and any error id or model name.'
            )}
            value={content}
            aria-invalid={Boolean(errors.content)}
            aria-describedby={
              errors.content ? 'ticket-content-error' : undefined
            }
            onChange={(event) => {
              setContent(event.target.value)
              if (errors.content) {
                setErrors((prev) => ({ ...prev, content: undefined }))
              }
            }}
          />
          {errors.content ? (
            <FieldError id='ticket-content-error'>{errors.content}</FieldError>
          ) : null}
        </div>
        <TicketFilePicker
          id='ticket-create-files'
          files={files}
          onAdd={ticketFiles.add}
          onRemove={ticketFiles.remove}
          atLimit={ticketFiles.atLimit}
          disabled={sending}
        />
      </div>
    </Dialog>
  )
}
