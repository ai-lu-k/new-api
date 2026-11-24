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
import { useEffect, useState } from 'react'

/** The sticky header hides this much of the reading area. */
const HEADER_OFFSET = '88px'

/**
 * Which section the reader is in, for the contents list.
 *
 * The browser reports which sections cross the reading area instead of the page
 * measuring every section again on scroll: the topmost intersecting section is
 * the one being read. Browsers without IntersectionObserver keep the first
 * section marked, which is what the reader sees before scrolling anyway.
 */
export function useActiveSection(ids: string[]): string {
  const [activeId, setActiveId] = useState(() => ids[0] ?? '')

  // The sections are assembled after the first render (their bodies are
  // components), so the initial id can be missing. Mark the first section as
  // soon as the list exists: the reader starts at the top, and the contents
  // must not sit unmarked until the first scroll.
  useEffect(() => {
    if (ids.length > 0 && !ids.includes(activeId)) setActiveId(ids[0])
  }, [ids, activeId])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined

    const sections = ids
      .map((id) => document.querySelector(`#${id}`))
      .filter((element): element is HTMLElement => element !== null)
    if (sections.length === 0) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting)
        if (visible.length === 0) return
        const topmost = visible.reduce((closest, entry) =>
          entry.boundingClientRect.top < closest.boundingClientRect.top
            ? entry
            : closest
        )
        setActiveId(topmost.target.id)
      },
      { rootMargin: `-${HEADER_OFFSET} 0px -60% 0px` }
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [ids])

  return activeId
}
