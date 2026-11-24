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

import { MOTION_TRANSITION } from '@/lib/motion'

/**
 * A check-in figure or label that swaps in place.
 *
 * The value is keyed by its own text, so a new figure remounts the element and
 * fades in from .65 on the base token — the number and the copy around it read
 * as being replaced, not as blinking. Under `prefers-reduced-motion` the plain
 * element is rendered and the swap is instant.
 */
export function CheckinValue(props: {
  value: string | number
  className?: string
  as?: 'span' | 'strong' | 'div'
}) {
  const shouldReduce = useReducedMotion()
  const key = String(props.value)

  if (shouldReduce) {
    if (props.as === 'strong') {
      return <strong className={props.className}>{props.value}</strong>
    }
    if (props.as === 'div') {
      return <div className={props.className}>{props.value}</div>
    }
    return <span className={props.className}>{props.value}</span>
  }

  return (
    <motion.span
      key={key}
      className={props.className}
      initial={{ opacity: 0.65 }}
      animate={{ opacity: 1 }}
      transition={MOTION_TRANSITION.base}
    >
      {props.value}
    </motion.span>
  )
}
