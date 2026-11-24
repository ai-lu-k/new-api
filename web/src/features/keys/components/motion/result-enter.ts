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
import * as React from 'react'

import {
  MOTION_EASE,
  MOTION_MS,
  MOTION_SHIFT,
  prefersReducedMotion,
} from '@/lib/motion'

/**
 * The result region of a server-paged list (keys, usage logs).
 *
 * Filter, search and page changes all land as one new set of rows. The old
 * rows stay where they are behind `DataTableFetchingMask`, so without this the
 * new set just blinks in. Here the body arrives with 4px of lift and an opacity
 * ramp on the base token — the region keeps its box, nothing on the page moves.
 *
 * Shared by the two lists because both are the same surface: a `DataTablePage`
 * whose rows come from the server. The list handoff in
 * `components/motion/list-diff-transition` is off with the page handoff
 * (`PAGE_TRANSITIONS_ENABLED`), so this is the only whole-result entrance.
 *
 * ```tsx
 * const resultRef = useResultEnter(`${pageIndex}|${pageSize}|${filter}`)
 * return <div ref={resultRef} className='contents'><DataTablePage … /></div>
 * ```
 *
 * @param signature Changes exactly when the visible result set changes. A
 *   selection or an open drawer must not re-run it.
 */
export function useResultEnter(
  signature: string
): React.RefObject<HTMLDivElement | null> {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const signatureRef = React.useRef(signature)

  // No deps on purpose: the animation belongs to the commit that replaced the
  // rows, and only the signature tells whether this commit did that.
  React.useLayoutEffect(() => {
    const changed = signatureRef.current !== signature
    signatureRef.current = signature
    if (!changed) return

    const container = containerRef.current
    if (!container) return
    // jsdom has no `Element.animate`; reduced motion must not move at all.
    if (typeof Element.prototype.animate !== 'function') return
    if (prefersReducedMotion()) return

    const easing = `cubic-bezier(${MOTION_EASE.out.join(', ')})`
    for (const body of container.querySelectorAll<HTMLElement>(
      '[data-slot="table-body"]'
    )) {
      body.animate(
        [
          {
            opacity: 0.65,
            transform: `translate3d(0, ${MOTION_SHIFT.micro}px, 0)`,
          },
          { opacity: 1, transform: 'none' },
        ],
        { duration: MOTION_MS.base, easing }
      )
    }
  })

  return containerRef
}
