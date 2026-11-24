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

import { cn } from '@/lib/utils'

export type CrossfadeGlyph = {
  /** Stable key; the same value passed as `state` selects this glyph. */
  key: string
  glyph: ReactNode
}

type IconCrossfadeProps = {
  /** Which glyph is at full opacity right now. */
  state: string
  /** Every glyph the control can show; all of them stay mounted. */
  glyphs: CrossfadeGlyph[]
  /** Classes for the shared cell (sizing stays with the caller). */
  className?: string
}

/**
 * One control, several glyphs (copy → tick → spinner, submit → spinner).
 *
 * All glyphs share a single grid cell, so the widest one sets the width once
 * and the button never reflows when the state changes. The switch is an
 * opacity cross-fade on the fast token (`[data-motion-crossfade]` in
 * `styles/swiss.css`); under `prefers-reduced-motion` the global rule
 * collapses that duration, so the glyph is replaced without any fade.
 *
 * ```tsx
 * <IconCrossfade
 *   state={copied ? 'copied' : 'idle'}
 *   glyphs={[
 *     { key: 'idle', glyph: <Copy /> },
 *     { key: 'copied', glyph: <Check className='text-success' /> },
 *   ]}
 * />
 * ```
 */
export function IconCrossfade({
  state,
  glyphs,
  className,
}: IconCrossfadeProps) {
  return (
    <span
      data-motion-crossfade=''
      aria-hidden='true'
      className={cn('inline-grid place-items-center', className)}
    >
      {glyphs.map((entry) => (
        <span
          key={entry.key}
          data-crossfade-state={entry.key}
          data-visible={entry.key === state ? 'true' : 'false'}
          className='col-start-1 row-start-1 inline-flex'
        >
          {entry.glyph}
        </span>
      ))}
    </span>
  )
}
