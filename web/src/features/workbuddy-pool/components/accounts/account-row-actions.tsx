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
import {
  LogIn,
  MessageSquare,
  Pencil,
  ReceiptText,
  RefreshCw,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { HubAccount } from './types'
import type { AccountActions } from './use-account-actions'

type AccountRowActionsProps = {
  account: HubAccount
  actions: AccountActions
  onEdit: () => void
  onCredits: () => void
  onDelete: () => void
  onSignInAgain: () => void
}

/** The upstream rejected the login, or the token has run out. */
function credentialDead(account: HubAccount): boolean {
  return Boolean(
    account.tokenExpired ||
    account.needRelogin ||
    account.expiresIn === 'expired'
  )
}

/**
 * Per-account controls. Check-in is not here on purpose: the gateway signs the
 * pool in on its own schedule, so the row only reports it. The daily chat only
 * exists on the international realm, so each row offers the one its upstream
 * actually accepts instead of a button that always fails.
 */
export function AccountRowActions(props: AccountRowActionsProps) {
  const { t } = useTranslation()
  const actions = props.actions
  const account = props.account
  const busy =
    actions.refresh.isPending ||
    actions.test.isPending ||
    actions.fetchCredits.isPending ||
    actions.dailyChat.isPending

  return (
    <div className='flex flex-wrap items-center gap-1'>
      <Button
        size='xs'
        variant='outline'
        disabled={busy}
        onClick={() => actions.refresh.mutate(account.uid)}
      >
        <RefreshCw />
        {t('Refresh')}
      </Button>
      <Button
        size='xs'
        variant='outline'
        disabled={busy}
        onClick={() => actions.test.mutate(account.uid)}
      >
        <Zap />
        {t('Test')}
      </Button>
      <Button
        size='xs'
        variant='outline'
        disabled={busy}
        onClick={() => actions.fetchCredits.mutate(account.uid)}
      >
        <Sparkles />
        {t('Fetch credits')}
      </Button>
      {credentialDead(account) && (
        <Button
          size='xs'
          variant='default'
          disabled={busy}
          onClick={props.onSignInAgain}
        >
          <LogIn />
          {t('Sign in again')}
        </Button>
      )}
      {account.realm !== 'cn' && (
        <Button
          size='xs'
          variant='outline'
          disabled={busy}
          onClick={() => actions.dailyChat.mutate(account.uid)}
        >
          <MessageSquare />
          {t('Daily chat')}
        </Button>
      )}
      <Button size='xs' variant='outline' onClick={props.onCredits}>
        <ReceiptText />
        {t('Credit details')}
      </Button>
      <Button size='xs' variant='outline' onClick={props.onEdit}>
        <Pencil />
        {t('Edit')}
      </Button>
      <Button size='xs' variant='destructive' onClick={props.onDelete}>
        <Trash2 />
        {t('Delete')}
      </Button>
    </div>
  )
}
