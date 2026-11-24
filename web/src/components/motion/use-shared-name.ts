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
import { useLayoutEffect, useState, type CSSProperties } from 'react'

/**
 * Shared-element names for list ↔ detail handoffs (L2).
 *
 * A `view-transition-name` may only exist once per snapshot. When two elements
 * claim the same name the browser drops the whole group (the element looks
 * like it is replaced by a full-page copy), so naming goes through this module
 * instead of being written by hand:
 *
 * - `sharedElementName()` builds the one name both sides agree on.
 * - `useSharedName()` claims it and steps aside when another live element
 *   already holds it (the first one in document order wins).
 *
 * Usage — the row and its detail both call the same helper, and the row stops
 * claiming the name while the detail is open:
 *
 * ```tsx
 * const name = sharedElementName('card', key)
 * const rowName = useSharedName(detailOpen ? undefined : name)
 * const detailName = useSharedName(detailOpen ? name : undefined)
 * // <tr {...rowName}> … <div {...detailName}>
 * ```
 */
export function sharedElementName(kind: string, key: string | number): string {
  // A transition name must match <custom-ident>, so anything that is not
  // alphanumeric becomes a dash: ids with dots or slashes would be invalid.
  const slug = String(key).replaceAll(/[^a-zA-Z0-9_-]+/g, '-')
  return `${kind}-${slug}`
}

export type SharedNameProps = {
  'data-vt-name'?: string
  style?: CSSProperties
  /** Callback ref (not a RefObject) so it fits any element type. */
  ref?: (element: HTMLElement | null) => void
}

/**
 * Claim `name` for the element it is spread onto.
 *
 * @param name Shared element name, already built with `sharedElementName()`.
 *   Pass `undefined` to not take part in the transition at all (for example
 *   the list row while the detail panel is open).
 * @returns Props to spread on the element: the claim attribute plus, when a
 *   duplicate exists, an inline override that drops this element's name.
 */
export function useSharedName(name: string | undefined): SharedNameProps {
  const [element, setElement] = useState<HTMLElement | null>(null)
  const [conflict, setConflict] = useState(false)

  useLayoutEffect(() => {
    if (!name || !element) {
      setConflict(false)
      return
    }
    const claimed = [
      ...document.querySelectorAll<HTMLElement>(
        `[data-vt-name="${CSS.escape(name)}"]`
      ),
    ]
    // First in document order keeps the name; everyone else steps aside.
    setConflict(claimed.length > 1 && claimed[0] !== element)
  }, [element, name])

  if (!name) return {}

  return {
    'data-vt-name': name,
    // Dynamic names cannot be mapped from an attribute in CSS, so the name is
    // written inline; a duplicate neutralises it instead of breaking the group.
    style: { viewTransitionName: conflict ? 'none' : name },
    ref: (element: HTMLElement | null) => setElement(element),
  }
}
