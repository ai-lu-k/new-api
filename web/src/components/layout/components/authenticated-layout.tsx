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
import { AnimatedOutlet } from '@/components/page-transition'
import { SkipToMain } from '@/components/skip-to-main'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { SearchProvider } from '@/context/search-provider'
import { cn } from '@/lib/utils'

import { AppSidebar } from './app-sidebar'
import { PublicHeader } from './public-header'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

/** The sidebar stays open: there is nothing to remember or to toggle. */
function keepSidebarOpen() {}

export function AuthenticatedLayout(props: AuthenticatedLayoutProps) {
  return (
    <SearchProvider>
      <SidebarProvider open onOpenChange={keepSidebarOpen} className='flex-col'>
        <SkipToMain />
        {/* The same header as the public pages. On a narrow screen the
            sidebar is a drawer, opened from the button before the logo. */}
        <PublicHeader
          showSearch
          activeHref='/dashboard'
          leading={<SidebarTrigger className='-ms-1 size-8 md:hidden' />}
        />
        <div className='h-(--app-header-height) shrink-0' aria-hidden='true' />
        <div className='flex min-h-0 w-full flex-1'>
          <AppSidebar />
          <SidebarInset
            className={cn(
              '@container/content',
              'h-[calc(100svh-var(--app-header-height,0px))]',
              'min-h-0 overflow-hidden'
            )}
          >
            {props.children ?? <AnimatedOutlet />}
          </SidebarInset>
        </div>
      </SidebarProvider>
    </SearchProvider>
  )
}
