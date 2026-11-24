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
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { requireServerSuccess } from '@/lib/server-error-message'

import { hubGet } from '../api'
import { AccountEditDialog } from './accounts/account-edit-dialog'
import { AccountRow } from './accounts/account-row'
import { AccountsToolbar } from './accounts/accounts-toolbar'
import { AddAccountDialog } from './accounts/add-account-dialog'
import { CreditsDetailDialog } from './accounts/credits-detail-dialog'
import { summarizeAccounts, sortAccounts } from './accounts/lib'
import { SignInAgainDialog } from './accounts/sign-in-again-dialog'
import { AccountsSummary } from './accounts/summary-strip'
import type { HubAccount, HubAccountList } from './accounts/types'
import { useAccountActions } from './accounts/use-account-actions'

const REALMS = [
  { value: 'all', label: 'All realms' },
  { value: 'cn', label: 'China' },
  { value: 'intl', label: 'International' },
]

/**
 * The account pool itself: every WorkBuddy account the hub holds, what each one
 * can still spend, and the controls that change that. Mutations land in the hub,
 * so the list is re-read after each one instead of being patched locally.
 */
export function AccountsTab() {
  const { t } = useTranslation()
  const [realm, setRealm] = useState('all')
  const [editing, setEditing] = useState<HubAccount | null>(null)
  const [credits, setCredits] = useState<HubAccount | null>(null)
  const [deleting, setDeleting] = useState<HubAccount | null>(null)
  const [signingIn, setSigningIn] = useState<HubAccount | null>(null)
  const [adding, setAdding] = useState(false)
  const actions = useAccountActions()

  const query = useQuery({
    queryKey: ['workbuddy', 'accounts', realm],
    queryFn: async () =>
      requireServerSuccess(await hubGet<HubAccountList>('accounts', { realm })),
  })
  const accounts = sortAccounts(query.data?.data?.accounts ?? [])
  const summary = summarizeAccounts(accounts)

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        {REALMS.map((option) => (
          <Button
            key={option.value}
            size='sm'
            variant={realm === option.value ? 'default' : 'outline'}
            aria-pressed={realm === option.value}
            onClick={() => setRealm(option.value)}
          >
            {t(option.label)}
          </Button>
        ))}
      </div>

      <AccountsSummary summary={summary} />
      <AccountsToolbar
        actions={actions}
        realm={realm}
        onAdd={() => setAdding(true)}
      />

      {query.isLoading && <LoadingState />}
      {query.isError && (
        <ErrorState
          title={t('Unable to read the account pool')}
          description={query.error?.message}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isSuccess && accounts.length === 0 && (
        <EmptyState
          title={t('No WorkBuddy accounts yet')}
          description={t(
            'Import an exported account file, or sign in with the desktop hand-off.'
          )}
        />
      )}
      {accounts.length > 0 && (
        <Card className='divide-y'>
          {accounts.map((account) => (
            <AccountRow
              key={account.uid}
              account={account}
              actions={actions}
              onEdit={() => setEditing(account)}
              onCredits={() => setCredits(account)}
              onDelete={() => setDeleting(account)}
              onSignInAgain={() => setSigningIn(account)}
            />
          ))}
        </Card>
      )}

      <AccountEditDialog
        account={editing}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        actions={actions}
      />
      <CreditsDetailDialog
        account={credits}
        open={credits !== null}
        onOpenChange={(open) => {
          if (!open) setCredits(null)
        }}
      />
      <AddAccountDialog open={adding} onOpenChange={setAdding} />
      <SignInAgainDialog
        account={signingIn}
        open={signingIn !== null}
        onOpenChange={(open) => {
          if (!open) setSigningIn(null)
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('Delete this account?')}
        desc={t(
          'The hub forgets the stored credential for {{nickname}}. Requests already routed to it are not affected.',
          { nickname: deleting?.nickname ?? '' }
        )}
        confirmText={t('Delete')}
        destructive
        handleConfirm={() => {
          if (!deleting) return
          actions.removeAccount.mutate(deleting.uid, {
            onSettled: () => setDeleting(null),
          })
        }}
        isLoading={actions.removeAccount.isPending}
      />
    </div>
  )
}
