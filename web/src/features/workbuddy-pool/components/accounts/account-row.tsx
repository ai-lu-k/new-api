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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toIntlLocale } from '@/i18n/languages'
import { cn } from '@/lib/utils'

import { AccountCredits } from './account-credits'
import { AccountRowActions } from './account-row-actions'
import {
  ACCOUNT_STATE_VARIANTS,
  accountState,
  errorLabel,
  expiryShort,
  type AccountStateKind,
} from './lib'
import type { HubAccount } from './types'
import type { AccountActions } from './use-account-actions'

type AccountRowProps = {
  account: HubAccount
  actions: AccountActions
  onEdit: () => void
  onCredits: () => void
  onDelete: () => void
  onSignInAgain: () => void
}

/** One account in the pool: what it is, what it holds, and what is wrong. */
export function AccountRow(props: AccountRowProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [showError, setShowError] = useState(false)
  const account = props.account
  const kind = accountState(account)
  const stateLabels: Record<AccountStateKind, string> = {
    ready: t('Ready'),
    disabled: t('Disabled'),
    credential: t('Credential expired'),
    reserve: t('Reserve line'),
    dailyTokens: t('Daily token limit'),
    dailyCredits: t('Daily credit limit'),
    breaker: t('Circuit open'),
    degrade: t('Degraded'),
    cooldown: t('Cooling down'),
    expired: t('Expired'),
  }
  const stateHints: Record<AccountStateKind, string> = {
    ready: t(
      'Enabled and inside every guard rail, so the pool can route to it.'
    ),
    disabled: t(
      'The account takes no API traffic. Check-in and tasks can still run.'
    ),
    credential: t(
      'The upstream rejected the login or the token has expired. Sign in again.'
    ),
    reserve: t(
      'The remaining credits are under the reserve line, so the pool skips this account.'
    ),
    dailyTokens: t(
      'The daily token budget is used up. It resumes after local midnight.'
    ),
    dailyCredits: t(
      'The daily credit budget is used up. Only free models remain until local midnight.'
    ),
    breaker: t(
      'The upstream failed repeatedly, so the account rests for a while. The credential itself is fine.'
    ),
    degrade: t(
      'Unknown failures repeated, so the account is down-weighted for a while.'
    ),
    cooldown: t(
      'The upstream rate-limited this account. It rejoins the pool when the cooldown ends.'
    ),
    expired: t('The access token has expired.'),
  }
  const credentialBad =
    account.tokenExpired ||
    account.needRelogin ||
    account.expiresIn === 'expired'
  const realmLabel = account.realm === 'cn' ? t('China') : t('International')
  const tierPackage = account.tier?.package ?? ''

  return (
    <div className='px-4 py-3'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='flex min-w-0 flex-wrap items-center gap-2'>
          <span className='truncate text-sm font-semibold'>
            {account.nickname}
          </span>
          <Badge variant='outline'>{realmLabel}</Badge>
          {tierPackage !== '' && (
            <Badge variant='secondary'>{tierPackage}</Badge>
          )}
          {account.apiKey && <Badge variant='outline'>API Key</Badge>}
          <StatusBadge
            variant={ACCOUNT_STATE_VARIANTS[kind]}
            label={stateLabels[kind]}
            copyable={false}
            title={stateHints[kind]}
          />
        </div>
        <div className='flex items-center gap-2'>
          <span className='text-muted-foreground text-xs'>
            {t('Weight {{weight}}', { weight: account.weight ?? 1 })}
          </span>
          <Switch
            size='sm'
            checked={account.enabled}
            aria-label={t('Enable this account')}
            disabled={props.actions.setAccount.isPending}
            onCheckedChange={(checked) =>
              props.actions.setAccount.mutate({
                uid: account.uid,
                patch: { enabled: checked },
              })
            }
          />
        </div>
      </div>

      <div className='text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
        <span className='font-mono'>
          {account.uid.slice(0, 8)} · {account.source}
        </span>
        <span className={cn(credentialBad && 'text-destructive')}>
          {t('Expires in {{when}}', { when: expiryShort(account.expiresIn) })}
        </span>
        <span>
          {t('Proxy slot {{slot}}', {
            slot: account.proxySlot || t('Default'),
          })}
        </span>
        {account.note !== '' && (
          <span className='truncate'>{account.note}</span>
        )}
        {account.tasksEnabled === false && <span>{t('Tasks off')}</span>}
      </div>

      <AccountCredits account={account} locale={locale} />

      {account.lastError !== '' && (
        <div className='mt-2 space-y-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='destructive'>
              {errorLabel(account.lastError, account.lastErrorDetail)}
            </Badge>
            {account.lastErrorDetail && (
              <Button
                size='xs'
                variant='link'
                aria-expanded={showError}
                onClick={() => setShowError(!showError)}
              >
                {showError ? t('Hide details') : t('Show details')}
              </Button>
            )}
          </div>
          {showError && account.lastErrorDetail && (
            <pre className='bg-muted max-h-40 overflow-auto rounded-md p-2 text-xs break-all whitespace-pre-wrap'>
              {account.lastErrorDetail}
            </pre>
          )}
        </div>
      )}

      <div className='mt-2'>
        <AccountRowActions
          account={account}
          actions={props.actions}
          onEdit={props.onEdit}
          onCredits={props.onCredits}
          onDelete={props.onDelete}
          onSignInAgain={props.onSignInAgain}
        />
      </div>
    </div>
  )
}
