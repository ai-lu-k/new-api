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
import { useLayoutEffect } from 'react'

import { AnimatedOutlet } from '@/components/page-transition'
import { SkipToMain } from '@/components/skip-to-main'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { SearchProvider } from '@/context/search-provider'
import { LegalGate } from '@/features/legal/legal-gate'
import { CouponArrivalDialog } from '@/features/token-plan/components/coupon-arrival-dialog'
import { cn } from '@/lib/utils'

import { clearPageFrame } from '../lib/page-handoff'
import { AppSidebar } from './app-sidebar'
import { PublicHeader } from './public-header'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

/** The sidebar stays open: there is nothing to remember or to toggle. */
function keepSidebarOpen() {}

export function AuthenticatedLayout(props: AuthenticatedLayoutProps) {
  // A public page left its last frame for the next public page; a console page
  // is not that page, so the frame must not surface on a later public visit.
  useLayoutEffect(() => clearPageFrame(), [])

  return (
    <SearchProvider>
      <SidebarProvider
        open
        onOpenChange={keepSidebarOpen}
        className='flex-col'
        style={{ '--sidebar-width': '13.5rem' } as React.CSSProperties}
      >
        <SkipToMain />
        {/* The same header as the public pages. On a narrow screen the
            sidebar is a drawer, opened from the button before the logo — the
            one thing this bar adds. */}
        <PublicHeader
          pageControl={<SidebarTrigger className='ms-1 size-8 md:hidden' />}
        />
        <div
          data-slot='header-spacer'
          className='h-(--app-header-height,3.5rem) shrink-0'
          aria-hidden='true'
        />
        <div className='flex min-h-0 w-full flex-1'>
          <AppSidebar />
          <SidebarInset
            className={cn(
              '@container/content',
              'h-[calc(100svh-var(--app-header-height,0px))]',
              'min-h-0 overflow-hidden'
            )}
          >
            <LegalGate>{props.children ?? <AnimatedOutlet />}</LegalGate>
          </SidebarInset>
        </div>
      </SidebarProvider>
      {/* Sealed vouchers the account still owns announce themselves once the
          console is open, on whatever page the owner landed on. */}
      <CouponArrivalDialog />
    </SearchProvider>
  )
}
