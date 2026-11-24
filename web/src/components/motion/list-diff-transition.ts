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
import { MOTION_EASE, MOTION_MS, MOTION_SHIFT } from '@/lib/motion'

/**
 * Identity of one list item across two result sets. A table row, a card in the
 * grid and a row in the mobile list all carry it; the handoff below is what
 * reads it, so no component ever needs to know about the others.
 */
export const DIFF_KEY_ATTRIBUTE = 'data-diff-key'

/** Marks the throwaway clone of an item that just left the page. */
export const GHOST_ATTRIBUTE = 'data-motion-ghost'

/**
 * Four rungs for the arriving items, 20 ms apart.
 *
 * 20 ms is a seventh of the fast token: the ladder only has to separate the
 * first few arrivals from each other, and a whole ladder still lands inside
 * one base token. Deriving it keeps the ladder in proportion if the token
 * moves; nothing here is a hand-written duration.
 */
export const ENTER_STEP_MS = MOTION_MS.fast / 7
export const ENTER_STEPS = 4

/** Where a leaving item falls to, and where an arriving one rises from. */
export const LEAVE_SHIFT = MOTION_SHIFT.page
export const ENTER_SHIFT = MOTION_SHIFT.control

export type DiffSnapshotEntry = {
  /** The identity this box was measured for. */
  key: string
  /** The live element, kept so a ghost can be cloned after it detaches. */
  element: HTMLElement
  /** Its box in the previous frame, before this commit replaced the list. */
  rect: DOMRect
  /**
   * Column widths, measured while the row was still laid out. A ghost cannot
   * measure itself: by the time it is cloned the cell has left the table.
   */
  cells?: number[]
}

/** One keyed item per entry, as it was laid out when the snapshot was taken. */
export type DiffSnapshot = Map<string, DiffSnapshotEntry>

/**
 * Whether the platform can run a handoff at all. jsdom has no
 * `Element.animate`, and neither do browsers older than the Web Animations
 * API — there the list simply updates in place, which is the reduced-motion
 * behaviour below.
 */
export function supportsWebAnimations(): boolean {
  return typeof Element.prototype.animate === 'function'
}

function cubicBezier(ease: readonly number[]): string {
  return `cubic-bezier(${ease.join(', ')})`
}

function readCellWidths(element: HTMLElement): number[] | undefined {
  if (element.tagName !== 'TR') return undefined
  return [...(element as HTMLTableRowElement).cells].map(
    (cell) => cell.getBoundingClientRect().width
  )
}

/**
 * Reads the identity and box of every item currently in `container`.
 *
 * One pass, reads only: the caller writes to the DOM afterwards, so the browser
 * resolves a single layout for the whole snapshot instead of one per item.
 */
export function readDiffSnapshot(container: HTMLElement): DiffSnapshot {
  const snapshot: DiffSnapshot = new Map()
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
      cells: readCellWidths(node),
    })
  }

  return snapshot
}

function hasMoved(dx: number, dy: number, scaleX: number, scaleY: number) {
  // Sub-pixel noise is not a handoff: animating it would cost a full FLIP per
  // row and show nothing.
  return (
    Math.abs(dx) >= 0.5 ||
    Math.abs(dy) >= 0.5 ||
    Math.abs(scaleX - 1) >= 0.005 ||
    Math.abs(scaleY - 1) >= 0.005
  )
}

/**
 * Keeps a retained item where it was and lets it travel to its new box.
 *
 * Transform only — no opacity, because the item never left the page; fading it
 * would read as a second entrance instead of the same object moving.
 *
 * @returns the running animation, or `null` when the item did not move.
 */
export function playListFlip(
  element: HTMLElement,
  from: DOMRect,
  to: DOMRect
): Animation | null {
  const dx = from.left - to.left
  const dy = from.top - to.top
  const scaleX = to.width > 0 ? from.width / to.width : 1
  const scaleY = to.height > 0 ? from.height / to.height : 1
  if (!hasMoved(dx, dy, scaleX, scaleY)) return null

  return element.animate(
    [
      {
        transform: `translate3d(${dx}px, ${dy}px, 0) scale(${scaleX}, ${scaleY})`,
      },
      { transform: 'none' },
    ],
    {
      duration: MOTION_MS.slow,
      easing: cubicBezier(MOTION_EASE.morph),
    }
  )
}

/** Delay of the n-th arriving item, in milliseconds. */
export function listEnterDelayMs(index: number): number {
  return Math.min(Math.max(index, 0), ENTER_STEPS - 1) * ENTER_STEP_MS
}

/**
 * Lifts a newly-found item into place: from `ENTER_SHIFT` above its box, at
 * opacity .6, so it reads as belonging to the page it arrives on.
 */
export function playListEnter(element: HTMLElement, index: number): Animation {
  return element.animate(
    [
      { opacity: 0.6, transform: `translate3d(0, -${ENTER_SHIFT}px, 0)` },
      { opacity: 1, transform: 'none' },
    ],
    {
      duration: MOTION_MS.base,
      delay: listEnterDelayMs(index),
      easing: cubicBezier(MOTION_EASE.out),
      // Holds the first frame while the ladder waits, then releases the
      // element: a finished animation must not stay in the element's styles.
      fill: 'backwards',
    }
  )
}

function positionGhost(ghost: HTMLElement, rect: DOMRect): void {
  ghost.style.position = 'fixed'
  ghost.style.left = `${rect.left}px`
  ghost.style.top = `${rect.top}px`
  ghost.style.width = `${rect.width}px`
  ghost.style.height = `${rect.height}px`
  ghost.style.margin = '0'
  ghost.style.overflow = 'hidden'
  ghost.style.pointerEvents = 'none'
  ghost.style.zIndex = '1'
}

/**
 * Builds the falling copy of an item that is no longer in the list.
 *
 * The copy lives in its own positioned box, so it never takes part in the
 * layout of the list it came from — the rows below close the gap immediately
 * and nothing is pushed around by the exit. A table row is wrapped in a table
 * with the measured column widths, because a bare `<tr>` outside a table loses
 * the columns it was rendered with.
 */
export function createListGhost(entry: DiffSnapshotEntry): HTMLElement {
  const ghost = document.createElement('div')
  ghost.setAttribute(GHOST_ATTRIBUTE, '')
  ghost.setAttribute('aria-hidden', 'true')
  positionGhost(ghost, entry.rect)

  const clone = entry.element.cloneNode(true) as HTMLElement
  clone.removeAttribute(DIFF_KEY_ATTRIBUTE)
  clone.removeAttribute('id')
  clone.style.margin = '0'

  if (clone.tagName !== 'TR') {
    clone.style.width = '100%'
    clone.style.height = '100%'
    ghost.append(clone)
    return ghost
  }

  const table = document.createElement('table')
  table.style.width = `${entry.rect.width}px`
  table.style.tableLayout = 'fixed'
  table.style.borderCollapse = 'separate'
  table.style.borderSpacing = '0'
  table.style.margin = '0'

  const colgroup = document.createElement('colgroup')
  for (const width of entry.cells ?? []) {
    const col = document.createElement('col')
    col.style.width = `${width}px`
    colgroup.append(col)
  }
  table.append(colgroup)

  const body = document.createElement('tbody')
  body.append(clone)
  table.append(body)
  ghost.append(table)
  return ghost
}

/** Sends the ghost down and out: `LEAVE_SHIFT` below, opacity to zero. */
export function playListLeave(ghost: HTMLElement): Animation {
  return ghost.animate(
    [
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: `translate3d(0, ${LEAVE_SHIFT}px, 0)` },
    ],
    {
      duration: MOTION_MS.base,
      easing: cubicBezier(MOTION_EASE.in),
    }
  )
}

/**
 * Plays one exit to completion and removes everything it created.
 *
 * Two ways out on purpose: the finish/cancel events normally fire, and a timer
 * still cleans up when the frame loop is paused (a hidden tab) and the
 * animation never reports completion.
 */
export function dropListGhost(entry: DiffSnapshotEntry): void {
  // A node that now carries another identity was recycled for a later row (a
  // list keyed by position rather than by id). Cloning it would drop a copy of
  // the *new* row, so no ghost is better than a wrong one.
  if (entry.element.getAttribute(DIFF_KEY_ATTRIBUTE) !== entry.key) return

  const ghost = createListGhost(entry)
  document.body.append(ghost)

  const animation = playListLeave(ghost)
  let removed = false
  const remove = () => {
    if (removed) return
    removed = true
    animation.cancel()
    ghost.remove()
  }

  animation.addEventListener('finish', remove)
  animation.addEventListener('cancel', remove)
  window.setTimeout(remove, MOTION_MS.base + MOTION_MS.fast)
}
