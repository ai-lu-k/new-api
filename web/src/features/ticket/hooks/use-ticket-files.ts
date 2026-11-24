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
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { TICKET_ATTACHMENT_MAX_FILES } from '../constants'
import { mergeTicketFiles } from '../lib/ticket-files'

/**
 * Screenshots of one message: picked with the file dialog, dropped on the
 * page or pasted straight from the clipboard.
 */
export function useTicketFiles(
  files: File[],
  onChange: (files: File[]) => void
) {
  const { t } = useTranslation()

  const add = (incoming: Iterable<File>) => {
    const merged = mergeTicketFiles(files, incoming)
    for (const reason of new Set(merged.rejected)) {
      if (reason === 'count') {
        toast.error(
          t('You can attach up to {{count}} images.', {
            count: TICKET_ATTACHMENT_MAX_FILES,
          })
        )
      } else if (reason === 'size') {
        toast.error(
          t('{{name}} is larger than 5 MB.', { name: merged.lastName ?? '' })
        )
      } else {
        toast.error(t('Only PNG, JPEG, GIF or WebP images can be attached.'))
      }
    }
    onChange(merged.files)
  }

  /** Pasting text keeps working; pasting a screenshot adds it. */
  const paste = (event: React.ClipboardEvent<HTMLElement>) => {
    const images = [...event.clipboardData.items]
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
    if (images.length === 0) return
    event.preventDefault()
    add(images)
  }

  const remove = (index: number) => {
    onChange(files.filter((_, current) => current !== index))
  }

  return {
    add,
    paste,
    remove,
    atLimit: files.length >= TICKET_ATTACHMENT_MAX_FILES,
  }
}
