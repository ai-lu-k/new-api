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
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { handleServerError } from '@/lib/handle-server-error'

import { createUpstreamAccount, updateUpstreamAccount } from '../api'
import { formatCurrencyAmount } from '../lib'
import type { UpstreamAccount, UpstreamAccountInput } from '../types'

/** The currencies the payment history is likely to use; the gateway's own
 * display type is not trusted, so the operator picks one. */
const UPSTREAM_CURRENCIES = [
  'CNY',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'HKD',
  'TWD',
  'SGD',
]

/**
 * Adds or edits one funding pool. The credential is only ever sent to the
 * server and is never read back, so editing shows an empty field.
 */
export function UpstreamAccountDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: UpstreamAccount
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(props.account?.name ?? '')
  const [provider, setProvider] = useState<UpstreamAccountInput['provider']>(
    props.account?.provider ?? 'openai'
  )
  const isNewApi = provider === 'newapi'
  // codex789 reads its wallet and its redemption payments from the provider
  // panel with a refresh token, so it needs the same base URL and credential
  // fields as a gateway.
  const isCodex789 = provider === 'codex789'
  // OpenLux is a new-api gateway too, but it also needs the account id beside
  // the access token, so the stored credential is "<account id>:<token>".
  const isOpenLux = provider === 'openlux'
  const needsCurrency = isNewApi || isCodex789 || isOpenLux
  // A pool provider reads a host-side report instead of a credential, so the
  // key, base URL and currency fields are all hidden for it.
  const isPool = provider === 'commandcode' || provider === 'workbuddy'
  const [baseUrl, setBaseUrl] = useState(props.account?.base_url ?? '')
  const [credential, setCredential] = useState('')
  const [channelId, setChannelId] = useState(
    String(props.account?.balance_channel_id ?? 0)
  )
  const [manualBalance, setManualBalance] = useState(
    props.account?.manual_balance == null
      ? ''
      : String(props.account.manual_balance)
  )
  const [currency, setCurrency] = useState(props.account?.currency ?? 'CNY')
  const [exchangeRate, setExchangeRate] = useState(
    String(props.account?.exchange_rate ?? 1)
  )
  const currencies = UPSTREAM_CURRENCIES.includes(currency)
    ? UPSTREAM_CURRENCIES
    : [currency, ...UPSTREAM_CURRENCIES]
  const foreignCurrency = currency !== 'CNY'
  const editing = props.account != null
  let credentialLabel = t('Admin key')
  let credentialPlaceholder = t('Admin key used to read the cost report')
  let baseUrlPlaceholder = t('Optional; defaults to the official API')
  if (isNewApi) {
    credentialLabel = t('Access token')
    baseUrlPlaceholder = t(
      'Gateway address, for example https://gateway.example.com'
    )
  }
  if (isCodex789) {
    credentialLabel = t('Refresh token')
    baseUrlPlaceholder = t(
      'Provider address, for example https://provider.example.test'
    )
  }
  if (isOpenLux) {
    credentialLabel = t('Account id and access token')
    baseUrlPlaceholder = t(
      'Gateway address, for example https://gateway.example.com'
    )
  }
  if (editing) {
    credentialPlaceholder = t('Leave empty to keep the current key')
  } else if (isNewApi) {
    credentialPlaceholder = t('Access token that can read usage')
  } else if (isCodex789) {
    credentialPlaceholder = t(
      'Refresh token that can read the balance (not a model key)'
    )
  } else if (isOpenLux) {
    credentialPlaceholder = t('Account id, a colon, then the access token')
  }

  let description = t(
    'The seven-day usage is read from the provider cost report. Balance is optional: pick a channel or type it in by hand.'
  )
  if (isNewApi) {
    description = t(
      'The seven-day usage, the wallet and the top-up history are read from the gateway itself.'
    )
  }
  if (isCodex789) {
    description = t(
      'The balance and the redemption payments are read from the provider panel with the refresh token.'
    )
  }
  if (isOpenLux) {
    description = t(
      'The seven-day usage, the wallet and the top-up history are read from OpenLux. Amounts are in USD: paste the account id, a colon, then the access token.'
    )
  }
  if (provider === 'commandcode') {
    description = t(
      'The local pool records purchase costs automatically: Go {{goCost}} and Goat {{goatCost}} per account. Existing members are included.',
      {
        goCost: formatCurrencyAmount(10, 'CNY', i18n.language),
        goatCost: formatCurrencyAmount(35, 'CNY', i18n.language),
      }
    )
  }
  if (provider === 'workbuddy') {
    description = t(
      'The local pool records each account bought at {{cost}} and reports its balance and seven-day usage in credits.',
      { cost: formatCurrencyAmount(5, 'CNY', i18n.language) }
    )
  }

  async function submit() {
    if (name.trim() === '') {
      toast.error(t('The account name is required.'))
      return
    }
    if (!editing && !isPool && credential.trim() === '') {
      toast.error(t('A credential is required.'))
      return
    }
    if (needsCurrency && baseUrl.trim() === '') {
      toast.error(
        t(
          isCodex789
            ? 'The provider address is required.'
            : 'The gateway address is required.'
        )
      )
      return
    }
    if (needsCurrency && foreignCurrency) {
      const rate = Number(exchangeRate)
      if (!Number.isFinite(rate) || rate <= 0) {
        toast.error(t('Enter a positive exchange rate.'))
        return
      }
    }
    const balance = manualBalance.trim()
    const payload: UpstreamAccountInput = {
      name: name.trim(),
      provider,
      base_url: baseUrl.trim(),
      credential: credential.trim(),
      balance_channel_id: Number(channelId) || 0,
      manual_balance: balance === '' ? null : Number(balance),
      currency: needsCurrency ? currency : 'CNY',
      exchange_rate:
        needsCurrency && foreignCurrency ? Number(exchangeRate) : 1,
    }
    if (
      payload.manual_balance != null &&
      (!Number.isFinite(payload.manual_balance) || payload.manual_balance < 0)
    ) {
      toast.error(t('The manual balance must be zero or more.'))
      return
    }
    setSaving(true)
    try {
      const response =
        editing && props.account
          ? await updateUpstreamAccount(props.account.id, payload)
          : await createUpstreamAccount(payload)
      if (!response.success) {
        throw new Error(response.message || t('Unable to save the account.'))
      }
      toast.success(t('Saved successfully'))
      await queryClient.invalidateQueries({
        queryKey: ['finance-upstream-accounts'],
      })
      await queryClient.invalidateQueries({ queryKey: ['finance-operations'] })
      props.onOpenChange(false)
    } catch (error) {
      handleServerError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={editing ? t('Edit upstream account') : t('Add upstream account')}
      description={description}
      footer={
        <div className='flex justify-end gap-2'>
          <Button
            variant='outline'
            onClick={() => props.onOpenChange(false)}
            disabled={saving}
          >
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? t('Saving') : t('Save')}
          </Button>
        </div>
      }
    >
      <div className='grid gap-4'>
        <div className='grid gap-1.5'>
          <Label htmlFor='upstream-account-name'>{t('Account name')}</Label>
          <Input
            id='upstream-account-name'
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('For example, OpenAI main org')}
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='upstream-account-provider'>{t('Provider')}</Label>
          <NativeSelect
            id='upstream-account-provider'
            disabled={
              props.account?.provider === 'commandcode' ||
              props.account?.provider === 'workbuddy'
            }
            className='w-full'
            value={provider}
            onChange={(event) => {
              const next = event.target
                .value as UpstreamAccountInput['provider']
              setProvider(next)
              // island AI Coding prices in USD and sells a $10 code for about
              // ¥10.3, so its booking rate is known; the operator can still
              // change it.
              if (next === 'codex789' && !editing) {
                setCurrency('USD')
                setExchangeRate('1.03')
              }
              // OpenLux charges in USD too; the rate is a starting value the
              // operator can correct against their own payment.
              if (next === 'openlux' && !editing) {
                setCurrency('USD')
                setExchangeRate('6.69')
              }
            }}
          >
            <NativeSelectOption
              value='commandcode'
              disabled={editing && !isPool}
            >
              CommandCode
            </NativeSelectOption>
            <NativeSelectOption value='workbuddy' disabled={editing && !isPool}>
              WorkBuddy
            </NativeSelectOption>
            <NativeSelectOption value='openai'>OpenAI</NativeSelectOption>
            <NativeSelectOption value='anthropic'>Anthropic</NativeSelectOption>
            <NativeSelectOption value='newapi'>
              {t('New API gateway')}
            </NativeSelectOption>
            <NativeSelectOption value='codex789'>
              {t('codex789 (island AI Coding)')}
            </NativeSelectOption>
            <NativeSelectOption value='openlux'>OpenLux</NativeSelectOption>
          </NativeSelect>
        </div>
        {!isPool && (
          <>
            <div className='grid gap-1.5'>
              <Label htmlFor='upstream-account-key'>{credentialLabel}</Label>
              <Input
                id='upstream-account-key'
                type='password'
                autoComplete='off'
                value={credential}
                onChange={(event) => setCredential(event.target.value)}
                placeholder={credentialPlaceholder}
              />
              {isCodex789 && (
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Paste the refresh token from the island AI Coding console; a model API key is not accepted.'
                  )}
                </p>
              )}
              {isOpenLux && (
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'OpenLux needs the account id beside the token: paste "<account id>:<access token>", not the token alone.'
                  )}
                </p>
              )}
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='upstream-account-base-url'>{t('Base URL')}</Label>
              <Input
                id='upstream-account-base-url'
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder={baseUrlPlaceholder}
              />
              {isNewApi && (
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'The token needs usage read access; reading the wallet needs profile:read.'
                  )}
                </p>
              )}
            </div>
          </>
        )}
        {needsCurrency && (
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='grid gap-1.5'>
              <Label htmlFor='upstream-account-currency'>
                {t('Upstream currency')}
              </Label>
              <NativeSelect
                id='upstream-account-currency'
                className='w-full'
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                {currencies.map((code) => (
                  <NativeSelectOption key={code} value={code}>
                    {code}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'The currency the gateway records top-ups in. Usage and wallet stay in USD.'
                )}
              </p>
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='upstream-account-rate'>
                {t('Exchange rate (CNY per 1 {{currency}})', {
                  currency,
                })}
              </Label>
              <Input
                id='upstream-account-rate'
                inputMode='decimal'
                value={foreignCurrency ? exchangeRate : '1'}
                disabled={!foreignCurrency}
                onChange={(event) => setExchangeRate(event.target.value)}
              />
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Top-ups are booked as expenses at this rate; fixing it updates them on the next refresh.'
                )}
              </p>
            </div>
          </div>
        )}
        {!isPool && (
          <div className='grid gap-4 sm:grid-cols-2'>
            {!needsCurrency && (
              <div className='grid gap-1.5'>
                <Label htmlFor='upstream-account-channel'>
                  {t('Balance channel')}
                </Label>
                <Input
                  id='upstream-account-channel'
                  inputMode='numeric'
                  value={channelId}
                  onChange={(event) => setChannelId(event.target.value)}
                  placeholder={t('Channel ID, or 0 for none')}
                />
              </div>
            )}
            <div className='grid gap-1.5'>
              <Label htmlFor='upstream-account-balance'>
                {t('Manual balance (USD)')}
              </Label>
              <Input
                id='upstream-account-balance'
                inputMode='decimal'
                value={manualBalance}
                onChange={(event) => setManualBalance(event.target.value)}
                placeholder={t('Leave empty if unknown')}
              />
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
