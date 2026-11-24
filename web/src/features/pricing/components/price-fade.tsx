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

export type PriceFadeProps = {
  /** The printed figure; a new value re-enters, the same value stays put. */
  value: string
  className?: string
  title?: string
}

/**
 * A price that changes when the unit, the group or the recharge view changes
 * (140ms, opacity only).
 *
 * A price is a number the reader is comparing down a column: sliding it or
 * growing it would move the digit under the cursor. Only the opacity steps, and
 * only when the printed string is actually different — so the caller keys this
 * element by the value it prints, and an unchanged price never re-enters.
 */
export function PriceFade(props: PriceFadeProps) {
  const shouldReduce = useReducedMotion()

  if (shouldReduce) {
    return (
      <span className={props.className} title={props.title}>
        {props.value}
      </span>
    )
  }

  return (
    <motion.span
      initial={{ opacity: 0.65 }}
      animate={{ opacity: 1 }}
      transition={MOTION_TRANSITION.fast}
      className={props.className}
      title={props.title}
    >
      {props.value}
    </motion.span>
  )
}
