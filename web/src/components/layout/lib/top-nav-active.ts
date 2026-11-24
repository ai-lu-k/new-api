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
import type { MouseEvent } from 'react'

import type { TopNavLink } from '../types'

/**
 * One current-page rule for the whole site: a link is current on its own URL
 * and on everything under it, so `/dashboard/overview` marks the console link
 * without any layout having to hand the header a hard-coded match.
 */
export function isTopNavLinkActive(
  pathname: string,
  link: TopNavLink
): boolean {
  if (link.external) return false
  const href = link.href.split('?')[0]
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * The activation rule the bar and its folded menu share: a disabled link stays
 * where it is, and a link that needs an account asks for one instead.
 */
export function activateTopNavLink(
  event: MouseEvent<HTMLAnchorElement>,
  link: TopNavLink,
  onRequiresAuth: (link: TopNavLink) => void
) {
  if (link.disabled) {
    event.preventDefault()
    return
  }
  if (link.requiresAuth) {
    event.preventDefault()
    onRequiresAuth(link)
  }
}
