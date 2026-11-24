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

/** A field name, a path or a value the reader will type out. */
export function InlineCode(props: { children: ReactNode }) {
  return (
    <code className='bg-muted px-[5px] py-px font-mono text-[12.5px] leading-[1.5] break-words'>
      {props.children}
    </code>
  )
}

/** A closing remark that qualifies the block above it. */
export function DocNote(props: { children: ReactNode }) {
  return (
    <div className='border-border text-muted-foreground mt-4 border-t pt-2.5 text-xs leading-[1.7]'>
      {props.children}
    </div>
  )
}

/**
 * The one place red is allowed in the body: something that will cost the reader
 * if it is missed. A rule carries it, never a filled panel.
 */
export function DocWarning(props: { title: ReactNode; children: ReactNode }) {
  return (
    <div className='bg-muted border-destructive mt-5 border-l-2 px-4 py-3'>
      <p className='text-[13px] leading-[1.6] font-semibold'>{props.title}</p>
      <p className='text-muted-foreground mt-1 text-[13px] leading-[1.7]'>
        {props.children}
      </p>
    </div>
  )
}
