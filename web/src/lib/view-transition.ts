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
import { flushSync } from 'react-dom'

import { PAGE_TRANSITIONS_ENABLED, pageTransitionsEnabled } from '@/lib/motion'

/** The part of `ViewTransition` this module relies on. */
type ViewTransitionHandles = {
  ready?: Promise<unknown>
  updateCallbackDone?: Promise<unknown>
  finished?: Promise<unknown>
}

type TransitionDocument = Document & {
  startViewTransition?: (
    callback: () => void
  ) => ViewTransitionHandles | undefined
}

/**
 * True while a same-document transition owns the screen.
 *
 * Two transitions cannot overlap: the browser aborts the running one with
 * `AbortError: Transition was skipped`, which reaches `window` as a pageerror
 * when a drawer is opened twice in a row or two rows are clicked quickly.
 */
let transitionInFlight = false

function ignore(): void {
  /* The skip itself is the answer: the DOM is already in its final state. */
}

/**
 * Run a state change inside a same-document View Transition.
 *
 * Route changes already get one from the router, but a list ↔ detail handoff
 * that stays on the same page (a row opening a drawer or a dialog) has to ask
 * for one itself: without it the two elements never share a snapshot and
 * `useSharedName()` has nothing to morph.
 *
 * The update is flushed synchronously because the browser takes the new
 * snapshot as soon as the callback returns. With `prefers-reduced-motion`,
 * without the API, with the page-handoff switch off (2026-11-05: the shared
 * element morph is part of what mei took offline), or while another transition
 * is still running, the state change simply happens — never half-finished, and
 * never a second overlapping `::view-transition` group.
 *
 * ```tsx
 * const openRow = (id: number) => withViewTransition(() => setOpenId(id))
 * ```
 */
export function withViewTransition(run: () => void): void {
  if (typeof document === 'undefined') {
    run()
    return
  }
  const target = document as TransitionDocument

  if (
    transitionInFlight ||
    !PAGE_TRANSITIONS_ENABLED ||
    !pageTransitionsEnabled() ||
    !target.startViewTransition
  ) {
    run()
    return
  }

  transitionInFlight = true

  let transition: ViewTransitionHandles | undefined
  try {
    transition = target.startViewTransition(() => {
      flushSync(run)
    })
  } catch {
    // A refused transition must not swallow the state change.
    transitionInFlight = false
    run()
    return
  }

  // A skipped transition rejects all three promises. Nothing is left to do at
  // that point, so they are consumed here instead of surfacing as pageerrors.
  transition?.ready?.catch(ignore)
  transition?.updateCallbackDone?.catch(ignore)
  const release = () => {
    transitionInFlight = false
  }
  const finished = transition?.finished
  // `finished` settles on success and on skip; either way the guard is free.
  if (finished && typeof finished.finally === 'function') {
    finished.finally(release).catch(ignore)
  } else {
    release()
  }
}

type SearchRecord = Record<string, unknown>

/** The part of a router navigation this module needs for an in-place update. */
export type InPlaceNavigation = (options: {
  search:
    | true
    | SearchRecord
    | ((previous: SearchRecord) => Partial<SearchRecord> | SearchRecord)
  replace?: boolean
  viewTransition?: boolean
}) => void

/**
 * Change only the search string of the current route: page, page size, sort,
 * filters, column visibility.
 *
 * The pathname does not move, so the page is not being handed over — only the
 * rows inside it change. A page-level View Transition would snapshot the whole
 * document (sidebar, header, title) and slide it, which reads as a page change.
 * `viewTransition: false` keeps the router out of the snapshot; the row
 * entrance is the only motion (see the contract, L2).
 */
export function navigateInPlace(
  navigate: InPlaceNavigation,
  options: Omit<Parameters<InPlaceNavigation>[0], 'viewTransition'>
): void {
  navigate({ ...options, viewTransition: false })
}
