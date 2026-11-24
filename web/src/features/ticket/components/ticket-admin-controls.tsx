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
import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'

import { TICKET_STATUS, type Ticket, type TicketAssignee } from '../types'
import {
  TicketAssigneeSelect,
  TicketCategorySelect,
  TicketPrioritySelect,
  TicketStatusSelect,
} from './ticket-selects'

export type TicketPatch = {
  status?: number
  category?: number
  priority?: number
  assignee_id?: number
}

type TicketAdminControlsProps = {
  ticket: Ticket
  assignees: TicketAssignee[]
  saving: boolean
  onChange: (patch: TicketPatch) => void
}

/** The fields only an administrator may change. */
export function TicketAdminControls(props: TicketAdminControlsProps) {
  const { t } = useTranslation()
  const closed = props.ticket.status === TICKET_STATUS.CLOSED

  return (
    <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
      <div className='space-y-1'>
        <Label
          htmlFor='ticket-status'
          className='text-muted-foreground text-xs'
        >
          {t('Status')}
        </Label>
        <TicketStatusSelect
          id='ticket-status'
          label={t('Status')}
          value={props.ticket.status}
          disabled={props.saving || closed}
          onChange={(status) => props.onChange({ status })}
          className='w-full'
        />
      </div>
      <div className='space-y-1'>
        <Label
          htmlFor='ticket-category'
          className='text-muted-foreground text-xs'
        >
          {t('Category')}
        </Label>
        <TicketCategorySelect
          id='ticket-category'
          label={t('Category')}
          value={props.ticket.category}
          disabled={props.saving}
          onChange={(category) => props.onChange({ category })}
          className='w-full'
        />
      </div>
      <div className='space-y-1'>
        <Label
          htmlFor='ticket-priority'
          className='text-muted-foreground text-xs'
        >
          {t('Priority')}
        </Label>
        <TicketPrioritySelect
          id='ticket-priority'
          label={t('Priority')}
          value={props.ticket.priority}
          disabled={props.saving}
          onChange={(priority) => props.onChange({ priority })}
          className='w-full'
        />
      </div>
      <div className='space-y-1'>
        <Label
          htmlFor='ticket-assignee'
          className='text-muted-foreground text-xs'
        >
          {t('Assignee')}
        </Label>
        <TicketAssigneeSelect
          id='ticket-assignee'
          label={t('Assignee')}
          value={props.ticket.assignee_id}
          assignees={props.assignees}
          allowUnassigned
          disabled={props.saving}
          onChange={(assignee_id) =>
            props.onChange({ assignee_id: Math.max(assignee_id, 0) })
          }
          className='w-full'
        />
      </div>
    </div>
  )
}
