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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import {
  acknowledgeVouchers,
  listPendingVouchers,
  openVouchers,
  type Voucher,
} from '../api'

/** The card behind the notice uses this to ask for it back. */
export const VOUCHER_OPEN_EVENT = 'new-api:open-vouchers'

const NO_VOUCHERS: Voucher[] = []

/**
 * Tells the account what has arrived and credits it. The money moves when the
 * notice closes — the same moment the tear used to pay it out — so the account
 * is credited once by reading what arrived, not by learning a gesture.
 */
export function CouponArrivalDialog() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const identity = useAuthStore(
    (state) => `${state.auth.user?.id}:${state.auth.session?.sid}`
  )
  const signedIn = useAuthStore((state) => Boolean(state.auth.user?.id))
  const setUser = useAuthStore((state) => state.auth.setUser)
  const client = useQueryClient()
  const [crediting, setCrediting] = useState(false)
  // Vouchers already sent to the server. A slow refetch must not put the same
  // money on screen a second time while the request is still open.
  const settled = useRef(new Set<number>())

  const arrivals = useQuery({
    queryKey: ['voucher-arrivals', identity],
    queryFn: ({ signal }) => listPendingVouchers(signal),
    enabled: signedIn,
    refetchInterval: 60_000,
    retry: false,
  })

  const pending = useMemo(
    () =>
      (arrivals.data?.items ?? NO_VOUCHERS).filter(
        (voucher) => !settled.current.has(voucher.id)
      ),
    [arrivals.data]
  )
  const total = pending.reduce((sum, voucher) => sum + voucher.face_value, 0)
  const visible = pending.length > 0

  // The card behind the notice counts the vouchers too, and asks for them back
  // through this event after the notice was closed.
  useEffect(() => {
    const reopen = () => {
      settled.current = new Set()
      void client.invalidateQueries({
        queryKey: ['voucher-arrivals', identity],
      })
    }
    window.addEventListener(VOUCHER_OPEN_EVENT, reopen)
    return () => window.removeEventListener(VOUCHER_OPEN_EVENT, reopen)
  }, [client, identity])

  const money = (quota: number) =>
    formatQuotaWithCurrency(quota, {
      locale,
      digitsLarge: 2,
      digitsSmall: 2,
    })

  const credit = useCallback(async () => {
    const ids = pending.map((voucher) => voucher.id)
    if (ids.length === 0) return
    for (const id of ids) settled.current.add(id)
    setCrediting(true)
    try {
      const result = await openVouchers(ids)
      if (result.opened.length > 0) {
        await acknowledgeVouchers(result.opened)
        const account = useAuthStore.getState().auth.user
        if (account && typeof result.balance === 'number') {
          setUser({ ...account, quota: result.balance })
        }
        toast.success(
          t('Added to your balance +{{amount}}', {
            amount: formatQuotaWithCurrency(result.opened_quota, {
              locale,
              digitsLarge: 2,
              digitsSmall: 2,
            }),
          })
        )
      }
    } catch (error) {
      // Nothing was credited, so the vouchers stay pending and the notice can
      // offer them again instead of hiding money that never arrived.
      for (const id of ids) settled.current.delete(id)
      handleServerError(error)
    } finally {
      setCrediting(false)
      void client.invalidateQueries({
        queryKey: ['voucher-arrivals', identity],
      })
    }
  }, [client, identity, locale, pending, setUser, t])

  return (
    <Dialog
      open={visible}
      onOpenChange={(next) => {
        if (!next) void credit()
      }}
      title={t('You received vouchers')}
      description={t('Closing this window adds them to your balance.')}
      contentClassName='sm:max-w-md'
      footer={
        <Button disabled={crediting} onClick={() => void credit()}>
          {crediting ? t('Crediting…') : t('Receive')}
        </Button>
      }
    >
      <dl className='border-border border-t'>
        {pending.map((voucher) => (
          <div
            key={voucher.id}
            className='border-border flex items-baseline justify-between gap-4 border-b py-2'
          >
            <dt className='text-muted-foreground min-w-0 truncate text-[13px]'>
              {voucher.reason || t('Voucher')}
            </dt>
            <dd className='text-right text-[15px] font-semibold tabular-nums'>
              {money(voucher.face_value)}
            </dd>
          </div>
        ))}
        {pending.length > 1 && (
          <div className='flex items-baseline justify-between gap-4 py-2'>
            <dt className='text-muted-foreground text-[13px]'>{t('Total')}</dt>
            <dd className='text-right text-[15px] font-semibold tabular-nums'>
              {money(total)}
            </dd>
          </div>
        )}
      </dl>
    </Dialog>
  )
}
