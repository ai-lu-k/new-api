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
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { getTicketAttachment } from '../api'
import type { TicketAttachment } from '../types'

/** A screenshot in the thread, loaded with the dashboard credentials. */
export function TicketAttachmentImage(props: { attachment: TicketAttachment }) {
  const query = useQuery({
    queryKey: ['ticket', 'attachment', props.attachment.id],
    queryFn: async ({ signal }) => {
      const blob = await getTicketAttachment(props.attachment.id, signal)
      return blob.type.startsWith('image/') ? blob : null
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { errorToast: false },
  })
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!query.data) return
    const url = URL.createObjectURL(query.data)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [query.data])

  if (!src) {
    return (
      <span className='bg-muted text-muted-foreground inline-flex h-20 w-32 items-center justify-center rounded-lg border text-xs'>
        {props.attachment.file_name || '...'}
      </span>
    )
  }
  return (
    <a
      href={src}
      target='_blank'
      rel='noreferrer'
      className='inline-block max-w-full'
      aria-label={props.attachment.file_name}
    >
      <img
        src={src}
        alt={props.attachment.file_name}
        className='bg-card max-h-48 rounded-lg border object-contain'
      />
    </a>
  )
}
