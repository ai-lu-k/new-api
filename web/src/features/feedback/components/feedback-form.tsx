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

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import { submitFeedback } from '../api'

const MIN_LENGTH = 5
const MAX_LENGTH = 2000

/** Where a signed-in user writes to the administrators, by name or not. */
export function FeedbackForm() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')
  const [contact, setContact] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [sending, setSending] = useState(false)

  const handleSubmit = async () => {
    const text = content.trim()
    if (text.length < MIN_LENGTH) {
      toast.error(t('Write a few more words so we can understand the problem.'))
      return
    }
    setSending(true)
    try {
      const result = await submitFeedback({
        content: text,
        ...(contact.trim() ? { contact: contact.trim() } : {}),
        anonymous,
      })
      if (!result.success) {
        handleServerError(result, t('Could not send your message'))
        return
      }
      toast.success(t('Thank you, your message has been sent.'))
      setContent('')
      setContact('')
      await queryClient.invalidateQueries({ queryKey: ['feedback'] })
    } catch (e: unknown) {
      handleServerError(e, t('Could not send your message'))
    } finally {
      setSending(false)
    }
  }

  return (
    <section className='bg-card space-y-4 rounded-xl border px-5 py-5'>
      <div className='space-y-2'>
        <Label htmlFor='feedback-content'>{t('Your message')}</Label>
        <Textarea
          id='feedback-content'
          rows={5}
          maxLength={MAX_LENGTH}
          placeholder={t(
            'A problem you ran into, a model you would like, something that is hard to use…'
          )}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='feedback-contact'>{t('Contact (optional)')}</Label>
        <Input
          id='feedback-contact'
          maxLength={120}
          placeholder={t('QQ, email or anything else we can reach you at')}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
      </div>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <label className='flex items-start gap-2 text-sm'>
          <Checkbox
            className='mt-0.5'
            checked={anonymous}
            onCheckedChange={(checked) => setAnonymous(checked === true)}
          />
          <span>
            {t('Send anonymously')}
            <span className='text-muted-foreground block text-xs'>
              {t(
                'Your account is not recorded with the message, so a reply cannot be shown to you here.'
              )}
            </span>
          </span>
        </label>
        <Button onClick={handleSubmit} disabled={sending}>
          {sending ? t('Sending...') : t('Send message')}
        </Button>
      </div>
    </section>
  )
}
