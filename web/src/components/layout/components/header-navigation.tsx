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

import { cn } from '@/lib/utils'

import { activateTopNavLink, isTopNavLinkActive } from '../lib/top-nav-active'
import type { TopNavLink } from '../types'

/** A nav label, carrying the glitch treatment for links marked with it. */
function NavLabel(props: { link: TopNavLink; title: string }) {
  if (props.link.accent !== 'glitch') return props.title
  return (
    <span className='nav-glitch'>
      <span className='nav-glitch-text' data-text={props.title}>
        {props.title}
      </span>
      <span className='nav-glitch-blocks' aria-hidden='true'>
        <span />
        <span />
        <span />
      </span>
    </span>
  )
}

export interface HeaderNavigationProps {
  links: TopNavLink[]
  pathname: string
  onRequiresAuth: (link: TopNavLink) => void
  className?: string
}

/** The wide-screen navigation: the same links, the same order, the same bar. */
export function HeaderNavigation(props: HeaderNavigationProps) {
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('Main navigation')}
      className={cn('hidden items-center gap-0.5 lg:flex', props.className)}
    >
      {props.links.map((link) => {
        const isActive = isTopNavLinkActive(props.pathname, link)
        // The current page is a filled block, the way the row of model kinds
        // marks its choice: the label inverts rather than gaining weight, so
        // the bar keeps one rhythm and nothing shifts when the page changes.
        const linkClassName = cn(
          'min-w-0 truncate rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors duration-(--motion-fast) ease-(--ease-out)',
          isActive
            ? 'bg-foreground text-background'
            : 'text-muted-foreground hover:text-foreground',
          link.disabled && 'pointer-events-none opacity-50'
        )

        if (link.external) {
          return (
            <a
              key={`${link.title}:${link.href}`}
              href={link.href}
              title={t(link.title)}
              target='_blank'
              rel='noopener noreferrer'
              aria-disabled={link.disabled}
              tabIndex={link.disabled ? -1 : undefined}
              onClick={(event) =>
                activateTopNavLink(event, link, props.onRequiresAuth)
              }
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
            title={t(link.title)}
            disabled={link.disabled}
            aria-current={isActive ? 'page' : undefined}
            onClick={(event) =>
              activateTopNavLink(event, link, props.onRequiresAuth)
            }
            className={linkClassName}
          >
            <NavLabel link={link} title={t(link.title)} />
          </Link>
        )
      })}
    </nav>
  )
}
