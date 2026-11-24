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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { hubGet } from '../../api'
import { refusalMessage } from './hub-call'
import { expiryTone, percentOf } from './lib'
import type {
  HubAccount,
  HubCreditsDetail,
  HubGrantRow,
  HubGrants,
} from './types'

type CreditsDetailDialogProps = {
  account: HubAccount | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const GRANT_STATUS_KEYS: Record<string, string> = {
  active: 'Active',
  available: 'Available',
  used_up: 'Used up',
}

/**
 * One account's packages and the grant history behind them. The package list
 * comes from the per-account call; the hub only reports grants for the whole
 * pool, so the history is filtered to this uid here.
 */
export function CreditsDetailDialog(props: CreditsDetailDialogProps) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const uid = props.account?.uid ?? ''

  const detail = useQuery({
    queryKey: ['workbuddy', 'accounts', 'credits', uid],
    enabled: props.open && uid !== '',
    queryFn: async () => {
      const response = await hubGet<HubCreditsDetail>(
        'accounts.credits.detail',
        {
          uid,
        }
      )
      if (!response.success) throw new Error(refusalMessage(response))
      return response.data
    },
  })

  const grants = useQuery({
    queryKey: ['workbuddy', 'accounts', 'grants'],
    enabled: props.open,
    queryFn: async () => {
      const response = await hubGet<HubGrants>('accounts.credits.grants')
      if (!response.success) throw new Error(refusalMessage(response))
      return response.data
    },
  })

  const credits = detail.data?.credits
  const packages = credits?.packages ?? []
  const rows = (grants.data?.rows ?? []).filter((row) => row.uid === uid)
  const refresh = (): void => {
    void queryClient.invalidateQueries({
      queryKey: ['workbuddy', 'accounts', 'credits', uid],
    })
    void queryClient.invalidateQueries({
      queryKey: ['workbuddy', 'accounts', 'grants'],
    })
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Credit details')}
      description={props.account?.nickname ?? ''}
      contentClassName='sm:max-w-2xl'
      footer={
        <Button variant='outline' onClick={refresh}>
          <RefreshCw />
          {t('Refresh')}
        </Button>
      }
    >
      <div className='space-y-4'>
        {detail.isPending && (
          <LoadingState size='sm' message={t('Loading...')} />
        )}
        {detail.isError && (
          <ErrorState
            compact
            description={detail.error.message}
            onRetry={refresh}
          />
        )}
        {credits && (
          <div>
            <div className='flex items-baseline justify-between gap-2 text-sm'>
              <span className='text-muted-foreground'>{t('Remaining')}</span>
              <span className='tabular-nums'>
                <span className='font-semibold'>
                  {formatNumber(Number(credits.remain ?? 0), locale)}
                </span>
                <span className='text-muted-foreground'>
                  {' / '}
                  {formatNumber(Number(credits.size ?? 0), locale)}
                </span>
              </span>
            </div>
            <Progress
              value={percentOf(
                Number(credits.remain ?? 0),
                Number(credits.size ?? 0)
              )}
              className='mt-1'
              aria-label={t('Credits remaining')}
            />
          </div>
        )}

        <section>
          <h4 className='mb-2 text-sm font-semibold'>{t('Packages')}</h4>
          {packages.length === 0 ? (
            <p className='text-muted-foreground text-xs'>{t('No packages')}</p>
          ) : (
            <ul className='max-h-56 overflow-y-auto rounded-md border px-3'>
              {packages.map((item) => {
                const tone = expiryTone(item.days_left)
                return (
                  <li
                    key={`${item.package_code}-${item.cycle_end_time}-${item.name}`}
                    className='flex items-center justify-between gap-3 border-b py-1.5 last:border-b-0'
                  >
                    <div className='min-w-0'>
                      <p className='truncate text-xs font-medium'>
                        {item.name}
                      </p>
                      <p className='text-muted-foreground truncate text-xs'>
                        {item.grant_reason}
                        {' · '}
                        {t('Ends {{when}}', { when: item.cycle_end_time })}
                      </p>
                    </div>
                    <div className='shrink-0 text-right text-xs tabular-nums'>
                      <p>
                        {formatNumber(Number(item.remain ?? 0), locale)}
                        {' / '}
                        {formatNumber(Number(item.size ?? 0), locale)}
                      </p>
                      <p
                        className={cn(
                          'text-muted-foreground',
                          tone === 'danger' && 'text-destructive',
                          tone === 'warning' && 'text-warning'
                        )}
                      >
                        {item.no_expiry
                          ? t('No expiry')
                          : t('{{days}} days left', {
                              days: Number(item.days_left ?? 0).toFixed(1),
                            })}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section>
          <h4 className='mb-2 text-sm font-semibold'>{t('Grant history')}</h4>
          {rows.length === 0 ? (
            <p className='text-muted-foreground text-xs'>{t('No grants')}</p>
          ) : (
            <ul className='max-h-56 overflow-y-auto rounded-md border px-3'>
              {rows.map((row) => (
                <GrantRow key={`${row.create_iso}-${row.name}`} row={row} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Dialog>
  )
}

function GrantRow(props: { row: HubGrantRow }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const row = props.row
  const statusKey = GRANT_STATUS_KEYS[row.status ?? ''] ?? ''
  return (
    <li className='flex items-center justify-between gap-3 border-b py-1.5 last:border-b-0'>
      <div className='min-w-0'>
        <p className='truncate text-xs font-medium'>{row.name}</p>
        <p className='text-muted-foreground truncate text-xs'>
          {row.grant_reason}
          {' · '}
          {row.create_iso}
        </p>
      </div>
      <div className='shrink-0 text-right text-xs tabular-nums'>
        <p>+{formatNumber(Number(row.size ?? 0), locale)}</p>
        <p className='text-muted-foreground'>
          {statusKey === '' ? (row.status ?? '') : t(statusKey)}
        </p>
      </div>
    </li>
  )
}
