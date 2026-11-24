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
import { Link } from '@tanstack/react-router'
import { type PointerEvent as ReactPointerEvent, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { textActionClass } from '@/lib/text-action'
import { cn } from '@/lib/utils'

/** The wordmark set across the foot of the page. */
const WORDMARK = 'NEW API'
const WORDMARK_FONT_SIZE = 340
/*
 * Where the word's own outlines sit at that size in this face: the left side
 * bearing, then the cap line and the overshoot below the baseline. The viewBox
 * is exactly this ink box, so the letters meet all four edges of the mark and
 * the font's side bearings never show up as an indent under the page column.
 */
const WORDMARK_INK = { x: 29.7, y: -248.5, width: 1386.7, height: 252.7 }
/** How far the light reaches, in the mark's own units. */
const GLOW_RADIUS = 260
const WORDMARK_GEOMETRY = {
  x: 0,
  y: 0,
  fontSize: WORDMARK_FONT_SIZE,
  fontWeight: 600,
  strokeWidth: 1,
  vectorEffect: 'non-scaling-stroke',
} as const

/**
 * The site's name as a hairline outline: one device pixel of foreground round
 * every letter contour, nothing filled in. It takes the width of the column it
 * is given, so the mark ends on the same line as the page's right edge at every
 * width, and `non-scaling-stroke` keeps that line a hairline instead of letting
 * it thicken as the viewBox grows.
 *
 * The letters fill in under the pointer — a second copy of the word, filled
 * with the colour it is drawn in, shown through a radial mask that travels with
 * the cursor. So the light is local: it lifts the letter it is over, and fades
 * out before it reaches the next one.
 */
function FooterWordmark() {
  const gradientId = `footer-wordmark-glow-${useId().replaceAll(/[^a-zA-Z0-9_-]/g, '')}`
  const maskId = `${gradientId}-mask`
  const markRef = useRef<SVGSVGElement>(null)
  const lightRef = useRef<SVGGElement>(null)

  // Screen position to the mark's own coordinates. The viewBox is fitted by
  // width (`meet` has nothing left to fit once the height follows the aspect),
  // so one scale factor carries a pointer position into the drawing.
  const moveLight = (event: ReactPointerEvent<HTMLDivElement>) => {
    const mark = markRef.current
    const light = lightRef.current
    if (!mark || !light) return
    const box = mark.getBoundingClientRect()
    if (box.width === 0) return
    const scale = box.width / WORDMARK_INK.width
    const x = WORDMARK_INK.x + (event.clientX - box.left) / scale
    const y = WORDMARK_INK.y + (event.clientY - box.top) / scale
    light.setAttribute('transform', `translate(${x} ${y})`)
  }

  return (
    <div
      className='group min-w-0 flex-1'
      onPointerEnter={moveLight}
      onPointerMove={moveLight}
    >
      <svg
        ref={markRef}
        data-slot='footer-wordmark'
        viewBox={`${WORDMARK_INK.x} ${WORDMARK_INK.y} ${WORDMARK_INK.width} ${WORDMARK_INK.height}`}
        preserveAspectRatio='xMidYMid meet'
        fill='none'
        aria-hidden='true'
        className='text-foreground/30 h-auto w-full overflow-visible font-sans'
      >
        <defs>
          <radialGradient id={gradientId}>
            <stop offset='0%' stopColor='white' />
            <stop offset='40%' stopColor='white' />
            <stop offset='100%' stopColor='white' stopOpacity='0' />
          </radialGradient>
          <mask
            id={maskId}
            maskUnits='userSpaceOnUse'
            x={WORDMARK_INK.x - GLOW_RADIUS}
            y={WORDMARK_INK.y - GLOW_RADIUS}
            width={WORDMARK_INK.width + GLOW_RADIUS * 2}
            height={WORDMARK_INK.height + GLOW_RADIUS * 2}
          >
            <g
              ref={lightRef}
              transform={`translate(${WORDMARK_INK.x + WORDMARK_INK.width / 2} ${WORDMARK_INK.y + WORDMARK_INK.height / 2})`}
            >
              <circle r={GLOW_RADIUS} fill={`url(#${gradientId})`} />
            </g>
          </mask>
        </defs>
        <text {...WORDMARK_GEOMETRY} fill='none' stroke='currentColor'>
          {WORDMARK}
        </text>
        {/* The light is the mark's own colour at full strength; the outline
            under it stays at the muted step, so the letters read as ink coming
            through where the pointer is. */}
        <g
          mask={`url(#${maskId})`}
          className='text-foreground opacity-0 transition-opacity duration-(--motion-slow) ease-(--ease-out) group-hover:opacity-100'
        >
          <text
            {...WORDMARK_GEOMETRY}
            fill='currentColor'
            stroke='currentColor'
          >
            {WORDMARK}
          </text>
        </g>
      </svg>
    </div>
  )
}

/**
 * Public pages end with the same footer: the site's name drawn large at the
 * left, and at the right the pages a reader looks for afterwards — the links
 * against the top of the row, the attribution against its bottom.
 */
export function PublicFooter(props: { siteName?: string }) {
  const { t } = useTranslation()

  const links = [
    { to: '/about', label: t('About') },
    { to: '/user-agreement', label: t('User Agreement') },
    { to: '/privacy-policy', label: t('Privacy Policy') },
    { to: '/tutorial', label: t('Tutorial') },
  ]

  return (
    <footer
      data-slot='public-footer'
      className='border-border mt-auto border-t'
    >
      <div className='mx-auto w-full max-w-[1280px] px-4 pt-10 pb-5 sm:px-6 sm:pb-6 xl:px-8'>
        <div className='flex flex-col gap-8 sm:flex-row sm:items-stretch sm:justify-between sm:gap-12'>
          <FooterWordmark />
          <nav className='flex flex-col gap-7 text-[15px] sm:items-start sm:justify-between sm:text-[13px]'>
            <ul className='grid grid-cols-2 justify-items-start gap-x-5 gap-y-2 sm:flex sm:flex-col sm:gap-y-2.5'>
              {links.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className={cn(
                      'text-muted-foreground hover:text-foreground',
                      textActionClass
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className='text-muted-foreground text-[13px]'>
              {props.siteName ?? 'new-api'} · © QuantumNous
            </p>
          </nav>
        </div>
      </div>
    </footer>
  )
}
