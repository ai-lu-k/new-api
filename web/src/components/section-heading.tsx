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

import { cn } from '@/lib/utils'

export type SectionHeadingProps = {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  as?: 'h2' | 'h3'
  /** 'section' opens a top-level block; 'card' heads a nested panel. */
  level?: 'section' | 'card'
  className?: string
  titleClassName?: string
  /**
   * Page-unique key for the red marker square. Pass one key per block when a
   * page has several blocks, so the marker keeps its identity across a
   * navigation (`section-marker-<key>`). Omit it for blocks that should not
   * take part in the page transition — a duplicated name would break the
   * whole group.
   */
  vtKey?: string
}

/**
 * One block heading: the red marker square, the title, an optional line of
 * context, and the trailing action. Every block on a page uses it, so headings
 * keep the same marker, size and left edge instead of being hand-built per
 * panel.
 */
export function SectionHeading(props: SectionHeadingProps) {
  const Heading = props.as ?? 'h3'

  return (
    <div
      data-slot='section-heading'
      className={cn(
        'flex min-w-0 items-center justify-between gap-3',
        props.className
      )}
    >
      <div className='min-w-0'>
        <Heading
          className={cn(
            props.level === 'card'
              ? 'text-base font-semibold'
              : 'section-title text-xl font-bold',
            props.titleClassName
          )}
        >
          {props.level !== 'card' && (
            <span
              aria-hidden='true'
              data-slot='section-marker'
              data-vt-name={
                props.vtKey ? `section-marker-${props.vtKey}` : undefined
              }
              style={
                props.vtKey
                  ? { viewTransitionName: `section-marker-${props.vtKey}` }
                  : undefined
              }
            />
          )}
          {props.title}
        </Heading>
        {props.description != null && (
          <p className='text-muted-foreground mt-1 text-xs'>
            {props.description}
          </p>
        )}
      </div>
      {props.actions != null && (
        <div className='flex shrink-0 items-center'>{props.actions}</div>
      )}
    </div>
  )
}
