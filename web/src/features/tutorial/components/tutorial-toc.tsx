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
import { motion, useReducedMotion } from 'motion/react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MOTION_SHIFT, MOTION_TRANSITION } from '@/lib/motion'
import { cn } from '@/lib/utils'

import { useTocIndicator } from '../hooks/use-toc-indicator'
import type { TutorialStep } from '../types'
import { TutorialFeedbackEntry } from './tutorial-feedback'
import { TutorialSearch } from './tutorial-search'
import { TutorialTocIndicator } from './tutorial-toc-indicator'

export type TutorialTocProps = {
  steps: TutorialStep[]
  /** The section the reader is in; marked with the red square and bold type. */
  activeId: string
}

/**
 * The contents of a long page: 240px of sticky navigation next to the text.
 * No frame and no rule down the side — size and spacing already separate it
 * from the body, and a rule there would fight the section headings.
 */
export function TutorialToc(props: TutorialTocProps) {
  const { t } = useTranslation()
  const listRef = useRef<HTMLOListElement>(null)
  const indicator = useTocIndicator(listRef, props.activeId)

  return (
    <nav
      aria-label={t('Tutorial contents')}
      className='sticky top-20 hidden lg:block'
    >
      <p className='text-muted-foreground text-[11px] leading-[1.4] tracking-[0.08em]'>
        {t('Contents')}
      </p>
      <TutorialSearch steps={props.steps} className='mt-2.5' />
      <ol ref={listRef} className='border-border relative mt-3 border-t'>
        {/* One mark for the whole list: it travels between entries instead of
            each line turning its own square on and off. */}
        <TutorialTocIndicator indicator={indicator} />
        {props.steps.map((step) => {
          const active = props.activeId === step.id
          return (
            <li key={step.id}>
              <a
                href={`#${step.id}`}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'grid grid-cols-[12px_18px_minmax(0,1fr)] items-start gap-x-1.5 py-2 text-[12.5px] leading-[1.55] transition-colors duration-(--motion-fast)',
                  active
                    ? 'text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {/* Keeps the 12px column so the entries never shift; the
                    square itself is the shared indicator above. */}
                <span aria-hidden='true' className='mt-[3px] size-3' />
                <span className='font-mono text-[11px] leading-[1.6]'>
                  {step.number}
                </span>
                <span>{step.title}</span>
              </a>
            </li>
          )
        })}
      </ol>
      <p className='border-border text-muted-foreground mt-4 border-t pt-2.5 text-[11px] leading-[1.6]'>
        {t('{{count}} sections · Updated {{month}}', {
          count: props.steps.length,
          month: '2026-11',
        })}
      </p>
      <TutorialFeedbackEntry className='border-border mt-3 border-t pt-2.5' />
    </nav>
  )
}

/**
 * The same contents on a phone: folded into a `<details>` above the text, so
 * the first section stays the first thing under the hero. It starts closed —
 * a reader who wants the outline opens it, everyone else starts reading.
 */
export function TutorialMobileToc(props: TutorialTocProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const shouldReduce = useReducedMotion()
  // The browser shows the list the moment it opens; the fold is the list
  // arriving from its closed position (220ms), not the box growing.
  const fold = {
    initial: false,
    animate: expanded
      ? { opacity: 1, y: 0 }
      : { opacity: 0.65, y: MOTION_SHIFT.control },
    transition: MOTION_TRANSITION.base,
  }
  const list = (
    <ol className='mt-2 pb-1.5'>
      {props.steps.map((step) => (
        <li key={step.id}>
          <a
            href={`#${step.id}`}
            aria-current={props.activeId === step.id ? 'true' : undefined}
            onClick={() => {
              if (detailsRef.current) detailsRef.current.open = false
            }}
            className={cn(
              'flex gap-2 py-1.5 text-[12.5px] leading-[1.55] transition-colors duration-(--motion-fast)',
              props.activeId === step.id
                ? 'text-foreground font-semibold'
                : 'text-muted-foreground'
            )}
          >
            <span className='pt-px font-mono text-[11px]'>{step.number}</span>
            <span>{step.title}</span>
          </a>
        </li>
      ))}
    </ol>
  )

  return (
    <details
      ref={detailsRef}
      data-slot='tutorial-toc-mobile'
      className='border-t-foreground border-border border-t border-b pb-1 lg:hidden'
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className='flex cursor-pointer list-none items-baseline justify-between gap-3 py-2.5 text-[13px] leading-[1.6] font-semibold [&::-webkit-details-marker]:hidden'>
        <span>{t('Contents')}</span>
        <span
          aria-hidden='true'
          className='text-muted-foreground text-[11px] font-normal'
        >
          {expanded ? t('Collapse') : t('Expand')}
        </span>
      </summary>
      <TutorialSearch steps={props.steps} className='px-0.5 pb-1' />
      {shouldReduce ? list : <motion.div {...fold}>{list}</motion.div>}
    </details>
  )
}
