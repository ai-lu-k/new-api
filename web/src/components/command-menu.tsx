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
import { useLocation, useNavigate } from '@tanstack/react-router'
import { ChevronRight, Laptop, Moon, Sun } from 'lucide-react'
import React, { type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useSearch } from '@/context/search-provider'
import { useTheme } from '@/context/theme-provider'
import { useSidebarData } from '@/hooks/use-sidebar-data'

import { getNavGroupsForPath } from './layout/lib/sidebar-view-registry'
import { ScrollArea } from './ui/scroll-area'

export function CommandMenu() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setTheme } = useTheme()
  const { open, setOpen } = useSearch()
  const { pathname } = useLocation()
  const sidebarData = useSidebarData()

  // Use the active nested sidebar view's nav groups when one matches
  // the current URL; otherwise fall back to the root navigation.
  const navGroups = getNavGroupsForPath(pathname, t) ?? sidebarData.navGroups

  const runCommand = React.useCallback(
    (command: () => unknown) => {
      setOpen(false)
      command()
    },
    [setOpen]
  )

  // Rows arrive 10ms apart, capped at eight: the list lands with the panel
  // instead of trailing behind it (see `[data-motion-panel='feedback']`).
  let rowIndex = 0
  const rowStyle = () =>
    ({ '--motion-row-index': Math.min(rowIndex++, 7) }) as CSSProperties

  return (
    <CommandDialog
      modal
      open={open}
      onOpenChange={setOpen}
      title={t('Command')}
      description={t('Search')}
    >
      <Command>
        <CommandInput placeholder={t('Type a command or search...')} />
        <CommandList>
          <ScrollArea className='h-72 pe-1'>
            <CommandEmpty>{t('No results found.')}</CommandEmpty>
            {navGroups.map((group) => (
              <CommandGroup key={group.id || group.title} heading={group.title}>
                {group.items.map((navItem) => {
                  // Same icons as the sidebar: they make the row scannable and
                  // replace the placeholder arrow that read as a stray glyph.
                  const ItemIcon = navItem.icon

                  if (navItem.url) {
                    return (
                      <CommandItem
                        key={navItem.url}
                        value={navItem.title}
                        data-motion-row=''
                        style={rowStyle()}
                        onSelect={() => {
                          runCommand(() => navigate({ to: navItem.url }))
                        }}
                      >
                        {ItemIcon ? (
                          <ItemIcon
                            aria-hidden='true'
                            className='text-muted-foreground size-4 shrink-0'
                          />
                        ) : null}
                        {navItem.title}
                      </CommandItem>
                    )
                  }

                  return navItem.items?.map((subItem) => (
                    <CommandItem
                      key={`${navItem.title}-${subItem.url}`}
                      value={`${navItem.title}-${subItem.url}`}
                      data-motion-row=''
                      style={rowStyle()}
                      onSelect={() => {
                        runCommand(() => navigate({ to: subItem.url }))
                      }}
                    >
                      {ItemIcon ? (
                        <ItemIcon
                          aria-hidden='true'
                          className='text-muted-foreground size-4 shrink-0'
                        />
                      ) : null}
                      {navItem.title}
                      <ChevronRight
                        aria-hidden='true'
                        className='text-muted-foreground size-3 shrink-0'
                      />
                      {subItem.title}
                    </CommandItem>
                  ))
                })}
              </CommandGroup>
            ))}
            <CommandSeparator />
            <CommandGroup heading={t('Theme')}>
              <CommandItem
                data-motion-row=''
                style={rowStyle()}
                onSelect={() => runCommand(() => setTheme('light'))}
              >
                <Sun /> <span>{t('Light')}</span>
              </CommandItem>
              <CommandItem
                data-motion-row=''
                style={rowStyle()}
                onSelect={() => runCommand(() => setTheme('dark'))}
              >
                <Moon className='scale-90' />
                <span>{t('Dark')}</span>
              </CommandItem>
              <CommandItem
                data-motion-row=''
                style={rowStyle()}
                onSelect={() => runCommand(() => setTheme('system'))}
              >
                <Laptop />
                <span>{t('System')}</span>
              </CommandItem>
            </CommandGroup>
          </ScrollArea>
        </CommandList>
        {/* Keyboard hints: the list is fully operable without the mouse, and
            the panel says so instead of leaving it to be discovered. */}
        <div className='text-muted-foreground flex items-center gap-3 border-t px-3 py-2 text-[11px]'>
          <span className='flex items-center gap-1'>
            <kbd className='bg-muted rounded-sm px-1 py-0.5 font-sans'>↑↓</kbd>
            {t('Select')}
          </span>
          <span className='flex items-center gap-1'>
            <kbd className='bg-muted rounded-sm px-1 py-0.5 font-sans'>↵</kbd>
            {t('Open')}
          </span>
          <span className='flex items-center gap-1'>
            <kbd className='bg-muted rounded-sm px-1 py-0.5 font-sans'>Esc</kbd>
            {t('Close')}
          </span>
        </div>
      </Command>
    </CommandDialog>
  )
}
