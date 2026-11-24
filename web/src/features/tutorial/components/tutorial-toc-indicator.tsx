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
import { useReducedMotion } from 'motion/react'

import { MOTION_EASE, MOTION_MS } from '@/lib/motion'

import type { TocIndicator } from '../hooks/use-toc-indicator'

/** The same `--ease-morph` curve swiss.css exposes, for an inline transform. */
const MORPH_EASE = `cubic-bezier(${MOTION_EASE.morph.join(', ')})`

export type TutorialTocIndicatorProps = {
  /** Measured by the list owner (see `useTocIndicator`); null before that. */
  indicator: TocIndicator | null
}

/**
 * One red square that travels to the entry being read (220ms, `--ease-morph`).
 *
 * The contents used to swap a coloured square per entry, so the mark blinked
 * out of one line and into the next. Drawing one absolutely positioned square
 * and moving it with `translateY` keeps it a single object in motion — the
 * same rule the tab underline follows. The first placement does not travel:
 * the mark starts where the reader already is.
 */
export function TutorialTocIndicator(props: TutorialTocIndicatorProps) {
  const shouldReduce = useReducedMotion()
  const indicator = props.indicator

  if (!indicator) return null

  return (
    <span
      aria-hidden='true'
      data-slot='tutorial-toc-indicator'
      className='bg-destructive pointer-events-none absolute left-0 size-3'
      style={{
        top: 0,
        transform: `translateY(${indicator.top}px)`,
        transition:
          indicator.placed && !shouldReduce
            ? `transform ${MOTION_MS.base}ms ${MORPH_EASE}`
            : undefined,
      }}
    />
  )
}
