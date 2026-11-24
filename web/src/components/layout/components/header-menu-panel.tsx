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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Search } from '@/components/search'
import { WORKSPACE_GROUP_IDS, useSidebarData } from '@/hooks/use-sidebar-data'
import { cn } from '@/lib/utils'
import { openAuthDialog } from '@/stores/auth-dialog-store'
import { useAuthStore } from '@/stores/auth-store'

import { activateTopNavLink, isTopNavLinkActive } from '../lib/top-nav-active'
import { checkIsActive } from '../lib/url-utils'
import type { TopNavLink } from '../types'

const GROUP_TITLE_CLASS =
  'text-muted-foreground text-[11px] font-semibold tracking-wide'

export interface HeaderMenuPanelProps {
  open: boolean
  links: TopNavLink[]
  pathname: string
  onClose: () => void
  onRequiresAuth: (link: TopNavLink) => void
}

/**
 * The bar's menu, opened from the button that replaced the search field: a
 * sheet on the right carrying the search entry, the same links in the same
 * order, the signed-in reader's whole workspace, and the one way in or out.
 */
export function HeaderMenuPanel(props: HeaderMenuPanelProps) {
  const { t } = useTranslation()
  const signedIn = useAuthStore((state) => Boolean(state.auth.user))
  const { navGroups } = useSidebarData()
  const workspaceGroups = signedIn
    ? navGroups.filter(
        (group) => group.id != null && WORKSPACE_GROUP_IDS.includes(group.id)
      )
    : []

  return (
    <div
      data-slot='header-menu-panel'
      aria-hidden={!props.open}
      className={cn(
        'fixed inset-0 z-40 transition-opacity duration-(--motion-base) ease-(--ease-out)',
        props.open
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none opacity-0'
      )}
    >
      <button
        type='button'
        aria-label={t('Close navigation menu')}
        tabIndex={props.open ? undefined : -1}
        onClick={props.onClose}
        className='bg-foreground/15 absolute inset-0 cursor-default'
      />
      <div
        className={cn(
          'bg-background absolute inset-y-0 right-0 flex w-full max-w-[22rem] flex-col justify-between gap-8 border-l px-6 pt-20 pb-8 transition-transform duration-(--motion-base) ease-(--ease-out)',
          props.open ? 'translate-x-0' : 'translate-x-6'
        )}
      >
        <div className='flex min-h-0 flex-col gap-6 overflow-y-auto'>
          <Search className='w-full flex-none' />
          <nav className='flex flex-col' aria-label={t('Main navigation')}>
            {props.links.map((link) => {
              const isActive = isTopNavLinkActive(props.pathname, link)
              const linkClassName = cn(
                'flex items-center gap-3 py-2.5 text-[15px] font-medium tracking-tight transition-colors duration-(--motion-fast)',
                isActive
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground',
                link.disabled && 'pointer-events-none opacity-50'
              )

              if (link.external) {
                return (
                  <a
                    key={`${link.title}:${link.href}`}
                    href={link.href}
                    target='_blank'
                    rel='noopener noreferrer'
                    aria-disabled={link.disabled}
                    tabIndex={link.disabled ? -1 : undefined}
                    onClick={(event) => {
                      activateTopNavLink(event, link, props.onRequiresAuth)
                      props.onClose()
                    }}
                    className={linkClassName}
                  >
                    {t(link.title)}
                  </a>
                )
              }

              return (
                <Link
                  key={`${link.title}:${link.href}`}
                  to={link.href}
                  disabled={link.disabled}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={(event) => {
                    activateTopNavLink(event, link, props.onRequiresAuth)
                    props.onClose()
                  }}
                  className={linkClassName}
                >
                  {t(link.title)}
                </Link>
              )
            })}
          </nav>

          {workspaceGroups.length > 0 && (
            <div
              data-slot='header-menu-workspace'
              className='border-border flex flex-col gap-5 border-t pt-5'
            >
              {workspaceGroups.map((group) => (
                <div key={group.id} className='flex flex-col'>
                  <p className={GROUP_TITLE_CLASS}>{group.title}</p>
                  <div className='mt-1 flex flex-col'>
                    {group.items.map((item) => {
                      if (!item.url) return null
                      const isCurrent = checkIsActive(props.pathname, item)
                      return (
                        <Link
                          key={`${group.id}:${String(item.url)}`}
                          to={item.url}
                          aria-current={isCurrent ? 'page' : undefined}
                          onClick={props.onClose}
                          className={cn(
                            'py-1.5 text-[14px] leading-6 tracking-tight transition-colors duration-(--motion-fast)',
                            isCurrent
                              ? 'text-foreground font-semibold'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {item.title}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className='flex flex-col gap-3'>
          {signedIn ? (
            <Link
              to='/dashboard'
              onClick={props.onClose}
              className='bg-foreground text-background inline-flex h-10 items-center justify-center rounded-lg text-sm font-medium transition-opacity hover:opacity-90 active:opacity-80'
            >
              {t('Go to Dashboard')}
            </Link>
          ) : (
            <button
              type='button'
              onClick={() => {
                props.onClose()
                openAuthDialog('sign-in')
              }}
              className='bg-foreground text-background inline-flex h-10 items-center justify-center rounded-lg text-sm font-medium transition-opacity hover:opacity-90 active:opacity-80'
            >
              {t('Sign in')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
