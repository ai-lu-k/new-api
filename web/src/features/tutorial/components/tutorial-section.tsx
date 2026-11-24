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

import { SectionHeading } from '@/components/section-heading'

/**
 * The reading rhythm of a section body: one step down from the heading, 14px
 * with a 1.75 line height, and no decoration between blocks. Everything the
 * sections write is styled from here, so the copy stays free of class names.
 */
const SECTION_BODY_CLASS = [
  '[&>p]:mt-3.5 [&>p]:text-sm [&>p]:leading-[1.75]',
  '[&>h3]:mt-8 [&>h3]:text-base [&>h3]:leading-[1.45] [&>h3]:font-semibold',
  '[&>h3+p]:mt-2.5',
].join(' ')

export type TutorialSectionProps = {
  /** The deep-link anchor of this section. */
  id: string
  /** The printed number, e.g. `01`. */
  number: string
  title: string
  children: ReactNode
}

export function TutorialSection(props: TutorialSectionProps) {
  return (
    <section id={props.id} className='scroll-mt-24'>
      <SectionHeading
        as='h2'
        // A heading that wraps keeps its marker on the first line, as the
        // narrow layout draws it; only from the two-column width does the
        // marker centre itself against the whole line.
        className='items-start lg:items-center'
        titleClassName='items-start lg:items-center'
        title={
          <>
            <span className='text-muted-foreground mr-2.5 font-mono text-[11px] font-normal'>
              {props.number}
            </span>
            {props.title}
          </>
        }
      />
      <div className={SECTION_BODY_CLASS}>{props.children}</div>
    </section>
  )
}
