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
import type { ReactNode } from 'react'

import { ErrorState } from '@/components/error-state'
import { SectionHeading } from '@/components/section-heading'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export type SectionPanelStatus = 'ready' | 'loading' | 'empty' | 'error'

export type SectionPanelProps = {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** 'section' opens a top-level block; 'card' heads a nested panel. */
  level?: 'section' | 'card'
  /** Heading element; top-level blocks sit under the page h1. */
  headingAs?: 'h2' | 'h3'
  status?: SectionPanelStatus
  /** Shown instead of the body when `status` is 'empty'. */
  emptyMessage?: string
  /** Optional follow-up action for the empty body. */
  emptyAction?: ReactNode
  /** Shown under the error title when `status` is 'error'. */
  errorMessage?: string
  onRetry?: () => void
  /** Height kept by the skeleton so the block does not jump while loading. */
  placeholderClassName?: string
  className?: string
  headerClassName?: string
  contentClassName?: string
  children?: ReactNode
}

/**
 * One block of a page: a hairline black rule, the shared heading and its
 * actions, then the body. Loading, empty and failed bodies are handled here so
 * every block reserves the same space and offers a retry instead of leaving a
 * blank gap. Callers pass translated copy.
 */
export function SectionPanel(props: SectionPanelProps) {
  const status = props.status ?? 'ready'
  let body: ReactNode = props.children

  if (status === 'loading') {
    body = (
      <Skeleton
        className={cn('h-24 w-full', props.placeholderClassName)}
        aria-hidden='true'
      />
    )
  } else if (status === 'empty') {
    // A quiet line of copy: an illustration would add noise to a monochrome
    // page and make the block taller than its neighbours.
    body = (
      <div className='flex flex-wrap items-center gap-3 py-6'>
        <p className='text-muted-foreground text-[13px] leading-snug'>
          {props.emptyMessage}
        </p>
        {props.emptyAction}
      </div>
    )
  } else if (status === 'error') {
    body = (
      <ErrorState
        description={props.errorMessage}
        onRetry={props.onRetry}
        action={props.emptyAction}
        className='min-h-0'
      />
    )
  }

  return (
    <section
      data-slot='section-panel'
      className={cn(
        'border-t-foreground flex min-w-0 flex-col border-t',
        props.className
      )}
    >
      <div className={cn('py-3', props.headerClassName)}>
        <SectionHeading
          as={props.headingAs}
          title={props.title}
          description={props.description}
          actions={props.actions}
          level={props.level ?? 'section'}
        />
      </div>
      <div className={cn('min-w-0 flex-1', props.contentClassName)}>{body}</div>
    </section>
  )
}
