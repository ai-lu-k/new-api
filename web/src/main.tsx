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
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'

import { EnvironmentRecoveryBoundary } from '@/features/environment/components/environment-recovery-boundary'
import { resolvePageTransitionDirection } from '@/hooks/use-page-transition-direction'
import { installBuildMetadata } from '@/lib/build-metadata'
import { applyFaviconToDom } from '@/lib/dom-utils'
import '@/lib/dayjs'
import { initializeFrontendCache } from '@/lib/frontend-cache'
import {
  PAGE_TRANSITIONS_ENABLED,
  pageTransitionsEnabled,
  prefersReducedMotion,
  REDUCED_MOTION_QUERY,
} from '@/lib/motion'
import { pageTitle } from '@/lib/page-title'
import { createAppQueryClient } from '@/lib/query-client'
import { readCachedStatus, statusQueryOptions } from '@/lib/status-query'

import { DirectionProvider } from './context/direction-provider'
import { FontProvider } from './context/font-provider'
import { ThemeProvider } from './context/theme-provider'
import i18n from './i18n/config'
// Generated Routes
import { routeTree } from './routeTree.gen'

// Styles
import './styles/index.css'

// Ensure VChart theme is initialized before any chart mounts (prevents white default theme flash)
// VChart theme is driven by our ThemeProvider (html.light/html.dark) via per-chart `theme` prop.
initializeFrontendCache()
installBuildMetadata()

// The switch also has to reach CSS: the page-handoff frame classes stay dormant
// while this attribute says `off`. Setting `PAGE_TRANSITIONS_ENABLED` back to
// true flips it to `on` and brings the handoff styles back.
document.documentElement.dataset.motionHandoffs = PAGE_TRANSITIONS_ENABLED
  ? 'on'
  : 'off'

const queryClient = createAppQueryClient(() => {
  void router.navigate({ to: '/500' })
})

// Create a new router instance

/**
 * Route navigations run inside `document.startViewTransition`, so the browser
 * hands the old page over to the new one instead of swapping it (see
 * `styles/swiss.css`, L1). `types` carries the direction for the CSS and can
 * return `false`, which makes the router skip the View Transition entirely —
 * that is how a mid-session reduced-motion switch is honoured without leaving
 * a half-finished `::view-transition` group behind.
 *
 * `pageTransitionsEnabled()` is `false` while `PAGE_TRANSITIONS_ENABLED` is off,
 * so a navigation is a plain commit: no snapshot, no body fall/rise.
 */
function defaultViewTransition() {
  return pageTransitionsEnabled() ? { types: viewTransitionTypes } : false
}

function viewTransitionTypes(info: {
  fromLocation?: { pathname: string }
  toLocation: { pathname: string }
}): string[] | false {
  if (prefersReducedMotion()) return false
  return [
    resolvePageTransitionDirection(
      info.fromLocation?.pathname,
      info.toLocation.pathname
    ),
  ]
}

const baseRouterOptions = {
  context: { queryClient },
  defaultPreload: 'intent' as const,
  defaultPreloadStaleTime: 0,
}

const router = createRouter({
  routeTree,
  ...baseRouterOptions,
  defaultViewTransition: defaultViewTransition(),
})

// The direction is also published on <html> before the navigation commits, so
// the CSS can pick the entering side and the motion fallback (browsers without
// View Transitions) reads the same value. With the handoff switched off nothing
// reads that attribute, so the side effect is not registered at all.
if (PAGE_TRANSITIONS_ENABLED) {
  router.subscribe('onBeforeNavigate', (event) => {
    const direction = resolvePageTransitionDirection(
      event.fromLocation?.pathname,
      event.toLocation.pathname
    )
    document.documentElement.dataset.pageTransitionDirection = direction
  })
}

// The reader can flip the system switch while the app is open: re-arm the
// router so a later navigation stops (or starts) using View Transitions.
if (typeof window.matchMedia === 'function') {
  window.matchMedia(REDUCED_MOTION_QUERY).addEventListener('change', () => {
    router.update({
      routeTree,
      ...baseRouterOptions,
      defaultViewTransition: defaultViewTransition(),
    })
  })
}

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.querySelector<HTMLElement>('#root')
if (!rootElement) {
  throw new Error('Root element not found')
}
// Set document.title and favicon from cached status, then refresh from network
;(function initSystemBranding() {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const apply = (name: string, homeTitle?: unknown) => {
      const title = pageTitle(
        window.location.pathname,
        { name, homeTitle: typeof homeTitle === 'string' ? homeTitle : '' },
        (key) => i18n.t(key)
      )
      document.title = title
      const metaTitle = document.querySelector(
        'meta[name="title"]'
      ) as HTMLMetaElement | null
      if (metaTitle) metaTitle.setAttribute('content', title)
    }
    // Cache-first
    const cached = readCachedStatus()
    if (cached?.system_name) {
      apply(cached.system_name as string, cached.home_title)
    }
    if (cached?.logo) applyFaviconToDom(cached.logo as string)

    // Background refresh through the shared cache. This primes ['status']
    // before React mounts, so the root guard and every status consumer reuse
    // this one request instead of firing their own. `fetchStatus` owns the
    // localStorage write and the system-config store sync.
    queryClient
      .ensureQueryData(statusQueryOptions)
      .then((s) => {
        if (s?.system_name) apply(s.system_name as string, s.home_title)
        if (s?.logo) applyFaviconToDom(s.logo as string)
      })
      .catch(() => {
        /* empty */
      })
  } catch {
    /* empty */
  }
})()
// The server may have put the page's text in the root for clients that do not
// run scripts (see service/sitepage); rendering replaces it.
const prerendered =
  rootElement.querySelector(':scope > [data-prerender]') !== null
if (!rootElement.innerHTML || prerendered) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <FontProvider>
            <DirectionProvider>
              <EnvironmentRecoveryBoundary>
                <RouterProvider router={router} />
              </EnvironmentRecoveryBoundary>
            </DirectionProvider>
          </FontProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
