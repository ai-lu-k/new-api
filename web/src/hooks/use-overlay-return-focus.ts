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
import { useCallback, useEffect, useRef } from 'react'

// The overlay runs its exit animation after `open` flips to false; restoring
// focus while it is still on screen lets the focus trap pull it back in. So the
// restore waits for the layer to leave the DOM, and gives up after this long.
const RESTORE_POLL_MS = 60
const RESTORE_TIMEOUT_MS = 900

// Any mounted dialog, sheet, or phone sidebar drawer.
const OVERLAY_SELECTOR =
  '[data-slot="dialog-content"], [data-slot="sheet-content"], [data-slot="sidebar"][data-mobile="true"]'

function isInsideOverlay(element: Element | null): boolean {
  return element?.closest(OVERLAY_SELECTOR) != null
}

/**
 * Hands focus back to the control that opened a dialog or sheet.
 *
 * Base UI only returns focus to the trigger element it owns, and it skips the
 * restore entirely when the overlay is dismissed by an outside press. Overlays
 * opened from state (`setOpen(true)` in a click handler, no `DialogTrigger`)
 * therefore leave focus on `<body>`, and the next Tab starts from the top of
 * the page instead of the button the user just used. This remembers the control
 * that opened the overlay and restores it once the overlay is gone, unless the
 * user or the overlay layer already put focus somewhere meaningful.
 */
export function useOverlayReturnFocus(open?: boolean) {
  const targetRef = useRef<HTMLElement | null>(null)
  const lastPointerTargetRef = useRef<HTMLElement | null>(null)
  const timerRef = useRef<number | null>(null)

  const clearPendingRestore = useCallback(() => {
    if (timerRef.current === null) return
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  // A click is the moment the invoking control is known for certain: browsers
  // differ on whether they focus a button when it is pressed, and the overlay
  // moves focus inside itself before React effects run.
  useEffect(() => {
    const rememberPointerTarget = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element) || isInsideOverlay(target)) return
      lastPointerTargetRef.current =
        target.closest<HTMLElement>('button, a, [role="button"]') ??
        (target instanceof HTMLElement ? target : null)
    }
    document.addEventListener('pointerdown', rememberPointerTarget, true)
    return () => {
      document.removeEventListener('pointerdown', rememberPointerTarget, true)
    }
  }, [])

  const capture = useCallback(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement && !isInsideOverlay(active)) {
      targetRef.current = active
      return
    }
    const pointerTarget = lastPointerTargetRef.current
    if (pointerTarget?.isConnected && !isInsideOverlay(pointerTarget)) {
      targetRef.current = pointerTarget
    }
  }, [])

  // Controlled overlays change `open` without ever calling `onOpenChange`, so
  // the prop is the reliable "it opened" signal.
  useEffect(() => {
    if (!open) return
    // A new layer supersedes any restore scheduled by the previous one.
    clearPendingRestore()
    capture()
  }, [open, capture, clearPendingRestore])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        capture()
        return
      }
      clearPendingRestore()
      const target = targetRef.current ?? lastPointerTargetRef.current
      targetRef.current = null
      if (!target) return

      const deadline = Date.now() + RESTORE_TIMEOUT_MS
      const attempt = () => {
        timerRef.current = null
        if (!target.isConnected) return
        if (document.querySelector(OVERLAY_SELECTOR)) {
          // The close request can be canceled by the overlay (an unsaved-change
          // prompt, a nested picker) or replaced by another overlay; in both
          // cases the user is still inside a layer and focus must stay there.
          if (Date.now() >= deadline) return
          timerRef.current = window.setTimeout(attempt, RESTORE_POLL_MS)
          return
        }
        const active = document.activeElement
        if (active && active !== document.body) return
        target.focus({ preventScroll: true })
      }

      timerRef.current = window.setTimeout(attempt, RESTORE_POLL_MS)
    },
    [capture, clearPendingRestore]
  )

  useEffect(() => clearPendingRestore, [clearPendingRestore])

  return { handleOpenChange }
}
