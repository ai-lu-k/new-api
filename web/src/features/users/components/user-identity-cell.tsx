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

import { TimestampCell } from '@/components/activity-time-cell'
import { LongText } from '@/components/long-text'
import {
  sharedElementName,
  useSharedName,
} from '@/components/motion/use-shared-name'
import { StatusBadge } from '@/components/status-badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toIntlLocale } from '@/i18n/languages'

import type { User } from '../types'
import { useOptionalUsers } from './users-provider'

/**
 * The identity column: the account name on the first line and everything that
 * only helps identify it — display name, account age and last activity — on a
 * single muted second line. Both timestamps keep their exact value in the
 * tooltip, so the list can stay two lines tall instead of four.
 */
export function UserIdentityCell(props: { user: User }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const users = useOptionalUsers()
  // The account name is the same object in the list and in the edit drawer:
  // while that drawer is open for this row the name is handed over to the
  // drawer title, so only one element ever claims it (contract §9.2).
  const editing =
    users?.open === 'update' && users.currentRow?.id === props.user.id
  const sharedName = useSharedName(
    editing ? undefined : sharedElementName('user', props.user.id)
  )
  const username = props.user.username
  const displayName = props.user.display_name
  const remark = props.user.remark
  const showDisplayName = Boolean(displayName && displayName !== username)
  const metaClass = 'text-muted-foreground shrink-0'

  return (
    <div className='flex min-w-0 flex-col gap-0.5'>
      <div className='flex min-w-0 items-center gap-2'>
        <span {...sharedName} className='min-w-0'>
          <LongText className='max-w-[180px] text-sm font-normal'>
            {username}
          </LongText>
        </span>
        {remark && (
          <Tooltip>
            <TooltipTrigger
              render={
                <StatusBadge
                  variant='success'
                  copyable={false}
                  className='font-normal'
                />
              }
            >
              <LongText className='max-w-[80px]'>{remark}</LongText>
            </TooltipTrigger>
            <TooltipContent>
              <p className='text-xs'>{remark}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className='flex min-w-0 items-center gap-x-2 text-xs'>
        {showDisplayName && (
          <span data-table-text='secondary' className='min-w-0'>
            <LongText className='max-w-[120px]'>{displayName}</LongText>
          </span>
        )}
        <span className={metaClass}>{t('Created')}</span>
        <TimestampCell
          timestamp={props.user.created_at ?? 0}
          locale={locale}
          justNowLabel={t('Just now')}
          className='text-muted-foreground'
        />
        <span className={metaClass}>·</span>
        <span className={metaClass}>{t('Last Login')}</span>
        <TimestampCell
          timestamp={props.user.last_login_at ?? 0}
          locale={locale}
          justNowLabel={t('Just now')}
          className='text-muted-foreground'
        />
      </div>
    </div>
  )
}
