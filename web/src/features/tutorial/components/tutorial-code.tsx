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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'

/**
 * How long the label says "Copied" before it offers the copy again. Short on
 * purpose: the reader has already moved on, and a button that stays changed
 * reads as a state rather than a confirmation.
 */
const COPIED_HOLD_MS = 1200

/**
 * A block the reader copies whole. A tinted surface with no radius and no
 * frame, so it separates from the text without becoming a card; the copy
 * action sits inside the block's own top edge instead of a toolbar above it.
 */
export function TutorialCode(props: { code: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  return (
    <div
      data-slot='tutorial-code'
      className='bg-muted relative mt-4 px-5 pt-8 pb-4'
    >
      <CopyButton
        value={props.code}
        size='sm'
        variant='ghost'
        hideIcon
        aria-label={t('Copy code')}
        className='text-muted-foreground hover:text-foreground absolute top-1.5 right-3 h-auto px-0 py-0.5 text-[11px] font-normal tracking-[0.04em] hover:bg-transparent'
        onCopy={(success) => {
          if (!success) return
          setCopied(true)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => setCopied(false), COPIED_HOLD_MS)
        }}
      >
        {/* `data-copied` is the site-wide 140ms confirmation (`styles/swiss.css`):
            the label arrives with the same step as the tick elsewhere. */}
        <span data-copied={copied ? '' : undefined} className='inline-block'>
          {copied ? t('Copied') : t('Copy')}
        </span>
      </CopyButton>
      <pre className='overflow-x-auto'>
        <code className='block font-mono text-[12.5px] leading-[1.8] break-words whitespace-pre-wrap'>
          {props.code}
        </code>
      </pre>
    </div>
  )
}
