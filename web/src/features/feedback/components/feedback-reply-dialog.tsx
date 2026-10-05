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
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import { updateFeedback } from '../api'
import { FEEDBACK_STATUS, type Feedback } from '../types'

type FeedbackReplyDialogProps = {
  feedback: Feedback
  onClose: () => void
}

/** An administrator answers a message and marks it handled or open. */
export function FeedbackReplyDialog(props: FeedbackReplyDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [reply, setReply] = useState(props.feedback.reply)
  const [saving, setSaving] = useState(false)
  const anonymous = props.feedback.user_id === 0

  const save = async (status: number) => {
    setSaving(true)
    try {
      const result = await updateFeedback(props.feedback.id, {
        status,
        reply: reply.trim(),
      })
      if (!result.success) {
        handleServerError(result, t('Save failed'))
        return
      }
      toast.success(t('Saved successfully'))
      await queryClient.invalidateQueries({ queryKey: ['feedback'] })
      props.onClose()
    } catch (e: unknown) {
      handleServerError(e, t('Save failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={t('Handle message')}
      description={
        anonymous
          ? t(
              'This message is anonymous: its author will not see a reply. Use the contact details, if any were left.'
            )
          : t('The author sees your reply on their feedback page.')
      }
      contentHeight='auto'
      contentClassName='sm:max-w-xl'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button variant='outline' onClick={props.onClose}>
            {t('Cancel')}
          </Button>
          <Button
            variant='outline'
            disabled={saving}
            onClick={() => save(FEEDBACK_STATUS.OPEN)}
          >
            {t('Save, keep open')}
          </Button>
          <Button
            disabled={saving}
            onClick={() => save(FEEDBACK_STATUS.RESOLVED)}
          >
            {t('Save and mark handled')}
          </Button>
        </>
      }
    >
      <p className='bg-muted/60 rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap'>
        {props.feedback.content}
      </p>
      <div className='space-y-2'>
        <Label htmlFor='feedback-reply'>{t('Reply (optional)')}</Label>
        <Textarea
          id='feedback-reply'
          rows={4}
          maxLength={2000}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
      </div>
    </Dialog>
  )
}
