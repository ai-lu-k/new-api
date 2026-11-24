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
import type { ReactNode } from 'react'

import { MOTION_SHIFT, MOTION_TRANSITION } from '@/lib/motion'
import { cn } from '@/lib/utils'

export type RevealProps = {
  /** Content of the block or list being introduced. */
  children: ReactNode
  /** Extra classes on the wrapper; the entrance itself must stay here. */
  className?: string
  /**
   * Delay before the entrance, in seconds. Use it to sequence a few sibling
   * blocks (`0.04 * index`); anything longer than a couple of frames turns
   * into waiting.
   */
  delay?: number
  /** Element to render. Defaults to a plain `div`. */
  as?: 'div' | 'section' | 'li'
  /** Remove the entrance when the block is already on screen and only the
   *  content refreshes (default: animate). */
  animate?: boolean
}

/**
 * The one way a block or list enters the page (L4, 140ms).
 *
 * It moves 8px and lifts opacity from .65 — it never starts from nothing, so a
 * refreshed section reads as "the same block with new content", not as a flash.
 * Under `prefers-reduced-motion` the wrapper renders plainly.
 *
 * ```tsx
 * <Reveal delay={index * 0.04}>
 *   <StatRow … />
 * </Reveal>
 * ```
 */
export function Reveal(props: RevealProps) {
  const shouldReduce = useReducedMotion()
  const animate = props.animate ?? true

  if (shouldReduce || !animate) {
    if (props.as === 'section') {
      return <section className={props.className}>{props.children}</section>
    }
    if (props.as === 'li') {
      return <li className={props.className}>{props.children}</li>
    }
    return <div className={props.className}>{props.children}</div>
  }

  const entrance = {
    initial: { opacity: 0.65, y: MOTION_SHIFT.control },
    animate: { opacity: 1, y: 0 },
    transition: { ...MOTION_TRANSITION.fast, delay: props.delay },
    className: cn(props.className),
  }

  if (props.as === 'section') {
    return <motion.section {...entrance}>{props.children}</motion.section>
  }
  if (props.as === 'li') {
    return <motion.li {...entrance}>{props.children}</motion.li>
  }
  return <motion.div {...entrance}>{props.children}</motion.div>
}
