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
import { LearnMore } from '@/components/learn-more'

/**
 * A metric label with its own explanation, so the figures stay up front and
 * every term can be checked on hover or keyboard focus.
 */
export function MetricLabel(props: {
  label: string
  hint: React.ReactNode
  align?: 'start' | 'end'
}) {
  return (
    <span className='inline-flex items-center gap-1'>
      <span>{props.label}</span>
      <LearnMore
        triggerProps={{
          'aria-label': props.label,
          className:
            'size-4 shrink-0 border-0 bg-transparent text-muted-foreground hover:bg-transparent [&_svg]:size-3.5',
          openOnHover: true,
          delay: 0,
        }}
        contentProps={{
          side: props.align === 'end' ? 'bottom' : 'top',
          align: props.align === 'end' ? 'end' : 'start',
          className: 'max-w-72 text-xs leading-5',
        }}
      >
        {props.hint}
      </LearnMore>
    </span>
  )
}
