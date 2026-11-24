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
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import type { TicketAssignee } from '../types'
import {
  TicketAssigneeSelect,
  TicketCategorySelect,
  TicketPrioritySelect,
} from './ticket-selects'

type TicketToolbarProps = {
  category: number
  onCategoryChange: (category: number) => void
  priority: number
  onPriorityChange: (priority: number) => void
  keyword: string
  onKeywordChange: (keyword: string) => void
  placeholder: string
  /** Administrators also narrow the queue by owner. */
  assignee?: {
    value: number
    options: TicketAssignee[]
    onChange: (assigneeId: number) => void
  }
}

/** The filters above the ticket table. The status tabs are a `TabSwitch` in the
 *  page itself, so the list it filters is the panel that swaps. */
export function TicketToolbar(props: TicketToolbarProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(props.keyword)
  const categoryId = useId()
  const priorityId = useId()
  const assigneeId = useId()

  const resetFilters = () => {
    setDraft('')
    props.onKeywordChange('')
    props.onCategoryChange(0)
    props.onPriorityChange(0)
    props.assignee?.onChange(0)
  }

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-end gap-2'>
        <form
          className='flex items-center gap-2'
          onSubmit={(event) => {
            event.preventDefault()
            props.onKeywordChange(draft)
          }}
        >
          <Input
            aria-label={props.placeholder}
            placeholder={props.placeholder}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className='h-9 w-full max-w-xs min-w-0 sm:w-56'
          />
          <Button
            type='submit'
            variant='outline'
            size='sm'
            className='min-h-11 w-16 shrink-0 sm:min-h-8'
          >
            {t('View')}
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={resetFilters}
            className='min-h-11 w-16 shrink-0 sm:min-h-8'
          >
            {t('Reset')}
          </Button>
        </form>
        <div className='flex items-center gap-1.5'>
          <label
            htmlFor={categoryId}
            className='text-muted-foreground shrink-0 text-xs'
          >
            {t('Category')}
          </label>
          <TicketCategorySelect
            id={categoryId}
            label={t('Category')}
            value={props.category}
            allowAny
            onChange={props.onCategoryChange}
            className='min-h-11 w-28 sm:min-h-8'
          />
        </div>
        <div className='flex items-center gap-1.5'>
          <label
            htmlFor={priorityId}
            className='text-muted-foreground shrink-0 text-xs'
          >
            {t('Priority')}
          </label>
          <TicketPrioritySelect
            id={priorityId}
            label={t('Priority')}
            value={props.priority}
            allowAny
            onChange={props.onPriorityChange}
            className='min-h-11 w-24 sm:min-h-8'
          />
        </div>
        {props.assignee && (
          <div className='flex items-center gap-1.5'>
            <label
              htmlFor={assigneeId}
              className='text-muted-foreground shrink-0 text-xs'
            >
              {t('Assignee')}
            </label>
            <TicketAssigneeSelect
              id={assigneeId}
              label={t('Assignee')}
              value={props.assignee.value}
              assignees={props.assignee.options}
              allowAny
              allowUnassigned
              onChange={props.assignee.onChange}
              className='min-h-11 w-32 sm:min-h-8'
            />
          </div>
        )}
      </div>
    </div>
  )
}
