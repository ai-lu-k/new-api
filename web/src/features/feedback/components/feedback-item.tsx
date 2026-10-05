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
import { formatTimestampToDate } from '@/lib/format'

import { FEEDBACK_STATUS, type Feedback } from '../types'

type FeedbackItemProps = {
  feedback: Feedback
  /** Show who wrote it and how to reach them; for administrators. */
  showAuthor?: boolean
  actions?: React.ReactNode
}

/** One message with its status and the reply, if there is one. */
export function FeedbackItem(props: FeedbackItemProps) {
  const { t } = useTranslation()
  const resolved = props.feedback.status === FEEDBACK_STATUS.RESOLVED

  return (
    <li className='space-y-3 px-5 py-4'>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
        {props.showAuthor && (
          <span className='text-foreground font-medium'>
            {props.feedback.user_id > 0
              ? `${props.feedback.username} · #${props.feedback.user_id}`
              : t('Anonymous')}
          </span>
        )}
        <span className='text-muted-foreground'>
          {formatTimestampToDate(props.feedback.created_at)}
        </span>
        <Badge variant={resolved ? 'secondary' : 'outline'}>
          {resolved ? t('Handled') : t('Awaiting reply')}
        </Badge>
        {props.actions && <span className='ms-auto'>{props.actions}</span>}
      </div>
      <p className='text-sm break-words whitespace-pre-wrap'>
        {props.feedback.content}
      </p>
      {props.showAuthor && props.feedback.contact && (
        <p className='text-muted-foreground text-xs break-words'>
          {t('Contact')}: {props.feedback.contact}
        </p>
      )}
      {props.feedback.reply && (
        <div className='bg-muted/60 rounded-lg px-3 py-2'>
          <div className='text-muted-foreground text-xs'>
            {t('Reply from the site')}
          </div>
          <p className='mt-1 text-sm break-words whitespace-pre-wrap'>
            {props.feedback.reply}
          </p>
        </div>
      )}
    </li>
  )
}
