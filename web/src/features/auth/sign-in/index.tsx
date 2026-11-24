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
import { Link, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

import { AuthLayout } from '../auth-layout'
import { UserAuthForm } from './components/user-auth-form'

const SWITCH_CLASS =
  'decoration-border hover:decoration-foreground text-foreground cursor-pointer underline decoration-1 underline-offset-[3px]'

type SignInPanelProps = {
  redirectTo?: string
  /** Switch to registration in place; absent means link to the sign-up page. */
  onSwitchMode?: () => void
  onAuthenticated?: () => void
  /**
   * Element used for the heading. The dialog passes its own title component so
   * the panel heading is also the dialog's accessible name instead of a second,
   * duplicate heading.
   */
  headingAs?: React.ElementType
}

/** The sign-in heading and form, shared by the page and the dialog. */
export function SignInPanel(props: SignInPanelProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const canRegister =
    !status?.self_use_mode_enabled && status?.register_enabled !== false
  const Heading = props.headingAs ?? 'h2'

  return (
    <div className='w-full'>
      <Heading className='mt-3 text-xl leading-[1.2] font-bold tracking-[-0.01em]'>
        {t('Sign in')}
      </Heading>
      <div className='mt-7'>
        <UserAuthForm
          redirectTo={props.redirectTo}
          onAuthenticated={props.onAuthenticated}
        />
      </div>

      <div className='mt-3.5 flex items-baseline justify-between gap-4'>
        {canRegister ? (
          <p className='text-muted-foreground text-xs leading-[1.6]'>
            {t("Don't have an account?")}{' '}
            {props.onSwitchMode ? (
              <button
                type='button'
                onClick={props.onSwitchMode}
                className={SWITCH_CLASS}
              >
                {t('Sign up')}
              </button>
            ) : (
              <Link to='/sign-up' className={SWITCH_CLASS}>
                {t('Sign up')}
              </Link>
            )}
          </p>
        ) : (
          <span />
        )}
        <Link
          to='/forgot-password'
          className={cn(
            SWITCH_CLASS,
            'text-muted-foreground flex-none text-xs'
          )}
        >
          {t('Forgot password?')}
        </Link>
      </div>
    </div>
  )
}

export function SignIn() {
  const { redirect } = useSearch({ from: '/(auth)/sign-in' })

  return (
    <AuthLayout mode='sign-in'>
      <SignInPanel redirectTo={redirect} />
    </AuthLayout>
  )
}
