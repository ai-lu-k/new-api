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
import { useLayoutEffect, useRef } from 'react'

/**
 * Keeps the band under the table from jumping when the page shrinks or grows.
 *
 * A table cannot animate `height`, so the wrapper's `min-height` is pinned to
 * the measured table height and allowed to transition to the new value. It is
 * written straight from the observer instead of component state on purpose: no
 * re-render per resize, and the value is always the settled one, so a failed
 * measurement leaves no reserved band behind (the style is cleared instead).
 *
 * @param enabled Only for tables that grow with their content. Fixed-height
 *   tables fill the page and must keep their `min-h-0` flex sizing.
 */
export function useSettledTableHeight(enabled: boolean) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    if (!enabled) {
      wrapper.style.minHeight = ''
      return
    }
    const table = wrapper.querySelector('table')
    if (!table) return

    const settle = () => {
      wrapper.style.minHeight = `${table.getBoundingClientRect().height}px`
    }
    settle()
    // The observer fires after layout, so the transition starts from the
    // previous settled value instead of re-measuring mid-animation.
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(settle)
    })
    observer.observe(table)
    return () => {
      observer.disconnect()
      wrapper.style.minHeight = ''
    }
  }, [enabled])

  return wrapperRef
}
