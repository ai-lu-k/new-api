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
  DIFF_KEY_ATTRIBUTE,
  GHOST_ATTRIBUTE,
} from '@/components/motion/list-diff-transition'
import { MOTION_EASE, MOTION_MS, MOTION_SHIFT } from '@/lib/motion'

/** One row, as it was laid out when the snapshot was read. */
export type RowHandoffEntry = {
  key: string
  element: HTMLElement
  rect: DOMRect
  /** Column widths of a `<tr>`, kept so the exit copy keeps its columns. */
  cells?: number[]
  /** Everything the row renders, used to tell a content update from a new row. */
  text: string
}

export type RowHandoffSnapshot = Map<string, RowHandoffEntry>

/**
 * 15 ms between two rows: one ninth of the fast token, so the whole ladder
 * stays in proportion if the durations ever move.
 */
export const ROW_ENTER_STEP_MS = MOTION_MS.fast / 9

/**
 * The stagger may only use what is left of the slow token once one row's own
 * entrance is paid for: 320 − 220 = 100 ms, which is six steps.
 */
const ROW_STAGGER_BUDGET_MS = MOTION_MS.slow - MOTION_MS.base
const MAX_STAGGER_STEPS = Math.floor(ROW_STAGGER_BUDGET_MS / ROW_ENTER_STEP_MS)

export function cubicBezier(ease: readonly number[]): string {
  return `cubic-bezier(${ease.join(', ')})`
}

export function isInViewport(rect: DOMRect): boolean {
  const height = window.innerHeight || 0
  return rect.bottom > 0 && rect.top < height
}

/**
 * Reads identity, box, columns and content of every row currently in
 * `container`. One pass, reads only — the caller writes afterwards, so the
 * browser resolves a single layout for the whole snapshot.
 */
export function readRowSnapshot(container: HTMLElement): RowHandoffSnapshot {
  const snapshot: RowHandoffSnapshot = new Map()
  const nodes = container.querySelectorAll<HTMLElement>(
    `[${DIFF_KEY_ATTRIBUTE}]`
  )

  for (const node of nodes) {
    if (node.hasAttribute(GHOST_ATTRIBUTE)) continue
    const key = node.getAttribute(DIFF_KEY_ATTRIBUTE)
    if (!key || snapshot.has(key)) continue
    snapshot.set(key, {
      key,
      element: node,
      rect: node.getBoundingClientRect(),
      cells:
        node.tagName === 'TR'
          ? [...(node as HTMLTableRowElement).cells].map(
              (cell) => cell.getBoundingClientRect().width
            )
          : undefined,
      text: node.textContent ?? '',
    })
  }

  return snapshot
}

/** Delay of the n-th arriving row, in milliseconds. */
export function rowEnterDelayMs(index: number): number {
  return Math.min(Math.max(index, 0), MAX_STAGGER_STEPS) * ROW_ENTER_STEP_MS
}

/**
 * Raises an arriving row: 4 px from below, opacity 0 → 1, on the base token.
 *
 * Rows outside the viewport are skipped outright — a hundred row table must
 * not run a hundred animations, and nobody sees the ones off screen.
 */
export function playRowEnter(
  element: HTMLElement,
  index: number
): Animation | null {
  if (!isInViewport(element.getBoundingClientRect())) return null

  return element.animate(
    [
      { opacity: 0, transform: `translate3d(0, ${MOTION_SHIFT.micro}px, 0)` },
      { opacity: 1, transform: 'none' },
    ],
    {
      duration: MOTION_MS.base,
      delay: rowEnterDelayMs(index),
      easing: cubicBezier(MOTION_EASE.out),
      // Holds the first frame while the ladder waits, then releases the row.
      fill: 'backwards',
    }
  )
}

/**
 * The travel still in flight for a row, so a second change within one animation
 * continues from where the row is drawn instead of stacking a second transform
 * on it (stacked transforms read as a jump).
 */
const travelByRow = new WeakMap<HTMLElement, Animation>()

/**
 * Moves a row that survived the change from where it was to where it is now.
 *
 * A sort or a re-order of the same rows is not a result change: nothing left
 * and nothing new arrived, the same rows are simply elsewhere. Fading them
 * would say "these are new rows", so only the box travels — transform, no
 * opacity, base token, morph easing.
 *
 * @returns the running animation, or `null` when the row did not move.
 */
export function playRowMove(
  element: HTMLElement,
  from: DOMRect,
  to: DOMRect
): Animation | null {
  // One travel at a time. A sort that also resets the page commits twice, and
  // the second commit's box was measured while the row was already drawn
  // somewhere else: starting again from it reads as a hop. The travel that is
  // running already ends at the row's own box, so a second request is dropped.
  const running = travelByRow.get(element)
  if (running) return running

  const dx = from.left - to.left
  const dy = from.top - to.top
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null

  const animation = element.animate(
    [{ transform: `translate3d(${dx}px, ${dy}px, 0)` }, { transform: 'none' }],
    { duration: MOTION_MS.base, easing: cubicBezier(MOTION_EASE.morph) }
  )
  const forget = () => travelByRow.delete(element)
  travelByRow.set(element, animation)
  animation.addEventListener('finish', forget)
  animation.addEventListener('cancel', forget)
  return animation
}
