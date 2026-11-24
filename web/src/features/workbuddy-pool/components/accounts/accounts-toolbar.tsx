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
import { Download, Loader2, Plus, RefreshCw, Sparkles, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { AccountActions } from './use-account-actions'

type AccountsToolbarProps = {
  actions: AccountActions
  realm: string
  onAdd: () => void
}

/**
 * Pool-wide actions. Each one hits every account the hub holds, so they are
 * mutually exclusive while a run is in flight: a second refresh while the first
 * is walking the pool would only queue more upstream calls.
 */
export function AccountsToolbar(props: AccountsToolbarProps) {
  const { t } = useTranslation()
  const actions = props.actions
  const busy =
    actions.refresh.isPending ||
    actions.testAll.isPending ||
    actions.fetchCredits.isPending ||
    actions.syncProfile.isPending ||
    actions.exportAccounts.isPending

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <Button
        size='sm'
        variant='outline'
        disabled={busy}
        onClick={() => actions.refresh.mutate(undefined)}
      >
        {actions.refresh.isPending ? (
          <Loader2 className='animate-spin' />
        ) : (
          <RefreshCw />
        )}
        {t('Refresh credentials')}
      </Button>
      <Button
        size='sm'
        variant='outline'
        disabled={busy}
        onClick={() => actions.fetchCredits.mutate(undefined)}
      >
        {actions.fetchCredits.isPending ? (
          <Loader2 className='animate-spin' />
        ) : (
          <Sparkles />
        )}
        {t('Fetch credits')}
      </Button>
      <Button
        size='sm'
        variant='outline'
        disabled={busy}
        onClick={() => actions.testAll.mutate(props.realm)}
      >
        {actions.testAll.isPending ? (
          <Loader2 className='animate-spin' />
        ) : (
          <Zap />
        )}
        {t('Test all')}
      </Button>
      <Button
        size='sm'
        variant='outline'
        disabled={busy}
        onClick={() => actions.syncProfile.mutate(undefined)}
      >
        {actions.syncProfile.isPending ? (
          <Loader2 className='animate-spin' />
        ) : (
          <RefreshCw />
        )}
        {t('Sync profiles')}
      </Button>
      <Button
        size='sm'
        variant='outline'
        disabled={busy}
        onClick={() => actions.exportAccounts.mutate()}
      >
        {actions.exportAccounts.isPending ? (
          <Loader2 className='animate-spin' />
        ) : (
          <Download />
        )}
        {t('Export')}
      </Button>
      <span className='flex-1' />
      <Button size='sm' onClick={props.onAdd}>
        <Plus />
        {t('Add account')}
      </Button>
    </div>
  )
}
