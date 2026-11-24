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

/**
 * Page handoff for the public shell, without View Transitions.
 *
 * Console pages share one `AnimatedOutlet`, so `AnimatePresence` can hold the
 * outgoing page while the incoming one arrives. Public pages do not: every route
 * renders its own `PublicLayout`, so the outgoing shell is unmounted in the same
 * commit that mounts the new one and React never holds both trees at once.
 *
 * The last frame of the leaving page is therefore cloned on its way out and
 * handed to the next `PublicLayout`, which draws it over the page already in
 * place. Cloning (rather than remounting) means the outgoing page runs no
 * queries, mounts no charts and keeps no timers — only pixels stay on screen.
 */

import { PAGE_TRANSITIONS_ENABLED } from '@/lib/motion'

/**
 * How long an unclaimed frame stays available. This is a staleness bound, not a
 * motion value: a frame is normally claimed within one frame of the navigation,
 * and if nothing claims it the reader went somewhere that is not a public page,
 * so it must not surface on a later public visit.
 */
const HANDOFF_STALE_AFTER_MS = 1500

type PageFrame = {
  /** Pathname the frame was taken from. */
  from: string
  node: HTMLElement
  /** Bumped per capture, so an older timeout cannot drop a newer frame. */
  generation: number
}

let pendingFrame: PageFrame | null = null
let frameGeneration = 0

/**
 * Keep the last frame of `root` for the page that replaces it.
 *
 * Called from the layout's layout-effect cleanup — inside the commit that
 * removes the page, while the node it hands over is still whole.
 *
 * 2026-11-05: with the page-handoff switch off nothing is captured, so no clone
 * of the outgoing page is ever built (an unrunnable frame would only cost a full
 * DOM copy on every navigation).
 */
export function capturePageFrame(from: string, root: HTMLElement | null): void {
  if (!PAGE_TRANSITIONS_ENABLED) return
  if (!root) return
  // A cloned frame would load its source a second time; such pages simply swap.
  if (root.querySelector('iframe')) return

  const clone = root.cloneNode(true) as HTMLElement
  // The header and the shared footer outlive the page (L0 chrome): the new
  // shell already draws both, so the frame keeps only the page body.
  clone.querySelector("[data-vt-name='header']")?.remove()
  clone.querySelector("[data-slot='public-footer']")?.remove()

  frameGeneration += 1
  const generation = frameGeneration
  pendingFrame = { from, node: clone, generation }

  window.setTimeout(() => {
    if (pendingFrame?.generation === generation) pendingFrame = null
  }, HANDOFF_STALE_AFTER_MS)
}

/**
 * The frame to draw for `pathname`, if the page it replaces left one behind.
 *
 * Nothing is consumed on read: a public page swaps its own shell more than once
 * while its data settles (loading branch → content branch), so the frame has to
 * survive remounts and only end when its animation completes.
 */
export function readPageFrame(pathname: string): HTMLElement | null {
  if (!PAGE_TRANSITIONS_ENABLED) return null
  if (!pendingFrame || pendingFrame.from === pathname) return null
  return pendingFrame.node
}

/** Drop a frame that no public page is going to show. */
export function clearPageFrame(): void {
  pendingFrame = null
}
