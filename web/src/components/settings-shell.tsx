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
import type { ReactNode } from 'react'

export type SettingsNavItem = { id: string; label: string }

export type SettingsShellProps = {
  /** Accessible name for the group list. */
  navLabel: string
  items: SettingsNavItem[]
  children: ReactNode
}

/**
 * Settings pages share one shell: the group list on the left of wide screens,
 * a horizontally scrolling strip above the content on phones, and the groups
 * themselves below. Extracted so profile and security cannot drift apart.
 */
export function SettingsShell(props: SettingsShellProps) {
  return (
    <div className='flex w-full flex-col gap-6 lg:grid lg:grid-cols-[216px_minmax(0,1fr)] lg:gap-8'>
      <nav
        aria-label={props.navLabel}
        className='bg-background/95 sticky top-0 z-10 -mt-1 pt-1 pb-1 backdrop-blur lg:sticky lg:top-0 lg:mt-0 lg:self-start lg:bg-transparent lg:pt-0 lg:pb-0 lg:backdrop-blur-none'
      >
        <ul className='no-scrollbar flex gap-4 overflow-x-auto border-b pb-2 lg:flex-col lg:gap-1 lg:border-b-0 lg:pb-0'>
          {props.items.map((item) => (
            <li key={item.id} className='min-w-0 shrink-0 lg:shrink'>
              <a
                href={`#${item.id}`}
                className='text-muted-foreground hover:text-foreground flex min-h-11 items-center text-[13px] whitespace-nowrap transition-colors sm:min-h-8'
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {props.children}
    </div>
  )
}
