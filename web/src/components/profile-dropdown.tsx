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
import { Link, useNavigate } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { useCallback, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ProfileIdentity,
  profileAvatarClass,
} from '@/components/profile-dropdown/identity'
import { SignOutDialog } from '@/components/sign-out-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EnvironmentMenuItem } from '@/features/environment/components/environment-menu-item'
import { usePopularPages } from '@/features/page-views/hooks/use-popular-pages'
import { PreviewRoleMenuItem } from '@/features/preview/components/preview-role-menu-item'
import { useBalance } from '@/hooks/use-balance'
import useDialogState from '@/hooks/use-dialog'
import { useUserDisplay } from '@/hooks/use-user-display'
import { toIntlLocale } from '@/i18n/languages'
import { getUserAvatarFallback } from '@/lib/avatar'
import { MISSING_BALANCE, isLowBalance } from '@/lib/balance'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

/** One row: 36px tall, 16px gutters, square, and only the background moves. */
const rowClass =
  'h-9 gap-2.5 rounded-none px-4 text-[13px] hover:bg-muted focus:bg-muted focus:text-foreground'

// The environment switch brings its own markup, so its rows are dragged onto
// this panel's rhythm here. Classes stay literal: Tailwind scans their text.
const environmentSlotClass = [
  '[&_[data-slot=dropdown-menu-item]]:h-9 [&_[data-slot=dropdown-menu-item]]:gap-2.5',
  '[&_[data-slot=dropdown-menu-item]]:rounded-none [&_[data-slot=dropdown-menu-item]]:px-4',
  '[&_[data-slot=dropdown-menu-item]]:text-[13px] [&_[data-slot=dropdown-menu-item]]:hover:bg-muted',
  '[&_[data-slot=dropdown-menu-separator]]:mx-0 [&_[data-slot=dropdown-menu-separator]]:my-0',
  '[&>div]:px-4 [&>div]:py-2 [&>div]:text-[11px]',
  '[&_svg]:size-3.5 [&_svg]:[stroke-width:1.5]',
].join(' ')

// `swiss.css` times overlays from the motion tokens; this one only fades (120ms,
// no anchor-ward travel).
const panelMotion = {
  '--motion-fast': '120ms',
  '--motion-shift-micro': '0px',
} as CSSProperties

/**
 * The same figure as the header chip, for the phones that have no room for it
 * up there, plus the way to put more in. A balance under ¥5 is the point where
 * a refill is due, so the number carries the accent color instead of
 * announcing itself in a banner.
 */
function BalanceRow(props: { quota: number | null }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const low = isLowBalance(props.quota)

  return (
    <div className='border-border flex items-center justify-between gap-3 border-b px-4 py-3 sm:hidden'>
      <div className='min-w-0'>
        <p className='text-muted-foreground text-[11px] leading-none'>
          {t('Balance')}
        </p>
        <p
          data-slot='profile-balance'
          className={cn(
            'mt-1.5 text-[17px] leading-none font-bold tracking-[-0.01em] tabular-nums',
            low && 'text-destructive'
          )}
        >
          {props.quota == null
            ? MISSING_BALANCE
            : formatQuotaWithCurrency(props.quota, { locale })}
        </p>
      </div>
      <Link
        to='/wallet'
        className='border-foreground hover:bg-foreground hover:text-background inline-flex h-7 shrink-0 items-center border px-2.5 text-[12px] font-medium transition-colors'
      >
        {t('Top-up')}
      </Link>
    </div>
  )
}

// The account panel behind the header avatar: who is signed in, the shortcuts
// that account reaches, and the way out — square, hairline-ruled, one column.
// Usage levels stay offline (see `@/features/usage-level/visibility`) and this
// panel has no level row. The balance lives in the header chip instead, and
// only returns here on a phone, where the header has no room for it.
export function ProfileDropdown() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useDialogState()
  const [menuOpen, setMenuOpen] = useState(false)
  const user = useAuthStore((state) => state.auth.user)
  const quota = useBalance(menuOpen)
  const { displayName, roleLabel, secondaryText } = useUserDisplay(user)
  const popularPages = usePopularPages()
  const avatarFallback = getUserAvatarFallback(user?.username || displayName)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [alignOffset, setAlignOffset] = useState(0)

  // A phone-wide panel would overhang the screen from the anchor's own edge, so
  // its end edge is re-anchored 16px inside the viewport when it opens.
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setMenuOpen(nextOpen)
    if (!nextOpen) return
    const anchor = anchorRef.current?.getBoundingClientRect()
    const narrow = document.documentElement.clientWidth < 640
    if (!anchor || !narrow) {
      setAlignOffset(0)
      return
    }
    // Negative pulls the end edge inward: `end` alignment offsets run toward
    // the trigger's start edge.
    setAlignOffset(
      Math.min(0, Math.round(anchor.right + 16 - window.innerWidth))
    )
  }, [])

  return (
    <>
      <div ref={anchorRef} className='flex'>
        <DropdownMenu modal={false} onOpenChange={handleOpenChange}>
          <DropdownMenuTrigger
            render={
              <Button
                size='icon'
                variant='ghost'
                aria-label={t('Account menu')}
                className='aria-expanded:border-foreground hover:border-foreground size-8 shrink-0 rounded-none border border-transparent p-0 hover:bg-transparent aria-expanded:bg-transparent'
              />
            }
          >
            <span aria-hidden='true' className={profileAvatarClass}>
              {avatarFallback}
            </span>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align='end'
            alignOffset={alignOffset}
            sideOffset={8}
            style={panelMotion}
            className='border-border bg-background text-foreground w-[calc(100vw-32px)] rounded-none border p-0 shadow-none ring-0 sm:w-[280px]'
          >
            <ProfileIdentity
              initial={avatarFallback}
              name={displayName}
              role={roleLabel}
              identifier={secondaryText}
            />

            <BalanceRow quota={quota} />

            <div className='py-1'>
              {popularPages.map((page) => (
                <DropdownMenuItem
                  key={page.url}
                  onClick={() => navigate({ to: page.url })}
                  className={rowClass}
                >
                  {page.icon && (
                    <page.icon
                      aria-hidden
                      size={14}
                      strokeWidth={1.5}
                      className='size-3.5'
                    />
                  )}
                  <span className='truncate'>{page.title}</span>
                </DropdownMenuItem>
              ))}

              <div className={environmentSlotClass}>
                <EnvironmentMenuItem />
                <PreviewRoleMenuItem />
              </div>
            </div>

            <DropdownMenuSeparator className='mx-0 my-0' />

            <div className='py-1'>
              <DropdownMenuItem
                className={cn(
                  rowClass,
                  'text-destructive focus:text-destructive'
                )}
                onClick={() => setOpen(true)}
              >
                <LogOut
                  aria-hidden
                  size={14}
                  strokeWidth={1.5}
                  className='size-3.5'
                />
                <span className='truncate'>{t('Sign out')}</span>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
