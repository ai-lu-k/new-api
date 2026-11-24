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

import { useSystemConfig } from '@/hooks/use-system-config'
import { cn } from '@/lib/utils'

export type AuthCardMode = 'sign-in' | 'sign-up'

type AuthCardProps = {
  children: React.ReactNode
  /**
   * Which sign-in or registration label to show in the card header.
   */
  mode?: AuthCardMode
  /**
   * What this card is, printed after the site name. The two modes supply it
   * themselves; a reset link or a one-time code names itself instead.
   */
  eyebrow?: string
  /** Rendered inside a dialog, where the dialog owns the close button. */
  embedded?: boolean
  className?: string
}

export function AuthCard(props: AuthCardProps) {
  const { t } = useTranslation()
  const { systemName } = useSystemConfig()

  let label = props.eyebrow ?? ''
  if (props.mode === 'sign-up') label = t('Sign up')
  else if (props.mode === 'sign-in') label = t('Sign in')
  const eyebrow = label ? `${systemName} · ${label}` : systemName

  return (
    <div
      data-slot='auth-card'
      className={cn(
        'bg-background border-foreground relative w-full max-w-[460px] border px-8 py-7',
        props.className
      )}
    >
      <p
        data-slot='auth-eyebrow'
        className='text-muted-foreground text-[11px] tracking-[0.08em]'
      >
        {eyebrow}
      </p>

      <main data-slot='auth-form' className='min-w-0'>
        {props.children}
      </main>
    </div>
  )
}
