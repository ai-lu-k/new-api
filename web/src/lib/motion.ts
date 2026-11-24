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
import type { Transition, Variants } from 'motion/react'

/**
 * Motion tokens — the single source for every duration and easing in the app.
 *
 * The same values are exposed as CSS custom properties in `styles/swiss.css`
 * (`--motion-fast`, `--motion-base`, `--motion-slow`, `--ease-out`,
 * `--ease-in`, `--ease-morph`). Components must consume one of the two:
 * never write a bare millisecond value in a component.
 *
 * Scale of the durations
 *   fast  140ms — micro feedback (button press, switch, row hover, copy)
 *   base  220ms — overlays, tab content, list items
 *   slow  320ms — page handoff, drawers, shared-element morphs
 */
export const MOTION_MS = {
  instant: 0,
  fast: 140,
  base: 220,
  slow: 320,
} as const

/** Same durations in seconds, which is what `motion` expects. */
export const MOTION_DURATION = {
  instant: 0,
  fast: 0.14,
  base: 0.22,
  slow: 0.32,
} as const

/** Enter, exit and morph easings. No spring: the contract forbids overshoot. */
export const MOTION_EASE = {
  out: [0.22, 1, 0.36, 1] as const,
  in: [0.4, 0, 1, 1] as const,
  morph: [0.65, 0, 0.35, 1] as const,
}

/** Displacement scale in px: micro 4, control 8, section 16, page 24. */
export const MOTION_SHIFT = {
  micro: 4,
  control: 8,
  section: 16,
  page: 24,
} as const

export const MOTION_TRANSITION: Record<string, Transition> = {
  default: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out },
  fast: { duration: MOTION_DURATION.fast, ease: MOTION_EASE.out },
  base: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out },
  slow: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  enter: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  exit: { duration: MOTION_DURATION.fast, ease: MOTION_EASE.in },
  morph: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.morph },
  none: { duration: MOTION_DURATION.instant },
}

/**
 * Page handoff does not use these variants: the route-level View Transition
 * drops the old body (`page-body-out`) and raises the new one (`page-body-in`),
 * see `.agents/design/ui-motion.md` §10.2. The variants below stay for the
 * overlays and lists that hand off inside a single page.
 */
export const MOTION_VARIANTS = {
  fadeIn: {
    initial: { opacity: 0.65 },
    animate: { opacity: 1 },
    exit: { opacity: 0.65 },
  },
  scaleIn: {
    initial: { opacity: 0.65, scale: 0.98 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0.65, scale: 0.98 },
  },
  slideUp: {
    initial: { opacity: 0.65, y: MOTION_SHIFT.section },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0.65, y: MOTION_SHIFT.section },
  },
  slideDown: {
    initial: { opacity: 0.65, y: -MOTION_SHIFT.section },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0.65, y: -MOTION_SHIFT.section },
  },
  tableRow: {
    initial: { opacity: 0.65, y: MOTION_SHIFT.micro },
    animate: { opacity: 1, y: 0 },
  },
  cardItem: {
    initial: { opacity: 0.65, y: MOTION_SHIFT.control, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
  },
  sidebarSlide: {
    initial: { opacity: 0.65, x: -MOTION_SHIFT.control },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0.65, x: -MOTION_SHIFT.control },
  },
} as const

export const STAGGER_VARIANTS: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.04 } },
}

export const STAGGER_ITEM_VARIANTS: Variants = {
  initial: { opacity: 0.65, y: MOTION_SHIFT.control },
  animate: { opacity: 1, y: 0, transition: MOTION_TRANSITION.default },
}

export const TABLE_STAGGER_VARIANTS: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.03 } },
}

export const TABLE_ROW_VARIANTS: Variants = {
  initial: { opacity: 0.65, y: MOTION_SHIFT.micro },
  animate: { opacity: 1, y: 0, transition: MOTION_TRANSITION.fast },
}

export const CARD_STAGGER_VARIANTS: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.05 } },
}

export const CARD_ITEM_VARIANTS: Variants = {
  initial: { opacity: 0.65, y: MOTION_SHIFT.control, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: MOTION_TRANSITION.default,
  },
}

export const SIDEBAR_STAGGER_VARIANTS: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.03, delayChildren: 0.05 } },
}

export const SIDEBAR_ITEM_VARIANTS: Variants = {
  initial: { opacity: 0.65, x: -MOTION_SHIFT.control },
  animate: { opacity: 1, x: 0, transition: MOTION_TRANSITION.fast },
}

/**
 * Keep skipped transitions from reaching the console as pageerrors.
 *
 * Chrome rejects the promises of a `ViewTransition` that a newer one replaced
 * (`AbortError: Transition was skipped`) and reports an unhandled rejection when
 * nobody consumes them. The router starts one transition per navigation and
 * never reads those promises, so a second navigation inside the first handoff —
 * a double click on a navigation link — surfaced as a pageerror.
 *
 * The platform call is wrapped in place, once, so every caller is covered. The
 * wrapper lives in the same slot as the original, which keeps
 * `delete Document.prototype.startViewTransition` (the fallback scenarios and
 * their tests) working as before.
 */
function quietSkippedViewTransitions(): void {
  const prototype = Document.prototype
  const start = prototype.startViewTransition
  if (typeof start !== 'function') return

  const swallow = () => {}

  // The overloads do not matter here: the arguments are forwarded untouched.
  const patched = function (this: Document, ...args: unknown[]) {
    const call = start as unknown as (
      ...passthrough: unknown[]
    ) => ViewTransition
    const transition = call.apply(this, args)
    transition.ready.catch(swallow)
    transition.updateCallbackDone.catch(swallow)
    transition.finished.catch(swallow)
    return transition
  }

  prototype.startViewTransition = patched as typeof start
}

if (typeof document !== 'undefined') quietSkippedViewTransitions()

/** Media query every reduced-motion check goes through. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** True when the reader asked the system for less motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia !== 'function') return false
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

/** True when the browser can run a same-document View Transition. */
export function supportsViewTransitions(): boolean {
  if (typeof document === 'undefined') return false
  return (
    typeof (document as Document & { startViewTransition?: unknown })
      .startViewTransition === 'function'
  )
}

/**
 * Master switch for the page-to-page and list-pagination handoffs.
 *
 * 2026-11-05 mei 决定临时下线：页面切换的落下/升起与翻页的 FLIP + ghost 太晃眼睛。
 * 关掉它是**一次性**的：路由级 View Transition、`AnimatedOutlet` 的降级交接、
 * 公开页的帧交接、列表 FLIP/ghost/入场、以及 `withViewTransition` 的共享元素形变
 * 全部随之停摆。弹层/抽屉/popover/Toast、按钮按压、输入聚焦、行 hover、tab 切换
 * 不经过这个开关，照旧生效。改回 `true` 即恢复（见 `.agents/design/ui-motion.md` §10）。
 */
export const PAGE_TRANSITIONS_ENABLED = false

/**
 * Whether a navigation may be wrapped in a View Transition. The switch comes
 * first, then reduced motion wins over support: with `reduce` we never start
 * one, so no `::view-transition` group can be left behind.
 */
export function pageTransitionsEnabled(): boolean {
  return (
    PAGE_TRANSITIONS_ENABLED &&
    !prefersReducedMotion() &&
    supportsViewTransitions()
  )
}
