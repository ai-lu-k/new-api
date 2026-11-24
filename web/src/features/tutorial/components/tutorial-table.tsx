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

/**
 * One line above the table, hairlines inside it: the same rules the rest of the
 * page uses, so a table reads as part of the text instead of a panel.
 */
const TABLE_CLASS = [
  'w-full min-w-[420px] border-collapse text-[13px] leading-[1.7]',
  'border-t-foreground border-t',
  '[&_thead_th]:border-border [&_thead_th]:border-b [&_thead_th]:py-2 [&_thead_th]:pr-4',
  '[&_thead_th]:text-left [&_thead_th]:align-bottom [&_thead_th]:text-xs',
  '[&_thead_th]:font-semibold [&_thead_th]:tracking-[0.02em]',
  '[&_thead_th]:text-muted-foreground',
  '[&_tbody_th]:border-border [&_tbody_th]:border-b [&_tbody_th]:py-2.5 [&_tbody_th]:pr-4',
  '[&_tbody_th]:text-left [&_tbody_th]:align-top',
  '[&_tbody_td]:border-border [&_tbody_td]:border-b [&_tbody_td]:py-2.5 [&_tbody_td]:pr-4',
  '[&_tbody_td]:align-top',
  '[&_thead_th:last-child]:pr-0 [&_tbody_th:last-child]:pr-0',
  '[&_tbody_td:last-child]:pr-0',
].join(' ')

export type DocTableProps = {
  /** Read out in place of a visible caption: what this table is for. */
  label: string
  /** Row labels are identifiers (`code`, the default) or plain names (`label`). */
  headStyle?: 'code' | 'label'
  children: ReactNode
}

/**
 * A table of model names, paths or parameters. It is deliberately able to
 * scroll sideways on a phone rather than reflow: the cells hold identifiers
 * that must stay one line to be recognisable as the same string the API wants.
 */
export function DocTable(props: DocTableProps) {
  return (
    <div className='mt-5 overflow-x-auto'>
      <table
        className={cn(
          TABLE_CLASS,
          props.headStyle === 'label'
            ? '[&_tbody_th]:font-semibold'
            : '[&_tbody_th]:font-mono [&_tbody_th]:text-[12.5px]'
        )}
      >
        <caption className='sr-only'>{props.label}</caption>
        {props.children}
      </table>
    </div>
  )
}
