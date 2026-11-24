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
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useLayoutEffect, useRef, useState } from 'react'

import { Sidebar, SidebarContent, SidebarFooter } from '@/components/ui/sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSidebarView } from '@/hooks/use-sidebar-view'
import { MOTION_MS, MOTION_TRANSITION, MOTION_VARIANTS } from '@/lib/motion'

import { rootNavGroups } from '../lib/root-nav-groups'
import {
  measureSelectedRow,
  type SelectedRow,
} from '../lib/sidebar-view-registry'
import { NavGroup } from './nav-group'
import { SidebarAccount } from './sidebar-account'
import { SidebarViewHeader } from './sidebar-view-header'

/** One 220ms `--ease-morph` move for the mark's box. */
const MARK_TRANSITION = `transform ${MOTION_MS.base}ms var(--ease-morph), width ${MOTION_MS.base}ms var(--ease-morph), height ${MOTION_MS.base}ms var(--ease-morph)`

type Indicator = SelectedRow & { travelled: boolean }

const sameBox = (a: SelectedRow, b: SelectedRow) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

/**
 * Where the one selection mark has to sit.
 *
 * The rows used to paint a black block each, so the selection blinked from line
 * to line; one block moved with `translate3d` keeps it a single object in
 * motion, like the tutorial contents mark. It hangs off the nav container (a
 * row's layout effect runs before its ref exists) and re-measures every render,
 * since a route change re-renders this component without changing any prop.
 */
function useNavIndicator(
  container: HTMLDivElement | null,
  scope: string
): Indicator | null {
  const [indicator, setIndicator] = useState<Indicator | null>(null)
  const selected = useRef<string | null>(null)
  const navTree = useRef<string | null>(null)

  // `container` is state, not a ref: the narrow-screen drawer mounts its nav
  // only once it opens, and a ref would not tell this hook that it appeared.
  useLayoutEffect(() => {
    if (!container) return undefined

    const measure = () => {
      const row = measureSelectedRow(container)
      // Only the selection moving inside one nav tree earns a travel: a new
      // tree, a resize or a folding group just re-places the mark.
      const travelled =
        navTree.current === scope &&
        selected.current !== null &&
        selected.current !== (row?.id ?? null)
      selected.current = row?.id ?? null
      navTree.current = scope

      setIndicator((previous) => {
        if (!row) return null
        if (previous && sameBox(previous, row)) return previous
        return { ...row, travelled }
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  })

  return indicator
}

/**
 * The black mark that travels to the selected row. Square, and first in the
 * tree: every row paints over it, so it stays above the row backgrounds
 * (transparent while selected) and below the row text.
 */
function SidebarNavIndicator(props: {
  indicator: Indicator | null
  reduceMotion: boolean
}) {
  if (!props.indicator) return null

  const mark = props.indicator

  return (
    <span
      aria-hidden='true'
      data-slot='sidebar-nav-indicator'
      className='bg-foreground pointer-events-none absolute top-0 left-0 z-0'
      style={{
        width: mark.width,
        height: mark.height,
        transform: `translate3d(${mark.x}px, ${mark.y}px, 0)`,
        transition:
          mark.travelled && !props.reduceMotion ? MARK_TRANSITION : 'none',
      }}
    />
  )
}

/**
 * Application sidebar.
 *
 * Adopts the Vercel / Cloudflare "drill-in" pattern: the URL drives
 * which sidebar *view* is rendered. Clicking a top-level entry like
 * `System Settings` swaps the sidebar to a contextual workspace —
 * with a `← Back to Dashboard` affordance — instead of stacking the
 * sub-navigation inside the root tree.
 *
 * Architecture:
 *   - View resolution + filtering: {@link useSidebarView}
 *   - View registry: `layout/lib/sidebar-view-registry.ts`
 *   - Per-view header: {@link SidebarViewHeader}
 *   - Selection mark: {@link SidebarNavIndicator}
 *
 * Adding a new nested view only requires registering a {@link SidebarView}
 * in the registry; this component requires no changes.
 */
export function AppSidebar() {
  const { key, view, navGroups } = useSidebarView()
  const isMobile = useIsMobile()
  const shouldReduce = useReducedMotion()
  const [nav, setNav] = useState<HTMLDivElement | null>(null)
  const indicator = useNavIndicator(nav, key)
  const groups = view ? navGroups : rootNavGroups(navGroups)

  return (
    <Sidebar collapsible='icon' variant='sidebar'>
      {view && <SidebarViewHeader view={view} />}

      <SidebarContent className='px-2 py-2 xl:pt-7 [&_[data-sidebar=menu-button]]:xl:h-11 [&_[data-sidebar=menu-button]>svg]:xl:hidden [&_[data-slot=sidebar-group]]:xl:pb-5'>
        <div ref={setNav} className='relative flex flex-col'>
          <SidebarNavIndicator
            indicator={indicator}
            reduceMotion={shouldReduce ?? false}
          />
          <AnimatePresence mode='wait' initial={false}>
            <motion.div
              key={key}
              initial={
                shouldReduce ? false : MOTION_VARIANTS.sidebarSlide.initial
              }
              animate={MOTION_VARIANTS.sidebarSlide.animate}
              exit={
                shouldReduce ? undefined : MOTION_VARIANTS.sidebarSlide.exit
              }
              transition={MOTION_TRANSITION.fast}
              className='flex flex-col'
            >
              {groups.map((props) => (
                <NavGroup key={props.id || props.title} {...props} />
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </SidebarContent>
      {/* The narrow-screen drawer carries the account area the header hides. */}
      {isMobile ? <SidebarAccount /> : null}
      <SidebarFooter className='hidden px-7 py-7 xl:flex'>
        <span className='text-sm font-bold'>new-api</span>
        <a
          className='text-muted-foreground text-xs hover:underline'
          href='https://github.com/QuantumNous/new-api'
        >
          © QuantumNous
        </a>
      </SidebarFooter>
    </Sidebar>
  )
}
