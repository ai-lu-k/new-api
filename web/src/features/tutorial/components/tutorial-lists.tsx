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

/**
 * Numbered steps carry their number in the marker: `decimal-leading-zero` is
 * exactly the `01`, `02` of the design, so the copy never has to spell it out.
 */
const STEP_LIST_CLASS = [
  'mt-3.5 pl-[30px] [list-style-type:decimal-leading-zero]',
  '[&>li]:text-sm [&>li]:leading-[1.75] [&>li+li]:mt-2',
  '[&>li::marker]:font-mono [&>li::marker]:text-[11px]',
  '[&>li::marker]:text-muted-foreground',
].join(' ')

/** A square marker keeps the list as quiet as the tables next to it. */
const BULLET_LIST_CLASS = [
  'mt-3.5 pl-4 [list-style-type:square]',
  '[&>li]:text-sm [&>li]:leading-[1.75] [&>li+li]:mt-1.5',
  '[&>li::marker]:text-[9px] [&>li::marker]:text-foreground',
].join(' ')

/**
 * An ordered walkthrough. `start` continues the numbering across a step that a
 * table or a code block interrupts, so the reader still sees one sequence.
 */
export function DocSteps(props: { start?: number; children: ReactNode }) {
  return (
    <ol start={props.start} className={STEP_LIST_CLASS}>
      {props.children}
    </ol>
  )
}

/** A short unordered list; items are one line each by design. */
export function DocBullets(props: { children: ReactNode }) {
  return <ul className={BULLET_LIST_CLASS}>{props.children}</ul>
}
