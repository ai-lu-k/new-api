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
import { useLayoutEffect, useState, type RefObject } from 'react'

export type TocIndicator = {
  /** Distance from the top of the list to the entry being read, in px. */
  top: number
  /** False for the first placement: it is put there, not travelled to. */
  placed: boolean
}

/**
 * Where the one contents mark has to sit, measured from the list itself.
 *
 * Run from the list's owner, not from the mark: a child's layout effect fires
 * before the `<ol>` ref is attached, so it would measure nothing and the mark
 * would never appear. The list is re-measured when the section under the reader
 * changes and when the column is resized (the entries wrap, so the distance is
 * not a constant).
 */
export function useTocIndicator(
  listRef: RefObject<HTMLOListElement | null>,
  activeId: string
): TocIndicator | null {
  const [indicator, setIndicator] = useState<TocIndicator | null>(null)

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return undefined

    const measure = () => {
      const active = list.querySelector<HTMLElement>('[aria-current="true"]')
      if (!active) return
      // The entry reserves an empty 12px column for the square, so that column
      // is where the mark belongs: measuring the link would place the square
      // above the text, because the entry has vertical padding of its own.
      const slot = active.firstElementChild ?? active
      const top =
        slot.getBoundingClientRect().top - list.getBoundingClientRect().top
      setIndicator((previous) =>
        previous && previous.top === top
          ? previous
          : { top, placed: previous !== null }
      )
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [listRef, activeId])

  return indicator
}
