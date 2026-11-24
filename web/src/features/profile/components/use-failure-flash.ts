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

/**
 * Turns one failed attempt into a frame worth noticing.
 *
 * The site keeps motion in `transform`/`opacity` only, so a refused check-in is
 * marked by the button frame turning destructive for the fast token instead of
 * shaking. The mark clears itself; the flag is a boolean, so a second failure
 * inside the window keeps the frame up rather than stacking timers.
 */
export function useFailureFlash(): {
  failed: boolean
  markFailed: () => void
} {
  const [failed, setFailed] = React.useState(false)
  const timerRef = React.useRef<number | null>(null)

  React.useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    []
  )

  const markFailed = React.useCallback(() => {
    setFailed(true)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      setFailed(false)
    }, 1200)
  }, [])

  return { failed, markFailed }
}

/** The frame both check-in buttons carry while a failure is being shown. */
export const CHECKIN_FAILED_FRAME_CLASSNAME =
  'ring-1 ring-destructive transition-[box-shadow,border-color,background-color,color] duration-(--motion-fast)'
