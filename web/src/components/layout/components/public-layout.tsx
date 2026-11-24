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
import { useRouter, useRouterState } from '@tanstack/react-router'
import { useReducedMotion } from 'motion/react'
import { useLayoutEffect, useRef, useState } from 'react'

import { usePageTransitionsEnabled } from '@/components/motion/use-page-transitions-enabled'
import { SearchProvider } from '@/context/search-provider'
import { PAGE_TRANSITIONS_ENABLED } from '@/lib/motion'
import { cn } from '@/lib/utils'

import {
  capturePageFrame,
  clearPageFrame,
  readPageFrame,
} from '../lib/page-handoff'
import { PublicFooter } from './public-footer'
import { PublicHeader } from './public-header'

type PublicLayoutProps = {
  children: React.ReactNode
  showMainContainer?: boolean
  siteName?: string
}

/**
 * The leaving page, drawn from the snapshot its own layout handed over.
 *
 * It is already-positioned pixels: no component of the old page is mounted
 * again, so nothing re-fetches, nothing re-subscribes and no timer restarts.
 * The new page is fully in place underneath from its first frame: this layer
 * falls away (`page-handoff`, the same keyframes the View Transition path uses
 * for the leaving body) while the new body rises in, so one page drops out and
 * the other comes up — never an empty frame.
 */
function PageHandoff(props: { snapshot: HTMLElement; onDone: () => void }) {
  return (
    <div
      ref={(host) => {
        if (host && !host.contains(props.snapshot)) host.append(props.snapshot)
      }}
      aria-hidden='true'
      inert
      className='page-handoff pointer-events-none absolute inset-x-0 top-0 z-10'
      onAnimationEnd={(event) => {
        // The snapshot's own (replayed) animations bubble through here too.
        if (event.target === event.currentTarget) props.onDone()
      }}
    />
  )
}

export function PublicLayout(props: PublicLayoutProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const router = useRouter()
  const viewTransitions = usePageTransitionsEnabled()
  const shouldReduce = useReducedMotion()
  // Reduced motion and the page-handoff switch both go instant: no frame is
  // captured, so no handoff layer can be left behind, and the new page simply
  // appears instead of rising in under a falling copy of the old one.
  const handoffAllowed =
    PAGE_TRANSITIONS_ENABLED && !shouldReduce && !viewTransitions
  const pageNode = useRef<HTMLDivElement | null>(null)
  const [handoff, setHandoff] = useState<HTMLElement | null>(null)

  // The previous shell publishes its last frame while it unmounts (below); that
  // commit may finish after this layout's effects run, so look twice.
  useLayoutEffect(() => {
    if (!handoffAllowed) return undefined
    const show = () => {
      const frame = readPageFrame(pathname)
      if (frame) setHandoff(frame)
    }
    show()
    const handle = requestAnimationFrame(show)
    return () => cancelAnimationFrame(handle)
  }, [pathname, handoffAllowed])

  // Keep the frame of the page being removed. The ref is already detached here,
  // so this reads the last node the layout held instead of `ref.current`; and a
  // remount of the same page (the shell swaps branches while data settles) is
  // not a page change, so it must not hand over a copy of itself.
  useLayoutEffect(
    () => () => {
      if (!handoffAllowed) return
      if (router.state.location.pathname === pathname) return
      capturePageFrame(pathname, pageNode.current)
    },
    [pathname, handoffAllowed, router]
  )

  // While a frame of the old page is falling, this page's body comes up under
  // it — the same rise the View Transition gives the entering body.
  const bodyRise = handoff ? 'page-body-enter' : undefined

  const page = (
    <div
      ref={(element) => {
        if (element) pageNode.current = element
      }}
      className='bg-background text-foreground relative flex min-h-svh flex-col overflow-x-clip'
    >
      <PublicHeader />
      {/* The bar floats over the page, so the layout reserves its exact height
          and then gives the body the same gap on every page: 16px on a phone
          and 24px from the small breakpoint up. Pages never guess it. */}
      <div
        data-slot='header-spacer'
        className='h-(--app-header-height,3.5rem) shrink-0'
        aria-hidden='true'
      />

      {props.showMainContainer !== false ? (
        <main
          data-vt-name='page-body'
          className={cn('container px-4 pt-4 pb-6 md:px-4 md:pt-6', bodyRise)}
        >
          {props.children}
        </main>
      ) : (
        // A public page is full-bleed here: the body layer is this wrapper, so
        // the header above and the footer below keep their own identity.
        <div
          data-vt-name='page-body'
          className={cn('flex min-h-0 flex-1 flex-col pt-4 md:pt-6', bodyRise)}
        >
          {props.children}
        </div>
      )}

      <PublicFooter siteName={props.siteName} />

      {handoff && (
        <PageHandoff
          snapshot={handoff}
          onDone={() => {
            setHandoff(null)
            clearPageFrame()
          }}
        />
      )}
    </div>
  )

  // The search box is part of the bar on every page, so the palette it opens
  // is always mounted; the result types that need an account stay empty until
  // there is one.
  return <SearchProvider>{page}</SearchProvider>
}
