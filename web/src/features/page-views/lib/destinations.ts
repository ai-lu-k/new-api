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
import type { NavGroup, NavItem } from '@/components/layout/types'

/** A navigation item that can stand in for a ranked page. */
export type NavDestination = {
  url: string
  title: string
  icon?: NavItem['icon']
}

/**
 * Flatten the navigation into the destinations a shortcut may point at.
 *
 * Only direct links are destinations: the dynamic chat-preset entry has no
 * stable URL, and collapsible parents are containers rather than pages.
 */
export function collectDestinations(navGroups: NavGroup[]): NavDestination[] {
  const destinations: NavDestination[] = []
  for (const group of navGroups) {
    for (const item of group.items) {
      if (!('url' in item) || !item.url) continue
      destinations.push({ url: item.url, title: item.title, icon: item.icon })
    }
  }
  return destinations
}
