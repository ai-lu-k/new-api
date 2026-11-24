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
import { useSyncExternalStore } from 'react'

import {
  PAGE_TRANSITIONS_ENABLED,
  prefersReducedMotion,
  REDUCED_MOTION_QUERY,
  supportsViewTransitions,
} from '@/lib/motion'

function subscribeMotionPreference(onChange: () => void): () => void {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return () => {}
  }
  const media = window.matchMedia(REDUCED_MOTION_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function readReducedMotion(): boolean {
  return prefersReducedMotion()
}

/**
 * Whether the browser is going to animate page changes for us.
 *
 * True only when the page-handoff switch is on, the platform supports
 * same-document View Transitions *and* the reader has not asked for reduced
 * motion. Components use it to decide between "the browser hands the page over"
 * and the motion fallback; it is reactive, so flipping the OS switch takes
 * effect without a reload.
 */
export function usePageTransitionsEnabled(): boolean {
  const reduced = useSyncExternalStore(
    subscribeMotionPreference,
    readReducedMotion,
    () => false
  )
  if (!PAGE_TRANSITIONS_ENABLED) return false
  return !reduced && supportsViewTransitions()
}
