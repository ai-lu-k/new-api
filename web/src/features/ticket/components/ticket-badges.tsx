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

import { Badge } from '@/components/ui/badge'

import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_VARIANTS,
} from '../constants'
import { TICKET_PRIORITY } from '../types'

export function TicketStatusBadge(props: { status: number }) {
  const { t } = useTranslation()
  const label = TICKET_STATUS_LABELS[props.status]
  if (!label) return null
  return (
    <Badge variant={TICKET_STATUS_VARIANTS[props.status] ?? 'outline'}>
      {t(label)}
    </Badge>
  )
}

/** Only a raised priority is worth a badge; the default stays quiet. */
export function TicketPriorityBadge(props: { priority: number }) {
  const { t } = useTranslation()
  const label = TICKET_PRIORITY_LABELS[props.priority]
  if (!label || props.priority === TICKET_PRIORITY.NORMAL) return null
  return (
    <Badge
      variant={props.priority === TICKET_PRIORITY.HIGH ? 'warning' : 'ghost'}
    >
      {t(label)}
    </Badge>
  )
}

export function TicketCategoryLabel(props: { category: number }) {
  const { t } = useTranslation()
  const label = TICKET_CATEGORY_LABELS[props.category]
  // A missing category must not leave a labelled-but-empty row in the mobile
  // card, so it reads as a dash like the other absent values.
  return label ? <span>{t(label)}</span> : <span>—</span>
}
