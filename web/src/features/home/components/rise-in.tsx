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

import { MOTION_DURATION, MOTION_EASE, MOTION_SHIFT } from '@/lib/motion'

import { useInViewOnce } from '../hooks/use-in-view-once'

/**
 * One block of the home page rising into place (220ms, 8px, once).
 *
 * `Reveal` is the site-wide entrance at 140ms for list items and refreshes;
 * the landing blocks are read once, top to bottom, so they get the longer
 * `--motion-base` step and can wait for the reader to reach them (`inView`).
 * Both variants move `transform`/`opacity` only and render a plain element
 * under `prefers-reduced-motion: reduce` — with the reduced-motion page
 * there is no `IntersectionObserver` to wait for either.
 */
type RiseInProps = {
  children: ReactNode
  className?: string
  /** Stagger in seconds, e.g. `0.04 * index`. */
  delay?: number
}

const RISE = {
  initial: { opacity: 0.65, y: MOTION_SHIFT.control },
  animate: { opacity: 1, y: 0 },
} as const

function transition(delay: number | undefined) {
  return {
    duration: MOTION_DURATION.base,
    ease: MOTION_EASE.out,
    delay,
  }
}

/**
 * Plays once the block is in the viewport: the first screen on load, everything
 * below it when it is scrolled to. Since the hero sits at the top of the page
 * it still plays immediately, but a reader who lands mid-page (a reload that
 * restores the scroll position) no longer sees the blocks above them play out.
 */
export function RiseIn(props: RiseInProps) {
  const shouldReduce = useReducedMotion()
  // The first screen is often only partly on screen on a short viewport: a
  // sliver is enough, the settle guard already rejects drive-by matches.
  const { ref, inView } = useInViewOnce(0.02)

  if (shouldReduce) {
    return <div className={props.className}>{props.children}</div>
  }

  return (
    <motion.div
      ref={ref}
      initial={RISE.initial}
      animate={inView ? RISE.animate : RISE.initial}
      transition={transition(props.delay)}
      className={props.className}
    >
      {props.children}
    </motion.div>
  )
}

/** Plays the first time the block scrolls into view, and never again. */
export function RiseInView(props: RiseInProps) {
  const shouldReduce = useReducedMotion()
  const { ref, inView } = useInViewOnce(0.15)

  if (shouldReduce) {
    return <div className={props.className}>{props.children}</div>
  }

  return (
    <motion.div
      ref={ref}
      initial={RISE.initial}
      animate={inView ? RISE.animate : RISE.initial}
      transition={transition(props.delay)}
      className={props.className}
    >
      {props.children}
    </motion.div>
  )
}
