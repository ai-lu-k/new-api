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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { RichContent } from '@/components/rich-content'
import { Skeleton } from '@/components/ui/skeleton'
import { isHttpUrl, isLikelyHtml } from '@/lib/content-format'
import { requireServerSuccess } from '@/lib/server-error-message'
import { textActionClass } from '@/lib/text-action'
import { cn } from '@/lib/utils'

import { getAboutContent } from './api'

/** The shared text action, held to the 140ms micro step of the motion scale. */
const LINK_CLASS = cn(textActionClass, 'duration-(--motion-fast)')

function EmptyAboutState() {
  const { t } = useTranslation()
  const currentYear = new Date().getFullYear()

  return (
    <div className='w-full max-w-[720px] py-6'>
      <div className='space-y-6'>
        <div className='space-y-1.5'>
          <h2 className='text-xl leading-[1.15] font-semibold tracking-tight'>
            {t('No About Content Set')}
          </h2>
          <p className='text-muted-foreground text-sm'>
            {t(
              'The administrator has not configured any about content yet. You can set it in the settings page, supporting HTML or URL.'
            )}
          </p>
        </div>
        <div className='space-y-3 text-sm'>
          <p>
            {t('New API Project Repository:')}{' '}
            <a
              href='https://github.com/QuantumNous/new-api'
              target='_blank'
              rel='noopener noreferrer'
              className={LINK_CLASS}
            >
              {t('https://github.com/QuantumNous/new-api')}
            </a>
          </p>
          <p className='text-muted-foreground'>
            <a
              href='https://github.com/QuantumNous/new-api'
              target='_blank'
              rel='noopener noreferrer'
              className={LINK_CLASS}
            >
              {t('NewAPI')}
            </a>{' '}
            © {currentYear}{' '}
            <a
              href='https://github.com/QuantumNous'
              target='_blank'
              rel='noopener noreferrer'
              className={LINK_CLASS}
            >
              {t('QuantumNous')}
            </a>{' '}
            {t('| Based on')}{' '}
            <a
              href='https://github.com/songquanpeng/one-api'
              target='_blank'
              rel='noopener noreferrer'
              className={LINK_CLASS}
            >
              {t('One API')}
            </a>{' '}
            © 2023{' '}
            <a
              href='https://github.com/songquanpeng'
              target='_blank'
              rel='noopener noreferrer'
              className={LINK_CLASS}
            >
              {t('JustSong')}
            </a>
          </p>
          <p className='text-muted-foreground'>
            {t('This project must be used in compliance with the')}{' '}
            <a
              href='https://github.com/QuantumNous/new-api/blob/main/LICENSE'
              target='_blank'
              rel='noopener noreferrer'
              className={LINK_CLASS}
            >
              {t('AGPL v3.0 License')}
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * The About content the administrator stored: a URL, HTML or Markdown. It
 * brings no page layout of its own, so that a page can show it as a section.
 */
export function AboutContent() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['about-content'],
    queryFn: async () => requireServerSuccess(await getAboutContent()),
  })

  // The endpoint returns a string; anything else (an unexpected payload or a
  // stub) renders as empty instead of taking the page down.
  const rawContent = typeof data?.data === 'string' ? data.data.trim() : ''

  if (isLoading) {
    return (
      <div className='flex w-full flex-col gap-4'>
        <Skeleton className='h-8 w-[45%]' />
        <Skeleton className='h-4 w-full' />
        <Skeleton className='h-4 w-[90%]' />
        <Skeleton className='h-4 w-[80%]' />
      </div>
    )
  }

  if (rawContent.length === 0) {
    return <EmptyAboutState />
  }

  if (isHttpUrl(rawContent)) {
    return (
      <iframe
        src={rawContent}
        className='h-[70vh] w-full rounded-xl border'
        title={t('About')}
        sandbox='allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts'
      />
    )
  }

  if (isLikelyHtml(rawContent)) {
    return (
      <RichContent
        mode='html'
        htmlVariant='isolated'
        content={rawContent}
        className='w-full'
      />
    )
  }

  return (
    <RichContent
      mode='markdown'
      content={rawContent}
      className='prose-neutral dark:prose-invert w-full max-w-none'
    />
  )
}
