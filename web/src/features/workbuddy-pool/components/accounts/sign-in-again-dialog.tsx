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
import { ExternalLink, Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import type { HubAccount } from './types'
import { useAddAccount } from './use-add-account'

type SignInAgainDialogProps = {
  account: HubAccount | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Re-signing-in one account whose upstream credential died. The gateway starts
 * the OAuth hand-off for that realm, the upstream page opens in a new tab, and
 * the dialog polls until the gateway has the new credential. Finishing there
 * refreshes the same account: the upstream identity does not change.
 */
export function SignInAgainDialog(props: SignInAgainDialogProps) {
  const { t } = useTranslation()
  const signIn = useAddAccount({ openAuthWindow: true })
  const startedFor = useRef<string | null>(null)
  const realm = props.account?.realm ?? 'cn'
  const uid = props.account?.uid ?? null

  useEffect(() => {
    if (!props.open || !uid) {
      startedFor.current = null
      return
    }
    if (startedFor.current === uid) return
    startedFor.current = uid
    signIn.start.mutate(realm)
    // signIn.start is a stable mutation object; the guarded ref keeps it to one
    // start per account per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, uid, realm])

  const handleOpenChange = (open: boolean): void => {
    if (!open) {
      if (signIn.loginState) signIn.cancel.mutate(signIn.loginState)
      signIn.reset()
      startedFor.current = null
    }
    props.onOpenChange(open)
  }

  const status = signIn.poll.data?.status
  const done = status === 'ok' && Boolean(signIn.signedIn)

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {t('Sign in again for {{account}}', {
              account: props.account?.nickname ?? t('this account'),
            })}
          </DialogTitle>
          <DialogDescription>
            {t(
              'The gateway asks the upstream for a fresh credential and opens its sign-in page. Finish it there; finishing it updates this account in place.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-3 text-sm'>
          {signIn.start.isPending && (
            <p className='text-muted-foreground flex items-center gap-2'>
              <Loader2 className='animate-spin' />
              {t('Asking the gateway for a sign-in link…')}
            </p>
          )}
          {signIn.start.data?.authUrl && (
            <a
              href={signIn.start.data.authUrl}
              target='_blank'
              rel='noreferrer'
              className='text-primary flex items-center gap-1 truncate text-xs underline-offset-2 hover:underline'
            >
              <ExternalLink className='size-3.5 shrink-0' />
              <span className='truncate'>{signIn.start.data.authUrl}</span>
            </a>
          )}
          {signIn.start.data?.authUrl && !done && !signIn.start.isPending && (
            <p className='text-muted-foreground text-xs'>
              {t(
                'The page opened in a new tab. If your browser blocked it, open the link above.'
              )}
            </p>
          )}
          {done && (
            <p className='text-sm font-medium'>
              {t('Signed in as {{nickname}}', { nickname: signIn.signedIn })}
            </p>
          )}
          {!done && status && (
            <p className='text-muted-foreground text-xs'>
              {t('Waiting for the sign-in to finish…')}
            </p>
          )}
        </div>

        <DialogFooter>
          {signIn.loginState && !done && (
            <Button
              size='sm'
              variant='outline'
              onClick={() =>
                signIn.loginState && signIn.cancel.mutate(signIn.loginState)
              }
            >
              {t('Cancel')}
            </Button>
          )}
          <Button size='sm' onClick={() => handleOpenChange(false)}>
            {done ? t('Done') : t('Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
