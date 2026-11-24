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
import { useSharedName } from '@/components/motion/use-shared-name'
import { cn } from '@/lib/utils'

import { ticketSharedName } from '../lib/shared-name'

type TicketSharedSubjectProps = {
  id: number
  subject: string
  /** True while the detail dialog of this ticket is on screen. */
  detailOpen: boolean
  className?: string
}

/**
 * The ticket subject, in the list row **or** in the detail dialog header.
 *
 * Only one of the two may hold `ticket-<id>` at a time, so the row steps aside
 * while its dialog is open; the subject then travels from the row into the
 * header instead of the list vanishing behind a fresh panel.
 */
export function TicketSharedSubject(props: TicketSharedSubjectProps) {
  const shared = useSharedName(
    props.detailOpen ? undefined : ticketSharedName(props.id)
  )

  return (
    <span className={cn(props.className)} {...shared}>
      {props.subject}
    </span>
  )
}
