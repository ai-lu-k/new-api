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
import { LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SignOutDialog } from '@/components/sign-out-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { SidebarFooter } from '@/components/ui/sidebar'
import useDialogState from '@/hooks/use-dialog'
import { useUserDisplay } from '@/hooks/use-user-display'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Who is signed in and how to leave, pinned to the bottom of the drawer.
 *
 * The header only carries the avatar menu on wide screens, so without this the
 * mobile navigation ends on the last link and the account area is missing
 * entirely.
 */
export function SidebarAccount() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const [signOutOpen, setSignOutOpen] = useDialogState<boolean>()
  const { displayName, initials, roleLabel } = useUserDisplay(user)
  const avatarName = user?.username || displayName

  if (!user) return null

  return (
    <SidebarFooter className='border-border mt-auto shrink-0 gap-1 border-t p-2'>
      <div className='flex min-w-0 items-center gap-2.5 px-1 py-1.5'>
        <Avatar className='size-8 shrink-0'>
          <AvatarFallback
            className='text-[11px] font-semibold text-white'
            style={getUserAvatarStyle(avatarName)}
          >
            {getUserAvatarFallback(avatarName) || initials}
          </AvatarFallback>
        </Avatar>
        <div className='flex min-w-0 flex-1 flex-col'>
          <p className='text-foreground truncate text-sm font-medium'>
            {displayName}
          </p>
          {roleLabel ? (
            <p className='text-muted-foreground truncate text-xs'>
              {roleLabel}
            </p>
          ) : null}
        </div>
      </div>
      <Button
        variant='ghost'
        className='text-muted-foreground hover:text-foreground h-8 w-full justify-start gap-2 px-1 text-sm'
        onClick={() => setSignOutOpen(true)}
      >
        <LogOut className='size-4' aria-hidden='true' />
        {t('Sign out')}
      </Button>

      <SignOutDialog
        open={!!signOutOpen}
        onOpenChange={(open) => setSignOutOpen(open)}
      />
    </SidebarFooter>
  )
}
