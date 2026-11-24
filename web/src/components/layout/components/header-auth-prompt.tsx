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
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { openAuthDialog } from '@/stores/auth-dialog-store'

import type { TopNavLink } from '../types'

const AUTH_PROMPT_SECONDS = 5

export interface HeaderAuthPromptProps {
  /** The link the reader asked for; it is where signing in returns them. */
  target: TopNavLink
  onClose: () => void
}

/**
 * A bar link that needs an account asks first, then signs in and comes back to
 * the page that was asked for. Mounted only while a link is waiting.
 */
export function HeaderAuthPrompt(props: HeaderAuthPromptProps) {
  const { t } = useTranslation()
  const [secondsLeft, setSecondsLeft] = useState(AUTH_PROMPT_SECONDS)
  const { onClose } = props

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setSecondsLeft((seconds) => Math.max(seconds - 1, 0))
    }, 1000)

    const timeoutId = window.setTimeout(() => {
      onClose()
      openAuthDialog('sign-in', { redirectTo: props.target.href })
    }, AUTH_PROMPT_SECONDS * 1000)

    return () => {
      window.clearInterval(intervalId)
      window.clearTimeout(timeoutId)
    }
  }, [onClose, props.target.href])

  const signInNow = useCallback(() => {
    onClose()
    openAuthDialog('sign-in', { redirectTo: props.target.href })
  }, [onClose, props.target.href])

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('Sign in required')}
      description={t('Please sign in to view {{module}}.', {
        module: t(props.target.title),
      })}
      contentClassName='sm:max-w-md'
      contentHeight='auto'
      footer={
        <>
          <Button variant='outline' onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={signInNow}>{t('Sign in now')}</Button>
        </>
      }
    >
      <div className='bg-muted/40 text-muted-foreground rounded-lg px-3 py-2 text-sm'>
        {t('Redirecting to sign in in {{seconds}} seconds.', {
          seconds: secondsLeft,
        })}
      </div>
    </Dialog>
  )
}
