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
import { Reveal } from '@/components/motion/reveal'

import { AuthCard, type AuthCardMode } from './auth-card'

type AuthLayoutProps = {
  children: React.ReactNode
  /** Which way into the account this page is for; see {@link AuthCard}. */
  mode?: AuthCardMode
  /** A page that is neither of the two (a reset link, a one-time code). */
  eyebrow?: string
}

/**
 * Full-page chrome around {@link AuthCard}, for the standalone auth routes
 * that direct links, OAuth callbacks, and session expiry still use.
 */
export function AuthLayout(props: AuthLayoutProps) {
  return (
    <div
      data-slot='auth-page'
      className='bg-background flex min-h-svh flex-col items-center justify-center px-4 py-8 sm:py-12'
    >
      <Reveal>
        <AuthCard mode={props.mode} eyebrow={props.eyebrow}>
          {props.children}
        </AuthCard>
      </Reveal>
    </div>
  )
}
