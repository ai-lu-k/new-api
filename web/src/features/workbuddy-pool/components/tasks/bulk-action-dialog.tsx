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
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'

import type { WorkBuddyAccount } from '../../types'

/** How many account names the dialog spells out before it summarises. */
const NAMED_ACCOUNTS = 10

/**
 * A confirm dialog for an action that hits every matching account at once. The
 * account list is the point: the operator sees exactly who is about to be
 * touched, not just a count.
 */
export function BulkActionDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  desc: string
  confirmText: string
  accounts: WorkBuddyAccount[]
  isLoading: boolean
  onConfirm: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const named = props.accounts.slice(0, NAMED_ACCOUNTS)
  const hidden = props.accounts.length - named.length

  return (
    <ConfirmDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.title}
      desc={props.desc}
      confirmText={props.confirmText}
      isLoading={props.isLoading}
      disabled={props.accounts.length === 0}
      handleConfirm={props.onConfirm}
    >
      <div className='rounded-md border px-3 py-2 text-xs'>
        <p className='font-medium'>
          {t('Accounts this will touch ({{accounts}})', {
            accounts: props.accounts.length,
          })}
        </p>
        {props.accounts.length === 0 ? (
          <p className='text-muted-foreground mt-1'>
            {t('No account matches right now.')}
          </p>
        ) : (
          <ul className='text-muted-foreground mt-1 space-y-0.5'>
            {named.map((account) => (
              <li key={account.uid}>
                {account.nickname || account.uid.slice(0, 8)}
              </li>
            ))}
            {hidden > 0 && (
              <li>{t('and {{remaining}} more', { remaining: hidden })}</li>
            )}
          </ul>
        )}
      </div>
    </ConfirmDialog>
  )
}
