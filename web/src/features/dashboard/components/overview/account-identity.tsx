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

import { StatusBadge } from '@/components/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import { getRoleLabel } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

/** Who is signed in: name, role, user ID and the account's other names. */
export function AccountIdentity() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  if (!user) return null

  const name = user.display_name || user.username || ''
  const avatarName = user.username || name
  const details = [
    user.username ? `@${user.username}` : '',
    user.email ?? '',
    user.group ?? '',
  ].filter(Boolean)

  return (
    <section
      aria-label={t('Account')}
      className='flex min-w-0 items-center gap-3'
    >
      <Avatar className='size-10 rounded-lg text-sm'>
        <AvatarFallback
          className='rounded-lg font-semibold text-white'
          style={getUserAvatarStyle(avatarName)}
        >
          {getUserAvatarFallback(avatarName)}
        </AvatarFallback>
      </Avatar>
      <div className='min-w-0 flex-1'>
        <div className='flex min-w-0 items-center gap-2'>
          <span className='truncate font-semibold'>{name}</span>
          <StatusBadge
            label={getRoleLabel(user.role)}
            variant='neutral'
            copyable={false}
          />
          <StatusBadge
            label={`${t('User ID')} ${user.id}`}
            variant='info'
            copyText={String(user.id)}
          />
        </div>
        <p className='text-muted-foreground truncate text-xs'>
          {details.join(' · ')}
        </p>
      </div>
    </section>
  )
}
