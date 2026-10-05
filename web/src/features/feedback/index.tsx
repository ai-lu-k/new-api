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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ROLE } from '@/lib/roles'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { getAllFeedback, getOwnFeedback } from './api'
import { FeedbackForm } from './components/feedback-form'
import { FeedbackItem } from './components/feedback-item'
import { FeedbackReplyDialog } from './components/feedback-reply-dialog'
import { FEEDBACK_STATUS, type Feedback } from './types'

/**
 * The feedback page of the console: anyone signed in writes to the
 * administrators and reads the replies; administrators also get the inbox.
 */
export function FeedbackPage() {
  const { t } = useTranslation()
  const isAdmin = useAuthStore(
    (state) => (state.auth.user?.role ?? 0) >= ROLE.ADMIN
  )

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Feedback')}</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t(
          'Tell us what is broken, missing or awkward. Only the site administrators read these messages.'
        )}
      </SectionPageLayout.Description>
      <SectionPageLayout.Content>
        <div className='max-w-3xl space-y-8'>
          {isAdmin && <Inbox />}
          <FeedbackForm />
          <OwnMessages />
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

function OwnMessages() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['feedback', 'own'],
    queryFn: async () => requireServerSuccess(await getOwnFeedback()),
  })
  const items = query.data?.data ?? []
  if (query.isLoading || items.length === 0) return null

  return (
    <section aria-label={t('My messages')} className='space-y-3'>
      <h2 className='text-base font-semibold'>{t('My messages')}</h2>
      <ul className='bg-card divide-y overflow-hidden rounded-xl border'>
        {items.map((item) => (
          <FeedbackItem key={item.id} feedback={item} />
        ))}
      </ul>
    </section>
  )
}

function Inbox() {
  const { t } = useTranslation()
  const [onlyOpen, setOnlyOpen] = useState(true)
  const [replying, setReplying] = useState<Feedback | null>(null)
  const status = onlyOpen ? FEEDBACK_STATUS.OPEN : 0
  const query = useQuery({
    queryKey: ['feedback', 'all', status],
    queryFn: async () => requireServerSuccess(await getAllFeedback(status)),
  })
  const items = query.data?.data?.items ?? []
  const open = query.data?.open ?? 0

  return (
    <section aria-label={t('Messages from users')} className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <h2 className='text-base font-semibold'>
          {t('Messages from users')}
          <span className='text-muted-foreground ms-2 text-sm font-normal'>
            {t('{{count}} awaiting reply', { count: open })}
          </span>
        </h2>
        <div className='bg-muted inline-flex rounded-lg p-1'>
          {[true, false].map((value) => (
            <button
              key={String(value)}
              type='button'
              aria-pressed={onlyOpen === value}
              onClick={() => setOnlyOpen(value)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                onlyOpen === value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {value ? t('Awaiting reply') : t('All')}
            </button>
          ))}
        </div>
      </div>

      {query.isLoading && <Skeleton className='h-32 w-full rounded-xl' />}
      {!query.isLoading && items.length === 0 && (
        <div className='bg-card rounded-xl border border-dashed px-6 py-10 text-center'>
          <p className='text-muted-foreground text-sm'>
            {t('No messages here.')}
          </p>
        </div>
      )}
      {items.length > 0 && (
        <ul className='bg-card divide-y overflow-hidden rounded-xl border'>
          {items.map((item) => (
            <FeedbackItem
              key={item.id}
              feedback={item}
              showAuthor
              actions={
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setReplying(item)}
                >
                  {t('Handle')}
                </Button>
              }
            />
          ))}
        </ul>
      )}

      {replying && (
        <FeedbackReplyDialog
          key={replying.id}
          feedback={replying}
          onClose={() => setReplying(null)}
        />
      )}
    </section>
  )
}
