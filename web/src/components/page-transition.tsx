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
import { Outlet, useRouterState } from '@tanstack/react-router'
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
  type Variants,
} from 'motion/react'
import type { ReactNode } from 'react'

import { usePageTransitionsEnabled } from '@/components/motion/use-page-transitions-enabled'
import {
  MOTION_DURATION,
  MOTION_EASE,
  MOTION_SHIFT,
  MOTION_TRANSITION,
  MOTION_VARIANTS,
  PAGE_TRANSITIONS_ENABLED,
  CARD_ITEM_VARIANTS,
  CARD_STAGGER_VARIANTS,
  STAGGER_ITEM_VARIANTS,
  STAGGER_VARIANTS,
  TABLE_ROW_VARIANTS,
  TABLE_STAGGER_VARIANTS,
} from '@/lib/motion'
import { cn } from '@/lib/utils'

/**
 * The outgoing body falls one page step plus one section step (40px) — the
 * same distance `page-body-out` (styles/swiss.css) uses, composed from the
 * tokens instead of a new literal.
 */
const PAGE_FALL_SHIFT = MOTION_SHIFT.page + MOTION_SHIFT.section

/**
 * Page-level slot used by the three public pages that used to fade themselves
 * in. The handoff is global now (L1 View Transitions, or `AnimatedOutlet`'s
 * fallback), so this wrapper only carries layout: animating here as well would
 * double-move the page.
 */
interface PageTransitionProps {
  children: ReactNode
  className?: string
}

export function PageTransition(props: PageTransitionProps) {
  return <div className={props.className}>{props.children}</div>
}

/**
 * Route content slot.
 *
 * With View Transitions the browser animates the handoff (chrome and shared
 * elements travel, the page body falls out and the next one rises in), so the
 * outlet is a plain flex column — adding motion here would fight the snapshot.
 * Without them (Safari/Firefox without the API), `AnimatePresence
 * mode='popLayout'` keeps the outgoing page mounted, absolutely positioned and
 * `pointer-events: none`, until the incoming page is in place, and the same two
 * movements run in the DOM: the old page drops away, the new one comes up.
 *
 * 2026-11-05: mei took that handoff offline (`PAGE_TRANSITIONS_ENABLED`), so the
 * outlet is now a plain container on every path — the fallback stops cloning the
 * outgoing page and the route is no longer keyed into a remount animation.
 */
export function AnimatedOutlet() {
  const shouldReduce = useReducedMotion()
  const viewTransitions = usePageTransitionsEnabled()
  // Key the page transition by the matched route id, not the resolved pathname.
  // Navigating between params of the same route (e.g. dashboard tabs served by
  // /dashboard/$section) then re-renders in place instead of remounting the
  // route component and discarding its state (such as the selected time range).
  const routeKey = useRouterState({
    select: (s) => s.matches.at(-1)?.routeId ?? s.location.pathname,
  })

  // Pages that draw their own `page-body` layer (every SectionPageLayout page)
  // make this wrapper step aside, so the two never claim the same name.
  if (!PAGE_TRANSITIONS_ENABLED || viewTransitions || shouldReduce) {
    return (
      <div data-page-outlet='' className='flex min-h-0 flex-1 flex-col'>
        <Outlet />
      </div>
    )
  }

  return (
    <div className='relative flex min-h-0 flex-1 flex-col'>
      <AnimatePresence mode='popLayout' initial={false}>
        <PagePane key={routeKey}>
          <Outlet />
        </PagePane>
      </AnimatePresence>
    </div>
  )
}

interface PagePaneProps {
  children: ReactNode
}

/** One page while `AnimatePresence` holds it: entering, or on its way out. */
function PagePane(props: PagePaneProps) {
  const isPresent = useIsPresent()

  // With the handoff switched off the pane is a plain slot: nothing rises,
  // nothing falls, and no exit clone is left behind.
  if (!PAGE_TRANSITIONS_ENABLED) {
    return <div className='flex min-h-0 flex-1 flex-col'>{props.children}</div>
  }

  return (
    <motion.div
      initial={{ opacity: 0.6, y: -MOTION_SHIFT.page }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        y: PAGE_FALL_SHIFT,
        transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.in },
      }}
      transition={{ duration: MOTION_DURATION.slow, ease: MOTION_EASE.out }}
      // A page that is leaving must not swallow clicks meant for the new one.
      className={cn(
        'flex min-h-0 flex-1 flex-col',
        !isPresent && 'pointer-events-none'
      )}
      style={isPresent ? undefined : { position: 'absolute', inset: 0 }}
    >
      {props.children}
    </motion.div>
  )
}

interface StaggerContainerProps {
  children: ReactNode
  className?: string
  variants?: Variants
}

export function StaggerContainer(props: StaggerContainerProps) {
  const shouldReduce = useReducedMotion()

  if (shouldReduce) {
    return <div className={props.className}>{props.children}</div>
  }

  return (
    <motion.div
      variants={props.variants ?? STAGGER_VARIANTS}
      initial='initial'
      animate='animate'
      className={props.className}
    >
      {props.children}
    </motion.div>
  )
}

interface StaggerItemProps {
  children: ReactNode
  className?: string
  variants?: Variants
}

export function StaggerItem(props: StaggerItemProps) {
  return (
    <motion.div
      variants={props.variants ?? STAGGER_ITEM_VARIANTS}
      className={props.className}
    >
      {props.children}
    </motion.div>
  )
}

export function TableStaggerContainer(props: StaggerContainerProps) {
  const shouldReduce = useReducedMotion()

  if (shouldReduce) {
    return <tbody className={props.className}>{props.children}</tbody>
  }

  return (
    <motion.tbody
      variants={TABLE_STAGGER_VARIANTS}
      initial='initial'
      animate='animate'
      className={props.className}
    >
      {props.children}
    </motion.tbody>
  )
}

export function TableStaggerRow(props: StaggerItemProps) {
  return (
    <motion.tr variants={TABLE_ROW_VARIANTS} className={props.className}>
      {props.children}
    </motion.tr>
  )
}

export function CardStaggerContainer(props: StaggerContainerProps) {
  const shouldReduce = useReducedMotion()

  if (shouldReduce) {
    return <div className={props.className}>{props.children}</div>
  }

  return (
    <motion.div
      variants={CARD_STAGGER_VARIANTS}
      initial='initial'
      animate='animate'
      className={props.className}
    >
      {props.children}
    </motion.div>
  )
}

export function CardStaggerItem(props: StaggerItemProps) {
  return (
    <motion.div variants={CARD_ITEM_VARIANTS} className={props.className}>
      {props.children}
    </motion.div>
  )
}

interface FadeInProps {
  children: ReactNode
  className?: string
  delay?: number
}

export function FadeIn(props: FadeInProps) {
  const shouldReduce = useReducedMotion()

  if (shouldReduce) {
    return <div className={props.className}>{props.children}</div>
  }

  return (
    <motion.div
      initial={MOTION_VARIANTS.fadeIn.initial}
      animate={MOTION_VARIANTS.fadeIn.animate}
      transition={{
        ...MOTION_TRANSITION.default,
        delay: props.delay,
      }}
      className={props.className}
    >
      {props.children}
    </motion.div>
  )
}
