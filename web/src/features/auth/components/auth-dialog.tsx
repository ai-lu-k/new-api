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
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { AuthCard } from '@/features/auth/auth-card'
import { sanitizeAuthRedirect } from '@/features/auth/lib/auth-redirect'
import { SignInPanel } from '@/features/auth/sign-in'
import { SignUpPanel } from '@/features/auth/sign-up'
import { useAuthDialogStore } from '@/stores/auth-dialog-store'

/**
 * Sign-in and registration as a dialog over the current page.
 *
 * Mounted once at the root so any entry point can request it without
 * navigating away. The standalone `/sign-in` and `/sign-up` pages stay for
 * direct links, OAuth callbacks, and session expiry.
 */
export function AuthDialog() {
  const navigate = useNavigate()
  const pathname = useLocation({ select: (location) => location.pathname })
  const mode = useAuthDialogStore((state) => state.mode)
  const redirectTo = useAuthDialogStore((state) => state.redirectTo)
  const close = useAuthDialogStore((state) => state.close)
  const setMode = useAuthDialogStore((state) => state.setMode)

  // Links inside the panel (forgot password, terms, an OAuth round trip) move
  // the page underneath; leaving the dialog open over the new page would be
  // confusing, so any navigation ends it.
  const openedAt = useRef(pathname)
  useEffect(() => {
    if (pathname === openedAt.current) return
    openedAt.current = pathname
    if (mode) close()
  }, [pathname, mode, close])

  function handleAuthenticated() {
    close()
    const target = sanitizeAuthRedirect(redirectTo, window.location.origin)
    if (target) void navigate({ href: target, replace: true })
  }

  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(next: boolean) => {
        if (!next) close()
      }}
    >
      <DialogContent
        className='max-h-[calc(100svh-2rem)] w-full max-w-[calc(100%-2rem)] gap-0 overflow-y-auto rounded-none p-0 ring-0 sm:max-w-[460px]'
        showCloseButton
      >
        <AuthCard
          embedded
          mode={mode === 'sign-up' ? 'sign-up' : 'sign-in'}
          className='max-w-none'
        >
          {mode === 'sign-up' ? (
            <SignUpPanel
              headingAs={DialogTitle}
              onSwitchMode={() => setMode('sign-in')}
              onAuthenticated={handleAuthenticated}
            />
          ) : (
            <SignInPanel
              headingAs={DialogTitle}
              onSwitchMode={() => setMode('sign-up')}
              onAuthenticated={handleAuthenticated}
            />
          )}
        </AuthCard>
      </DialogContent>
    </Dialog>
  )
}
