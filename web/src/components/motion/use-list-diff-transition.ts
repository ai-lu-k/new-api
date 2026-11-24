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

import { PAGE_TRANSITIONS_ENABLED, prefersReducedMotion } from '@/lib/motion'

import {
  type DiffSnapshot,
  dropListGhost,
  playListEnter,
  playListFlip,
  readDiffSnapshot,
  supportsWebAnimations,
} from './list-diff-transition'

export type ListDiffTransitionHandle = {
  /**
   * Suppress the handoff for the next result-set change: no FLIP, no ghost, no
   * entrance. For changes that are not a user-driven turn of the list — a
   * silent refetch landing after a reconnect, or a caller that already knows
   * the container was rebuilt. A first mount needs no call: with no previous
   * snapshot there is nothing to hand off from.
   */
  skipNext: () => void
}

function track(running: Set<Animation>, animation: Animation | null): void {
  if (!animation) return
  running.add(animation)
  const done = () => running.delete(animation)
  // Finish and cancel both mean "no longer in flight".
  animation.addEventListener('finish', done)
  animation.addEventListener('cancel', done)
}

/**
 * Ends any handoff that is still in flight, so the boxes read next are layout
 * boxes. `getBoundingClientRect` includes transforms — reading a row in the
 * middle of its own FLIP would hand that mid-flight offset to the next change.
 */
function settleRunning(running: Set<Animation>): void {
  for (const animation of running) {
    animation.finish()
  }
  running.clear()
}

function playDiff(
  before: DiffSnapshot,
  next: DiffSnapshot,
  running: Set<Animation>
): void {
  const arriving: HTMLElement[] = []

  for (const [key, entry] of next) {
    const previous = before.get(key)
    if (!previous) {
      arriving.push(entry.element)
      continue
    }
    track(running, playListFlip(entry.element, previous.rect, entry.rect))
  }

  for (const [key, entry] of before) {
    if (next.has(key)) continue
    dropListGhost(entry)
  }

  arriving.forEach((element, index) => {
    track(running, playListEnter(element, index))
  })
}

/**
 * The list-side handoff: items that survive a page / sort / filter change stay
 * and travel, items that left fall away, items that appeared rise in.
 *
 * ```tsx
 * const gridRef = React.useRef<HTMLDivElement>(null)
 * const signature = React.useMemo(
 *   () => getListEntranceSignature(rows, table.getState()),
 *   [table, rows]
 * )
 * useListDiffTransition(gridRef, signature)
 *
 * return (
 *   <div ref={gridRef}>
 *     {rows.map((row) => (
 *       <div key={row.id} data-diff-key={row.id}>…</div>
 *     ))}
 *   </div>
 * )
 * ```
 *
 * Every item needs `data-diff-key`; the value is what survives the change (a
 * row id, a card id), never the position in the list.
 *
 * @param containerRef Element around the keyed items. Any ancestor works: the
 *   snapshot looks up `[data-diff-key]` descendants, not just direct children.
 * @param signature One string that changes exactly when the visible result set
 *   changes (page, sort, filter, rows). Passing a string instead of a deps
 *   array lets the snapshot run on every commit while the handoff stays tied to
 *   result changes only — selecting a row or opening a drawer must not replay
 *   it.
 */
export function useListDiffTransition(
  containerRef: React.RefObject<HTMLElement | null>,
  signature: string
): ListDiffTransitionHandle {
  const previousRef = React.useRef<DiffSnapshot | null>(null)
  const containerNodeRef = React.useRef<HTMLElement | null>(null)
  const signatureRef = React.useRef(signature)
  const skipRef = React.useRef(false)
  const runningRef = React.useRef<Set<Animation>>(new Set())

  // No deps on purpose: the snapshot has to be taken at the end of every
  // commit so the next change has the boxes from *before* it.
  React.useLayoutEffect(() => {
    // 2026-11-05: the list handoff is switched off with the page handoff (mei
    // found the FLIP + falling ghost + rising entrance too jumpy). A result
    // change then simply renders the new rows: no snapshot is even read, so no
    // FLIP, no ghost and no entrance can run.
    if (!PAGE_TRANSITIONS_ENABLED) return

    const container = containerRef.current
    if (container !== containerNodeRef.current) {
      // A different element means the list was rebuilt (skeleton, view-mode
      // switch, remount). The old boxes belong to a container that is gone.
      containerNodeRef.current = container
      previousRef.current = null
    }
    if (!container) return

    const changed = signatureRef.current !== signature
    signatureRef.current = signature

    settleRunning(runningRef.current)
    const next = readDiffSnapshot(container)
    const before = previousRef.current
    previousRef.current = next

    if (!changed || !before) return
    if (skipRef.current) {
      skipRef.current = false
      return
    }
    if (prefersReducedMotion() || !supportsWebAnimations()) return

    playDiff(before, next, runningRef.current)
  })

  const skipNext = React.useCallback(() => {
    skipRef.current = true
  }, [])

  return React.useMemo(() => ({ skipNext }), [skipNext])
}
