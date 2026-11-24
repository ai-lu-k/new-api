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
import type { TutorialStep } from '../types'

export type TutorialSearchHit = {
  id: string
  number: string
  title: string
  /** The words around the match, so a hit can be judged without opening it. */
  snippet: string
}

/** How much of the section on either side of the match the snippet keeps. */
const SNIPPET_RADIUS = 28
/** One character is not a query yet; two characters already narrow the page. */
export const MIN_QUERY_LENGTH = 2

function snippetAround(text: string, at: number, length: number): string {
  const start = Math.max(0, at - SNIPPET_RADIUS)
  const end = Math.min(text.length, at + length + SNIPPET_RADIUS)
  const head = start > 0 ? '…' : ''
  const tail = end < text.length ? '…' : ''
  return `${head}${text.slice(start, end).trim()}${tail}`
}

/**
 * Finds the sections of the tutorial that contain the query. It reads the
 * rendered page rather than a second copy of the copy, so a section can never
 * drift out of the index: whatever the reader sees is what is searched.
 */
export function searchTutorial(
  root: ParentNode,
  steps: TutorialStep[],
  query: string,
  limit = 6
): TutorialSearchHit[] {
  const needle = query.trim().toLowerCase()
  if (needle.length < MIN_QUERY_LENGTH) return []

  const hits: TutorialSearchHit[] = []
  for (const step of steps) {
    const section = root.querySelector<HTMLElement>(`#${step.id}`)
    if (!section) continue
    // The body is the last child: the heading above it is already on screen in
    // the hit itself, so quoting it back would only repeat the title.
    const body = section.querySelector<HTMLElement>(':scope > div:last-child')
    const text = (body?.textContent ?? section.textContent ?? '')
      .replaceAll(/\s+/g, ' ')
      .trim()
    const at = text.toLowerCase().indexOf(needle)
    const inTitle = step.title.toLowerCase().includes(needle)
    if (at < 0 && !inTitle) continue
    hits.push({
      id: step.id,
      number: step.number,
      title: step.title,
      snippet:
        at >= 0
          ? snippetAround(text, at, needle.length)
          : snippetAround(text, 0, 0),
    })
    if (hits.length === limit) break
  }
  return hits
}
