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
import {
  TICKET_ATTACHMENT_ACCEPT,
  TICKET_ATTACHMENT_MAX_BYTES,
  TICKET_ATTACHMENT_MAX_FILES,
} from '../constants'

export type TicketFileRejection = 'count' | 'size' | 'type'

export type TicketFileMerge = {
  files: File[]
  rejected: TicketFileRejection[]
  /** The name of the last rejected file, for the message. */
  lastName?: string
}

/** Identity of a screenshot: the same bytes pasted twice stay one entry. */
export function ticketFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.type}`
}

/**
 * Adds pasted or picked screenshots to a message, dropping duplicates and
 * anything outside the limits. The server enforces the same limits again.
 */
export function mergeTicketFiles(
  current: File[],
  incoming: Iterable<File>
): TicketFileMerge {
  const files = [...current]
  const seen = new Set(files.map(ticketFileKey))
  const rejected: TicketFileRejection[] = []
  let lastName: string | undefined

  for (const file of incoming) {
    if (files.length >= TICKET_ATTACHMENT_MAX_FILES) {
      rejected.push('count')
      break
    }
    if (file.size > TICKET_ATTACHMENT_MAX_BYTES) {
      rejected.push('size')
      lastName = file.name
      continue
    }
    if (!TICKET_ATTACHMENT_ACCEPT.split(',').includes(file.type)) {
      rejected.push('type')
      lastName = file.name
      continue
    }
    const key = ticketFileKey(file)
    if (seen.has(key)) continue
    seen.add(key)
    files.push(file)
  }
  return { files, rejected, lastName }
}
