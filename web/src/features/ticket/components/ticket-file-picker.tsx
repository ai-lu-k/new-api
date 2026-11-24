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
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { TICKET_ATTACHMENT_ACCEPT } from '../constants'
import { ticketFileKey } from '../lib/ticket-files'

type TicketFilePickerProps = {
  id: string
  files: File[]
  onAdd: (files: File[]) => void
  onRemove: (index: number) => void
  disabled?: boolean
  atLimit?: boolean
}

/**
 * The screenshots of one message. Picked files and pasted ones both end up
 * here, so the list, the limits and the remove buttons stay in one place.
 */
export function TicketFilePicker(props: TicketFilePickerProps) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)

  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap items-center gap-2'>
        <input
          ref={input}
          id={props.id}
          type='file'
          multiple
          accept={TICKET_ATTACHMENT_ACCEPT}
          className='sr-only'
          onChange={(event) => {
            if (event.target.files) props.onAdd([...event.target.files])
            event.target.value = ''
          }}
        />
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={props.disabled || props.atLimit}
          onClick={() => input.current?.click()}
        >
          {t('Add screenshot')}
        </Button>
        <span className='text-muted-foreground text-xs'>
          {t(
            'Paste a screenshot or add files: PNG, JPEG, GIF or WebP, up to 3 images of 5 MB'
          )}
        </span>
      </div>
      {props.files.length > 0 && (
        <ul className='flex flex-wrap gap-2'>
          {props.files.map((file, index) => (
            <li
              key={ticketFileKey(file)}
              className='bg-muted/60 flex items-center gap-1 rounded-md px-2 py-1 text-xs'
            >
              <span className='max-w-40 truncate'>{file.name}</span>
              <button
                type='button'
                className='text-muted-foreground hover:text-foreground px-1'
                aria-label={t('Remove {{name}}', { name: file.name })}
                disabled={props.disabled}
                onClick={() => props.onRemove(index)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
