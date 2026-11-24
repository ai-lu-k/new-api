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
import { Link, useRouterState } from '@tanstack/react-router'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { NotificationPopover } from '@/components/notification-popover'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CampaignEntry } from '@/features/topup-campaign/campaign-entry'
import { useNotifications } from '@/hooks/use-notifications'
import { useSystemConfig } from '@/hooks/use-system-config'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'
import { openAuthDialog } from '@/stores/auth-dialog-store'
import { useAuthStore } from '@/stores/auth-store'

import type { TopNavLink } from '../types'
import { BrandMark } from './brand-mark'
import { HeaderAuthPrompt } from './header-auth-prompt'
import { HeaderBalance } from './header-balance'
import { HeaderMenuButton } from './header-menu-button'
import { HeaderMenuPanel } from './header-menu-panel'
import { HeaderNavigation } from './header-navigation'

export interface PublicHeaderProps {
  /**
   * A page-specific control in the brand area, after the wordmark: the console
   * puts its sidebar drawer button here. It is the only thing a page may add,
   * so the logo and the links still start at the same place everywhere.
   */
  pageControl?: ReactNode
}

/**
 * The site's one top bar.
 *
 * Every page — the public pages and the console — mounts this component over
 * the same height, the same logo slot, the same links in the same order and the
 * same actions on the right. The only thing a page may add is `pageControl`,
 * which is how the console reaches its narrow-screen sidebar; nothing else
 * about the bar varies, so both shells reserve the same space under it.
 */
export function PublicHeader(props: PublicHeaderProps) {
  const { t } = useTranslation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [authTarget, setAuthTarget] = useState<TopNavLink | null>(null)
  const { auth } = useAuthStore()
  const { systemName, loading } = useSystemConfig()
  const links = useTopNavLinks()
  const notifications = useNotifications()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  const signedIn = !!auth.user

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const requestSignIn = useCallback((link: TopNavLink) => {
    setAuthTarget(link)
  }, [])

  const closeAuthPrompt = useCallback(() => setAuthTarget(null), [])

  // Drawn, not loaded: the mark takes the bar's ink, so it needs no request,
  // no preload and no skeleton — it is right before the name arrives.
  const logoContent = <BrandMark className='size-full' />

  let authContent = (
    <Button
      size='sm'
      className='h-8 rounded-lg px-3.5 text-sm font-medium'
      onClick={() => openAuthDialog('sign-in')}
    >
      {t('Sign in')}
    </Button>
  )
  if (signedIn) authContent = <ProfileDropdown />
  if (loading) authContent = <Skeleton className='h-8 w-20 rounded-lg' />

  return (
    <>
      <header
        // The header never changes identity across pages (L0).
        data-slot='public-header'
        data-vt-name='header'
        className='bg-sidebar fixed inset-x-0 top-0 z-50 border-b'
      >
        <div className='mx-auto flex h-(--app-header-height,3.5rem) items-center gap-2 px-4 md:px-6'>
          {/* The brand column keeps its width at the widest breakpoint, so the
              links start at the same place on every page. */}
          <div className='@container/system-brand flex min-w-0 flex-1 items-center gap-2 xl:w-[228px] xl:flex-none'>
            <Link to='/' className='group flex min-w-0 items-center gap-2.5'>
              <div className='flex size-7 shrink-0 items-center justify-center transition-all duration-300 group-hover:scale-105'>
                {logoContent}
              </div>
              <span
                data-slot='site-name'
                className='max-w-48 truncate text-base font-semibold tracking-tight'
                title={systemName}
              >
                {loading ? <Skeleton className='h-4 w-16' /> : systemName}
              </span>
            </Link>
            {props.pageControl}
          </div>

          <HeaderNavigation
            links={links}
            pathname={pathname}
            onRequiresAuth={requestSignIn}
            className='xl:flex-1'
          />

          {/* Right actions, in one order everywhere: menu, language, theme,
              notifications, balance, account. */}
          <div className='ms-auto flex shrink-0 items-center gap-1'>
            <CampaignEntry />
            <HeaderMenuButton
              open={mobileOpen}
              onToggle={() => setMobileOpen((open) => !open)}
            />
            <div className='bg-border/40 mx-1 hidden h-4 w-px lg:block' />
            <div className='hidden items-center lg:flex'>
              <LanguageSwitcher />
            </div>
            <ThemeSwitch />
            <NotificationPopover
              className='hidden lg:inline-flex'
              open={notifications.popoverOpen}
              onOpenChange={notifications.setPopoverOpen}
              unreadCount={notifications.unreadCount}
              announcements={notifications.announcements}
              loading={notifications.loading}
            />
            <div className='bg-border/40 mx-1 hidden h-4 w-px lg:block' />
            {signedIn ? <HeaderBalance /> : null}
            {authContent}
          </div>
        </div>
      </header>

      <HeaderMenuPanel
        open={mobileOpen}
        links={links}
        pathname={pathname}
        onClose={() => setMobileOpen(false)}
        onRequiresAuth={requestSignIn}
      />

      {authTarget && (
        <HeaderAuthPrompt target={authTarget} onClose={closeAuthPrompt} />
      )}
    </>
  )
}
