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
import type { ReactElement, ReactNode } from 'react'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface OverviewCardProps {
  label: string
  header: ReactNode
  children: ReactNode
  footer: { label: string; value: ReactNode }[] | ReactElement
  className?: string
  contentClassName?: string
  compact?: boolean
  layout?: 'account'
}

/** Shared overview shell with an optional compact body and custom footer. */
export function OverviewCard(props: OverviewCardProps) {
  return (
    <Card
      role='region'
      aria-label={props.label}
      className={cn(
        'grid min-w-0 grid-rows-[41px_100px_49px] gap-2 rounded-[10px] border px-5 py-4 ring-0',
        props.compact &&
          'h-60 grid-rows-[minmax(0,1fr)_44px] gap-0 rounded-xl p-0',
        props.layout === 'account' &&
          'h-60 grid-rows-[minmax(0,1fr)_60px] gap-0 rounded-xl p-0',
        props.className
      )}
    >
      {props.compact || props.layout === 'account' ? (
        <div
          className={cn(
            'grid min-h-0 min-w-0 grid-rows-[24px_minmax(0,1fr)] gap-2.5 p-4',
            props.layout === 'account' &&
              'grid-rows-[36px_minmax(0,1fr)] gap-3 pb-3',
            props.contentClassName
          )}
        >
          <div className='min-w-0'>{props.header}</div>
          <div className='min-h-0 min-w-0'>{props.children}</div>
        </div>
      ) : (
        <>
          <div className='min-w-0'>{props.header}</div>
          <div className='min-h-0 min-w-0'>{props.children}</div>
        </>
      )}
      {Array.isArray(props.footer) ? (
        <dl
          className={cn(
            'text-muted-foreground flex min-w-0 items-start justify-between gap-3 border-t pt-2',
            props.layout === 'account' &&
              'bg-muted/50 grid grid-cols-3 border-0 px-4 py-2.5'
          )}
        >
          {props.footer.map((item: { label: string; value: ReactNode }) => (
            <div key={item.label} className='min-w-0'>
              <dt
                className='h-4 truncate text-[11px] leading-4'
                title={item.label}
              >
                {item.label}
              </dt>
              <dd
                className={cn(
                  'h-6 truncate text-sm leading-6 font-medium tabular-nums',
                  props.layout === 'account' &&
                    'text-foreground mt-0.5 h-[22px] leading-[22px]'
                )}
              >
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        // A hairline closes the block; the summary text sits on the page like
        // every other line of tabular figures, so no grey band and no inset.
        <footer
          className={cn(
            'border-border mt-3 flex min-w-0 flex-col justify-center border-t pt-2.5',
            props.compact ? 'px-0' : 'px-4'
          )}
        >
          {props.footer}
        </footer>
      )}
    </Card>
  )
}
