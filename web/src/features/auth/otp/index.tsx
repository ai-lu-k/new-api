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

const BOTTOM_LINK_CLASS =
  'decoration-border hover:decoration-foreground text-foreground cursor-pointer underline decoration-1 underline-offset-[3px]'
import { OtpForm } from './components/otp-form'

export function Otp() {
  const { t } = useTranslation()
  return (
    <AuthLayout eyebrow={t('Security verification')}>
      <div className='w-full'>
        <h2 className='mt-3 text-xl leading-[1.2] font-bold tracking-[-0.01em]'>
          {t('Security verification')}
        </h2>

        <div className='mt-7'>
          <OtpForm />
        </div>

        <p className='text-muted-foreground mt-3.5 text-xs leading-[1.6]'>
          {t('Session expired?')}{' '}
          <Link to='/sign-in' className={BOTTOM_LINK_CLASS}>
            {t('Re-login')}
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
