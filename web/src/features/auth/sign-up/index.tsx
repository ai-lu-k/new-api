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

import { AuthLayout } from '../auth-layout'
import { SignUpForm } from './components/sign-up-form'

const SWITCH_CLASS =
  'decoration-border hover:decoration-foreground text-foreground cursor-pointer underline decoration-1 underline-offset-[3px]'

type SignUpPanelProps = {
  /** Switch to sign-in in place; absent means link to the sign-in page. */
  onSwitchMode?: () => void
  onAuthenticated?: () => void
  /** See {@link SignInPanel}: lets the dialog own the heading element. */
  headingAs?: React.ElementType
}

/** The registration heading and form, shared by the page and the dialog. */
export function SignUpPanel(props: SignUpPanelProps) {
  const { t } = useTranslation()
  const Heading = props.headingAs ?? 'h2'

  return (
    <div className='w-full'>
      <Heading className='mt-3 text-xl leading-[1.2] font-bold tracking-[-0.01em]'>
        {t('Create an account')}
      </Heading>
      <div className='mt-7'>
        <SignUpForm onAuthenticated={props.onAuthenticated} />
      </div>

      <p className='text-muted-foreground mt-3.5 text-xs leading-[1.6]'>
        {t('Already have an account?')}{' '}
        {props.onSwitchMode ? (
          <button
            type='button'
            onClick={props.onSwitchMode}
            className={SWITCH_CLASS}
          >
            {t('Sign in')}
          </button>
        ) : (
          <Link to='/sign-in' className={SWITCH_CLASS}>
            {t('Sign in')}
          </Link>
        )}
      </p>
    </div>
  )
}

export function SignUp() {
  return (
    <AuthLayout mode='sign-up'>
      <SignUpPanel />
    </AuthLayout>
  )
}
