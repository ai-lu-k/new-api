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
import {
  createListGhost,
  DIFF_KEY_ATTRIBUTE,
} from '@/components/motion/list-diff-transition'
import { MOTION_EASE, MOTION_MS } from '@/lib/motion'

import { cubicBezier, isInViewport, type RowHandoffEntry } from './row-handoff'

/**
 * Sends a row that is no longer in the result set out as a fixed copy.
 *
 * The copy is out of the table's layout, so the rows below close the gap at
 * once; only its opacity moves (140 ms), which is what keeps a page turn from
 * reading as a shuffle.
 */
export function playRowLeave(entry: RowHandoffEntry): void {
  if (!isInViewport(entry.rect)) return
  // A node recycled for another identity would drop a copy of the wrong row.
  if (entry.element.getAttribute(DIFF_KEY_ATTRIBUTE) !== entry.key) return

  const ghost = createListGhost(entry)
  document.body.append(ghost)

  const animation = ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: MOTION_MS.fast,
    easing: cubicBezier(MOTION_EASE.in),
    fill: 'forwards',
  })

  let removed = false
  const remove = () => {
    if (removed) return
    removed = true
    animation.cancel()
    ghost.remove()
  }
  animation.addEventListener('finish', remove)
  animation.addEventListener('cancel', remove)
  // A paused frame loop (hidden tab) never reports completion.
  window.setTimeout(remove, MOTION_MS.fast + MOTION_MS.base)
}

/** Resolves `--muted` to a computed colour once, so a pulse needs no reflow. */
function resolveMutedColor(): string {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:absolute;top:-9999px;left:-9999px;width:0;height:0;' +
    'background-color:var(--muted)'
  document.body.append(probe)
  const color = getComputedStyle(probe).backgroundColor
  probe.remove()
  return color || 'transparent'
}

/**
 * Marks a row whose content changed in place: a 140 ms wash of `--muted` and
 * nothing else. No movement — the row did not go anywhere.
 */
export function pulseRow(element: HTMLElement, muted: string): Animation {
  return element.animate(
    [{ backgroundColor: muted }, { backgroundColor: 'transparent' }],
    { duration: MOTION_MS.fast, easing: cubicBezier(MOTION_EASE.out) }
  )
}

/** The colour every pulse in this batch shares. */
export function mutedColor(): string {
  return resolveMutedColor()
}
