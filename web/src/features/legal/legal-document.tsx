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

import { PublicLayout } from '@/components/layout'
import { RichContent } from '@/components/rich-content'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { isHttpUrl, isLikelyHtml } from '@/lib/content-format'

import { legalLanguage } from './api'
import type { LegalDocumentResponse } from './types'

type LegalDocumentProps = {
  title: string
  queryKey: string
  fetchDocument: () => Promise<LegalDocumentResponse>
  emptyMessage: string
}

export function LegalDocument({
  title,
  queryKey,
  fetchDocument,
  emptyMessage,
}: LegalDocumentProps) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: [
      queryKey,
      new URLSearchParams(window.location.search).get('version'),
      // The document is served in the interface language, so switching it
      // must fetch the other language instead of showing the cached one.
      legalLanguage(),
    ],
    queryFn: fetchDocument,
    staleTime: 10 * 60 * 1000,
  })

  // The endpoint returns a string; anything else (an unexpected payload or a
  // stub) renders as empty instead of taking the page down.
  const rawContent = typeof data?.data === 'string' ? data.data.trim() : ''
  const hasContent = rawContent.length > 0
  const isUrl = hasContent && isHttpUrl(rawContent)
  const contentIsHtml = hasContent && isLikelyHtml(rawContent)
  const success = data?.success ?? false

  if (isLoading) {
    return (
      <PublicLayout>
        <div className='mx-auto flex w-full max-w-[880px] flex-col gap-4 py-12'>
          <Skeleton className='h-8 w-[45%]' />
          <Skeleton className='h-4 w-full' />
          <Skeleton className='h-4 w-[90%]' />
          <Skeleton className='h-4 w-[80%]' />
        </div>
      </PublicLayout>
    )
  }

  if (!success || !hasContent) {
    // Same page frame as a published document: the title stays an h1 so the
    // document reads as one page, and the explanation is a single quiet line.
    return (
      <PublicLayout>
        <div className='mx-auto w-full max-w-[880px] py-12'>
          <div className='border-foreground border-b pb-4'>
            <h1 className='text-2xl leading-[1.15] font-bold tracking-tight sm:text-[32px]'>
              {title}
            </h1>
          </div>
          <p className='text-muted-foreground mt-6 text-[13px] leading-snug'>
            {data?.message || emptyMessage}
          </p>
        </div>
      </PublicLayout>
    )
  }

  if (isUrl) {
    return (
      <PublicLayout>
        <div className='mx-auto max-w-2xl py-12'>
          <Card>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <p className='text-muted-foreground text-sm'>
                {t(
                  'The administrator configured an external link for this document.'
                )}
              </p>
              <Button
                render={
                  <a
                    href={rawContent}
                    target='_blank'
                    rel='noopener noreferrer'
                  />
                }
              >
                {t('View document')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout showMainContainer={!contentIsHtml}>
      {contentIsHtml ? (
        <RichContent mode='html' htmlVariant='isolated' content={rawContent} />
      ) : (
        <div className='mx-auto w-full max-w-[880px] space-y-6 py-12'>
          <div className='border-foreground border-b pb-4'>
            <h1 className='text-2xl leading-[1.15] font-bold tracking-tight sm:text-[32px]'>
              {title}
            </h1>
          </div>

          <RichContent
            mode='markdown'
            content={rawContent}
            className='prose-neutral dark:prose-invert max-w-none'
          />
        </div>
      )}
    </PublicLayout>
  )
}
