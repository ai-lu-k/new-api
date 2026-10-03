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
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { usePricingSort } from '../hooks/use-pricing-sort'
import type { ModelSortKey } from '../lib/model-sort'

/**
 * A column heading that sorts the list when clicked: once to sort by the
 * column, again to reverse it.
 */
export function PricingSortHeader(props: {
  sortKey: ModelSortKey
  /** Numeric columns are right-aligned, with the arrow before the label. */
  numeric?: boolean
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const { sort, onSort } = usePricingSort()
  const active = sort.key === props.sortKey
  let Icon = ChevronsUpDown
  if (active) Icon = sort.descending ? ArrowDown : ArrowUp

  return (
    <div className={cn('flex', props.numeric && 'justify-end')}>
      <button
        type='button'
        onClick={() => onSort?.(props.sortKey)}
        className={cn(
          'hover:text-foreground focus-visible:ring-ring -mx-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 transition-colors outline-none focus-visible:ring-2',
          props.numeric && 'flex-row-reverse',
          active && 'text-foreground'
        )}
      >
        <span>{props.children}</span>
        <Icon
          aria-hidden='true'
          className={cn('size-3.5 shrink-0', !active && 'opacity-40')}
        />
        {active && (
          <span className='sr-only'>
            {sort.descending ? t('Desc') : t('Asc')}
          </span>
        )}
      </button>
    </div>
  )
}
