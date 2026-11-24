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

import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'

import { StatusBadge } from '@/components/status-badge'
import { cn } from '@/lib/utils'

/**
 * One block mark in a model row. Everything that qualifies a model — the offer,
 * the allowance, the price tier — takes this shape, so a row reads as a line of
 * stamps instead of a mix of chips, outlines and coloured text.
 *
 * `join` squares off the touching end of a pair, which is how two marks become
 * one block without a border between them. The label is centred, so a mark that
 * reserves a shared width keeps its words in the middle of it.
 */
export function PricingMark(props: {
  label: string
  /** An optional mark before the words, for a label read by shape. */
  icon?: IconSvgElement | null
  join?: 'start' | 'end'
  className?: string
}) {
  return (
    <StatusBadge
      label={props.label}
      copyable={false}
      className={cn(
        'h-auto justify-center px-1.5 py-0.5',
        props.join === 'start' && 'rounded-md rounded-r-none',
        props.join === 'end' && 'rounded-md rounded-l-none',
        !props.join && 'rounded-md',
        props.className
      )}
    >
      {props.icon ? (
        <span className='flex min-w-0 items-center gap-1'>
          <HugeiconsIcon
            icon={props.icon}
            size={12}
            strokeWidth={1.8}
            aria-hidden='true'
          />
          {props.label}
        </span>
      ) : undefined}
    </StatusBadge>
  )
}
