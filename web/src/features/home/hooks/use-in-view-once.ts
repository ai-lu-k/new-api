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
import { useEffect, useRef, useState } from 'react'

/**
 * Frames a block has to hold still inside the viewport before its entrance is
 * considered "seen". The home page fills its figures in from four APIs after
 * mount, so a block can be swept through the viewport by a layout shift and
 * then be pushed back below the fold: the growth chart used to play at t≈206ms
 * while still sitting at 701px, and the reader met it frozen at 1233px. Holding
 * the element still for a few frames rejects those drive-by intersections
 * without delaying a real arrival — a stopped scroll settles within a frame or
 * two. Counted in frames, not milliseconds: this is a settling guard, not a
 * duration, so it has no place in the motion tokens.
 */
const SETTLE_FRAMES = 3

/**
 * `true` once the element has been inside the viewport *and* still for
 * `SETTLE_FRAMES` frames; never goes back to `false`.
 *
 * `amount` is the share of the element that has to be visible (the same number
 * `motion`'s `viewport.amount` takes). Without an `IntersectionObserver`
 * (tests, old browsers) or when nothing is attached to `ref`, the block plays
 * immediately instead of staying hidden.
 */
export function useInViewOnce(amount: number) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    let frame = 0
    let done = false
    let stable = 0
    let lastTop = Number.NaN
    let lastHeight = Number.NaN

    // Reset the settle progress: leaving the viewport means the next match has
    // to earn its frames again.
    const stop = () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
      stable = 0
      lastTop = Number.NaN
      lastHeight = Number.NaN
    }

    const step = () => {
      frame = 0
      if (done) return
      const rect = node.getBoundingClientRect()
      const moved =
        Math.abs(rect.top - lastTop) > 0.5 ||
        Math.abs(rect.height - lastHeight) > 0.5
      lastTop = rect.top
      lastHeight = rect.height
      stable = moved ? 0 : stable + 1

      const visible = rect.bottom > 0 && rect.top < window.innerHeight
      if (visible && stable >= SETTLE_FRAMES) {
        done = true
        setInView(true)
        return
      }
      frame = requestAnimationFrame(step)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (done) return
        if (!entries.some((entry) => entry.isIntersecting)) {
          stop()
          return
        }
        if (frame === 0) frame = requestAnimationFrame(step)
      },
      { threshold: amount }
    )

    observer.observe(node)
    return () => {
      observer.disconnect()
      stop()
    }
  }, [amount])

  return { ref, inView }
}
