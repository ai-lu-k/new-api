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

import { cn } from '@/lib/utils'

import type { SystemStatus } from '../types'

interface TermsFooterProps {
  variant?: 'sign-in' | 'sign-up'
  className?: string
  status?: SystemStatus | null
}

export function TermsFooter(props: TermsFooterProps) {
  const { t } = useTranslation()
  const links: { label: string; href: string }[] = []
  if (props.status?.user_agreement_enabled) {
    links.push({ label: t('User Agreement'), href: '/user-agreement' })
  }
  if (props.status?.privacy_policy_enabled) {
    links.push({ label: t('Privacy Policy'), href: '/privacy-policy' })
  }
  if (links.length === 0) return null
  return (
    <p
      className={cn(
        'text-muted-foreground text-center text-xs',
        props.className
      )}
    >
      {links.map((link, index) => (
        <span key={link.href}>
          {index > 0 && ' · '}
          <a
            href={link.href}
            className='hover:text-primary underline underline-offset-4'
          >
            {link.label}
          </a>
        </span>
      ))}
    </p>
  )
}
