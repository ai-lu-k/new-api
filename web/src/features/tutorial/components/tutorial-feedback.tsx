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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { textActionClass } from '@/lib/text-action'
import { cn } from '@/lib/utils'

const LINK_CLASS = cn(
  'decoration-border hover:decoration-foreground',
  textActionClass
)

/**
 * The way out of a page that cannot answer everything, kept beside the reader
 * instead of at the end of the text: whoever is stuck halfway down is the one
 * who needs it, and they would never reach a closing block.
 *
 * It rides in the sticky contents column, under the section count, so it is on
 * screen for the whole read and scrolls away with the article rather than
 * covering the footer.
 */
export function TutorialFeedbackEntry(props: { className?: string }) {
  const { t } = useTranslation()

  return (
    <div data-slot='tutorial-feedback' className={props.className}>
      <p className='text-muted-foreground text-[11px] leading-[1.4] tracking-[0.08em]'>
        {t('Still have a question?')}
      </p>
      <p className='mt-1.5 text-[12.5px] leading-[1.6]'>
        {t(
          'Anything the docs do not cover, or a capability you want, belongs in a ticket. An administrator answers in the same thread.'
        )}
      </p>
      <p className='mt-1.5 text-[12.5px] leading-[1.6]'>
        <Link to='/tickets' className={LINK_CLASS}>
          {t('Open ticket')}
        </Link>
      </p>
    </div>
  )
}

/**
 * The same offer on a phone, where there is no sticky column: one line pinned
 * under the header while the article scrolls, and released at the end of it so
 * the page footer stays untouched.
 */
export function TutorialFeedbackBar() {
  const { t } = useTranslation()

  return (
    <div
      data-slot='tutorial-feedback-bar'
      className='border-border bg-background/95 sticky top-(--app-header-height,3.5rem) z-20 -mx-4 flex items-baseline justify-between gap-3 border-b px-4 py-2 backdrop-blur lg:hidden'
    >
      <span className='text-muted-foreground text-[12px] leading-[1.5]'>
        {t('Still have a question?')}
      </span>
      <Link to='/tickets' className={cn(LINK_CLASS, 'text-[12px] shrink-0')}>
        {t('Open ticket')}
      </Link>
    </div>
  )
}
