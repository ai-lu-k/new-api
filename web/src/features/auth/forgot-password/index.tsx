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

import { AuthLayout } from '../auth-layout'

const BOTTOM_LINK_CLASS =
  'decoration-border hover:decoration-foreground text-foreground cursor-pointer underline decoration-1 underline-offset-[3px]'
import { ForgotPasswordForm } from './components/forgot-password-form'

export function ForgotPassword() {
  const { t } = useTranslation()
  return (
    <AuthLayout eyebrow={t('Forgot password')}>
      <div className='w-full'>
        <h2 className='mt-3 text-xl leading-[1.2] font-bold tracking-[-0.01em]'>
          {t('Forgot password')}
        </h2>

        <div className='mt-7'>
          <ForgotPasswordForm className='space-y-0' />
        </div>

        <div className='mt-3.5 flex items-baseline justify-between gap-4'>
          <p className='text-muted-foreground text-xs leading-[1.6]'>
            {t("Don't have an account?")}{' '}
            <Link to='/sign-up' className={BOTTOM_LINK_CLASS}>
              {t('Sign up')}
            </Link>
          </p>
          <Link to='/sign-in' className={cn(BOTTOM_LINK_CLASS, 'flex-none')}>
            {t('Back to login')}
          </Link>
        </div>
      </div>
    </AuthLayout>
  )
}
