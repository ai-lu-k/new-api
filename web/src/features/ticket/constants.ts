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
import { TICKET_CATEGORY, TICKET_PRIORITY, TICKET_STATUS } from './types'

/** Labels are i18n keys; render them through `t()`. */
export const TICKET_STATUS_LABELS: Record<number, string> = {
  [TICKET_STATUS.OPEN]: 'Open',
  [TICKET_STATUS.IN_PROGRESS]: 'In progress',
  [TICKET_STATUS.RESOLVED]: 'Resolved',
  [TICKET_STATUS.CLOSED]: 'Closed',
}

export const TICKET_CATEGORY_LABELS: Record<number, string> = {
  [TICKET_CATEGORY.BILLING]: 'Billing',
  [TICKET_CATEGORY.CHANNEL]: 'Channel',
  [TICKET_CATEGORY.ACCOUNT]: 'Account',
  [TICKET_CATEGORY.OTHER]: 'Other',
}

export const TICKET_PRIORITY_LABELS: Record<number, string> = {
  [TICKET_PRIORITY.LOW]: 'Low',
  [TICKET_PRIORITY.NORMAL]: 'Normal',
  [TICKET_PRIORITY.HIGH]: 'High',
}

export const TICKET_STATUS_VARIANTS: Record<
  number,
  'outline' | 'warning' | 'secondary' | 'ghost'
> = {
  [TICKET_STATUS.OPEN]: 'outline',
  [TICKET_STATUS.IN_PROGRESS]: 'warning',
  [TICKET_STATUS.RESOLVED]: 'secondary',
  [TICKET_STATUS.CLOSED]: 'ghost',
}

export const TICKET_CATEGORY_OPTIONS = [
  TICKET_CATEGORY.BILLING,
  TICKET_CATEGORY.CHANNEL,
  TICKET_CATEGORY.ACCOUNT,
  TICKET_CATEGORY.OTHER,
]

export const TICKET_PRIORITY_OPTIONS = [
  TICKET_PRIORITY.LOW,
  TICKET_PRIORITY.NORMAL,
  TICKET_PRIORITY.HIGH,
]

export const TICKET_STATUS_OPTIONS = [
  TICKET_STATUS.OPEN,
  TICKET_STATUS.IN_PROGRESS,
  TICKET_STATUS.RESOLVED,
  TICKET_STATUS.CLOSED,
]

/**
 * The status tab row of the ticket list. The labels are i18n keys, like the
 * other labels in this file; the row itself is a `TabSwitch`.
 */
export const TICKET_STATUS_TAB_LABELS: Record<string, string> = {
  all: 'All',
  open: 'Open',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const TICKET_MIN_SUBJECT = 2
export const TICKET_MAX_SUBJECT = 120
export const TICKET_MIN_CONTENT = 5
export const TICKET_MAX_CONTENT = 4000

/** Screenshot limits enforced again on the server. */
export const TICKET_ATTACHMENT_MAX_FILES = 3
export const TICKET_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
export const TICKET_ATTACHMENT_ACCEPT =
  'image/png,image/jpeg,image/gif,image/webp'
