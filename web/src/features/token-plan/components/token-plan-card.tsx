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
import { Copy, Eye, EyeOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { CopyButton } from '@/components/copy-button'
import { ErrorState } from '@/components/error-state'
import { LearnMore } from '@/components/learn-more'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { SecureVerificationDialog } from '@/features/auth/secure-verification'
import { QuickImportDialog } from '@/features/keys/components/dialogs/quick-import-dialog'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'

import '@/styles/token-plan.css'
import { useAuthStore } from '@/stores/auth-store'

import { listPendingVouchers, type Voucher } from '../api'
import { useTokenPlan } from '../hooks/use-token-plan'
import { VOUCHER_OPEN_EVENT } from './coupon-arrival-dialog'

const NO_VOUCHERS: Voucher[] = []

// The card answers two questions: how much money the account holds, and how
// much of it is still sitting behind a seal. The weekly allowance and its reset
// timestamp belonged to the coupon cycle and are gone with it.
export function TokenPlanCard(props: { compact?: boolean }) {
  const compact = props.compact === true
  const { t, i18n } = useTranslation()
  const plan = useTokenPlan()
  const identity = useAuthStore(
    (state) => `${state.auth.user?.id}:${state.auth.session?.sid}`
  )
  const signedIn = useAuthStore((state) => Boolean(state.auth.user?.id))
  const balance = useAuthStore((state) => Number(state.auth.user?.quota ?? 0))
  const [resetOpen, setResetOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const copyAfterReveal = useRef(false)
  const { copyToClipboard } = useCopyToClipboard({ notify: false })
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const status = plan.status.data
  const ready = Boolean(status?.token_id) && !plan.pending
  const currencyOptions = { locale, digitsSmall: 4 }

  const pending = useQuery({
    queryKey: ['voucher-arrivals', identity],
    queryFn: ({ signal }) => listPendingVouchers(signal),
    enabled: signedIn,
    refetchInterval: 60_000,
    retry: false,
  })
  const vouchers = pending.data?.items ?? NO_VOUCHERS
  const nearestExpiry =
    vouchers.length > 0
      ? Math.min(...vouchers.map((voucher) => voucher.expires_at))
      : 0

  useEffect(() => {
    if (!copyAfterReveal.current || !plan.key) return
    copyAfterReveal.current = false
    void copyToClipboard(plan.key)
  }, [copyToClipboard, plan.key])

  const openImport = async () => {
    if (plan.key || (await plan.perform('read'))) setImportOpen(true)
  }

  return (
    <section
      className={cn(
        'token-plan-surface bg-card flex min-w-0 flex-col rounded-xl border',
        compact ? 'shrink-0' : 'h-full'
      )}
      aria-label={t('Balance and vouchers')}
    >
      <header
        className={cn(
          'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b',
          compact ? 'min-h-11 px-4 py-2' : 'min-h-14 px-5 py-3'
        )}
      >
        <h3 className='text-base font-semibold'>{t('Balance and vouchers')}</h3>
        {status && (
          <span className='text-muted-foreground text-xs'>
            LV{status.level}
          </span>
        )}
      </header>
      <div className='flex flex-1 flex-col'>
        {plan.status.isError && (
          <ErrorState onRetry={() => void plan.status.refetch()} />
        )}
        {plan.status.isPending && (
          <p className='text-muted-foreground text-sm'>{t('Loading...')}</p>
        )}
        {status && (
          <div
            className={cn(
              'grid flex-1 lg:grid-cols-5',
              compact
                ? 'gap-x-5 gap-y-2.5 p-3'
                : 'gap-x-6 gap-y-5 p-5 sm:grid-cols-2 sm:gap-y-0'
            )}
          >
            <section
              aria-label={t('Balance')}
              className={cn(
                'flex min-w-0 flex-col lg:col-span-2',
                compact ? 'gap-1.5' : 'gap-3'
              )}
            >
              <p className='text-sm font-medium'>{t('Balance')}</p>
              <p
                className={cn(
                  compact ? 'text-3xl' : 'text-4xl',
                  'font-semibold tracking-tight tabular-nums'
                )}
              >
                {formatQuotaWithCurrency(balance, currencyOptions)}
              </p>
              <div
                className={cn(
                  'text-muted-foreground text-xs',
                  compact
                    ? 'flex flex-wrap items-center gap-x-1.5'
                    : 'flex flex-col gap-1'
                )}
              >
                {vouchers.length > 0 ? (
                  // The notice is the only place that opens a voucher, so the
                  // count has to be able to bring it back after it was closed.
                  <button
                    type='button'
                    className='hover:text-foreground w-fit text-start underline-offset-2 hover:underline'
                    onClick={() =>
                      window.dispatchEvent(new Event(VOUCHER_OPEN_EVENT))
                    }
                  >
                    {t('{{count}} vouchers to open', {
                      count: vouchers.length,
                    })}
                  </button>
                ) : (
                  <span>{t('No vouchers to open')}</span>
                )}
                {nearestExpiry > 0 && (
                  <>
                    {compact && <span aria-hidden='true'>·</span>}
                    <time
                      dateTime={new Date(nearestExpiry * 1000).toISOString()}
                    >
                      {t('Nearest expires at {{time}}', {
                        time: new Date(nearestExpiry * 1000).toLocaleString(
                          locale,
                          {
                            timeZone: 'Asia/Shanghai',
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          }
                        ),
                      })}
                    </time>
                  </>
                )}
              </div>
            </section>
            <section
              aria-label={t('API Key')}
              className={cn(
                'flex min-w-0 flex-col border-t',
                compact
                  ? 'gap-2.5 pt-3 lg:col-span-3'
                  : '-mx-5 -mb-5 mt-5 gap-3 px-5 py-4 sm:col-span-2 lg:col-span-3 lg:mx-0 lg:mb-0 lg:mt-0 lg:px-0 lg:pt-4 lg:pb-0'
              )}
            >
              <div className='grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 sm:flex sm:flex-wrap'>
                <h4 className='col-span-2 mr-auto text-sm font-medium'>
                  {status.retired ? t('API Key') : t('Token Plan Key')}
                </h4>
                {!status.retired && (
                  <div className='flex min-h-8 items-center gap-1.5'>
                    <label
                      className='flex min-h-8 items-center gap-2 text-xs'
                      htmlFor='token-plan-wallet-fallback'
                    >
                      {t('Continue with balance')}
                      <Switch
                        id='token-plan-wallet-fallback'
                        checked={status.wallet_fallback}
                        disabled={!ready}
                        onCheckedChange={(enabled) =>
                          void plan.perform('settings', {
                            walletFallback: enabled,
                          })
                        }
                      />
                    </label>
                    <LearnMore
                      triggerProps={{
                        type: 'button',
                        'aria-label': t('Explain balance continuation'),
                      }}
                      contentProps={{
                        collisionPadding: 16,
                        className:
                          'w-72 max-w-[calc(100vw-2rem)] text-xs leading-5',
                      }}
                    >
                      {t(
                        'When the free quota cannot cover a request, the excess is charged to your balance. When off, such requests are rejected.'
                      )}
                    </LearnMore>
                  </div>
                )}
                <Button
                  className='w-28'
                  disabled={!ready}
                  onClick={() => void openImport()}
                >
                  {t('Quick import')}
                </Button>
              </div>
              {compact ? (
                <div className='flex min-w-0 items-center gap-2'>
                  <div className='relative min-w-0 flex-1'>
                    <code className='bg-muted/30 flex h-8 w-full items-center truncate rounded-lg border py-0 pr-9 pl-3 text-xs'>
                      {plan.key || status.masked_key}
                    </code>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='absolute top-1/2 right-1 size-6 -translate-y-1/2'
                      aria-label={plan.key ? t('Hide') : t('Show')}
                      disabled={!ready}
                      onClick={() =>
                        plan.key ? plan.clearKey() : void plan.perform('read')
                      }
                    >
                      {plan.key ? (
                        <EyeOff className='size-3.5' aria-hidden='true' />
                      ) : (
                        <Eye className='size-3.5' aria-hidden='true' />
                      )}
                    </Button>
                  </div>
                  {plan.key ? (
                    <CopyButton
                      size='default'
                      variant='outline'
                      className='w-24'
                      value={plan.key}
                      aria-label={t('Copy API key')}
                    >
                      {t('Copy')}
                    </CopyButton>
                  ) : (
                    <Button
                      className='w-24'
                      variant='outline'
                      disabled={!ready}
                      onClick={() => {
                        copyAfterReveal.current = true
                        void plan.perform('read').then((revealed) => {
                          if (!revealed) copyAfterReveal.current = false
                        })
                      }}
                    >
                      <Copy className='size-4' aria-hidden='true' />
                      {t('Copy')}
                    </Button>
                  )}
                  <Button
                    className='w-24'
                    variant='outline'
                    disabled={!ready}
                    onClick={() => setResetOpen(true)}
                  >
                    {t('Reset Key')}
                  </Button>
                </div>
              ) : (
                <div className='flex min-w-0 flex-wrap items-center gap-2'>
                  <code className='bg-muted/30 flex h-9 min-w-0 basis-full items-center truncate rounded-lg border px-3 text-xs sm:flex-1 sm:basis-0'>
                    {plan.key || status.masked_key}
                  </code>
                  <div className='ml-auto flex items-center gap-2'>
                    {plan.key ? (
                      <>
                        <CopyButton
                          size='default'
                          variant='outline'
                          value={plan.key}
                          aria-label={t('Copy API key')}
                        />
                        <Button variant='outline' onClick={plan.clearKey}>
                          {t('Hide')}
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant='outline'
                        disabled={!ready}
                        onClick={() => void plan.perform('read')}
                      >
                        {t('Show')}
                      </Button>
                    )}
                    <Button
                      className='w-28'
                      variant='outline'
                      disabled={!ready}
                      onClick={() => setResetOpen(true)}
                    >
                      {t('Reset Key')}
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={t('Reset Key')}
        desc={t(
          'The old Key will stop working immediately. Your balance and vouchers will stay unchanged.'
        )}
        isLoading={plan.pending}
        handleConfirm={() => {
          setResetOpen(false)
          void plan.perform('rotate')
        }}
      />
      <SecureVerificationDialog {...plan.verificationDialogProps} />
      <QuickImportDialog
        open={importOpen && Boolean(plan.key)}
        onOpenChange={(open) => {
          setImportOpen(open)
          if (!open) plan.clearKey()
        }}
        keyId={status?.token_id ?? 0}
        keyName='Token Plan'
        allowSetupCode={false}
        tokenKey={plan.key}
      />
    </section>
  )
}
