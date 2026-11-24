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

import { supportsWebAnimations } from '@/components/motion/list-diff-transition'
import { prefersReducedMotion } from '@/lib/motion'

import { mutedColor, playRowLeave, pulseRow } from './row-exit'
import {
  playRowEnter,
  playRowMove,
  readRowSnapshot,
  type RowHandoffSnapshot,
} from './row-handoff'

/**
 * Turns a replaced result set into a readable change: rows that left fade out
 * where they were, rows that arrived rise in, rows that stayed still get a
 * wash when their content changed in place.
 *
 * This is the table's half of the motion contract (§10.1) and the one piece of
 * it that is *not* behind `PAGE_TRANSITIONS_ENABLED`: the page handoff and its
 * FLIP were taken out, but a sort, a page turn or a filter has to show that the
 * rows changed or the table reads as a still image that flickered.
 *
 * Every item needs `data-diff-key`; the value is what survives the change (a
 * row id), never the position in the list. The skeleton uses the same
 * attribute, which is what makes the hand-off from the placeholder to the
 * content a cross instead of a cut.
 *
 * ```tsx
 * const containerRef = React.useRef<HTMLDivElement>(null)
 * useRowHandoff(containerRef, listSignature)
 * ```
 *
 * @param containerRef Element around the keyed rows. Any ancestor works.
 * @param signature One string that changes exactly when the visible result set
 *   changes (page, sort, filter, rows). Selection and drawers must not.
 */
export function useRowHandoff(
  containerRef: React.RefObject<HTMLElement | null>,
  signature: string
): void {
  const previousRef = React.useRef<RowHandoffSnapshot | null>(null)
  const containerNodeRef = React.useRef<HTMLElement | null>(null)
  const signatureRef = React.useRef(signature)

  // No deps on purpose: the snapshot is taken at the end of every commit, so
  // the next change already has the boxes from before it.
  React.useLayoutEffect(() => {
    const container = containerRef.current
    if (container !== containerNodeRef.current) {
      // A rebuilt list (view-mode switch, remount) has no predecessor: its old
      // boxes belong to an element that is gone.
      containerNodeRef.current = container
      previousRef.current = null
    }
    const changed = signatureRef.current !== signature
    signatureRef.current = signature
    if (!container) return

    // In-flight animations are left alone: ending them here would cut a travel
    // short on the next unrelated commit (selecting a row, a filter dialog
    // re-rendering). A second animation on the same property wins over the
    // first, so a new change simply takes over.
    const before = previousRef.current
    const next = readRowSnapshot(container)
    previousRef.current = next
    if (!before) return
    if (prefersReducedMotion() || !supportsWebAnimations()) return

    // One probe for the whole batch: the pulse colour is resolved from
    // `--muted` once, never per row, so no row forces a reflow.
    let muted: string | null = null
    const mutedOnce = () => {
      muted ??= mutedColor()
      return muted
    }

    // A row that stayed and was rewritten in place is not a result change: the
    // signature does not move for it (a refetch landing fresh figures next to
    // the same ids). It still has to show that it was updated, so the pulse is
    // checked on every commit, before the hand-off bails out; a row that moved
    // gets the travel instead of the wash.
    for (const [key, entry] of next) {
      const previous = before.get(key)
      if (!previous) continue
      if (playRowMove(entry.element, previous.rect, entry.rect)) continue
      if (previous.text !== entry.text) {
        pulseRow(entry.element, mutedOnce())
      }
    }

    if (!changed) return

    let arrival = 0
    for (const [key, entry] of next) {
      if (before.has(key)) continue
      playRowEnter(entry.element, arrival)
      arrival += 1
    }

    for (const [key, entry] of before) {
      if (!next.has(key)) playRowLeave(entry)
    }
  })
}
