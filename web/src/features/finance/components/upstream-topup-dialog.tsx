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
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listUpstreamTopUps } from '../api'
import { formatCurrencyAmount } from '../lib'
import type { UpstreamAccount } from '../types'

const STATUS_KEYS: Record<string, string> = {
  success: 'Success',
  failed: 'Failed',
  pending: 'Pending',
}

/**
 * The payments a new-api gateway recorded for one account, at the rate the
 * site books them as expenses.
 */
export function UpstreamTopUpDialog(props: {
  account: UpstreamAccount
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const query = useQuery({
    queryKey: ['finance-upstream-topups', props.account.id],
    queryFn: async () =>
      requireServerSuccess(await listUpstreamTopUps(props.account.id)),
    enabled: props.open,
  })
  const rows = query.data?.data?.items ?? []
  const money = (amount: number, currency: string) =>
    formatCurrencyAmount(amount, currency || 'CNY', i18n.language)
  // Each pool names its payments differently: a subscription, a bought
  // account, or a plain top-up.
  const poolCopy: Record<string, { title: string; description: string }> = {
    commandcode: {
      title: 'Subscription purchases',
      description: 'Purchase costs recorded for {{name}}.',
    },
    workbuddy: {
      title: 'Account purchases',
      description: 'Accounts bought for {{name}}, one row each.',
    },
  }
  const copy = poolCopy[props.account.provider] ?? {
    title: 'Top-up history',
    description: 'Payments the gateway recorded for {{name}}.',
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t(copy.title)}
      description={t(copy.description, {
        name: props.account.name,
      })}
      contentHeight='60vh'
      footer={
        <Button variant='outline' onClick={() => props.onOpenChange(false)}>
          {t('Close')}
        </Button>
      }
    >
      {query.isLoading && (
        <p className='text-muted-foreground py-8 text-center text-sm'>
          {t('Loading')}
        </p>
      )}
      {query.isError && (
        <p className='text-muted-foreground py-8 text-center text-sm'>
          {t('Unable to load the top-up history.')}
        </p>
      )}
      {!query.isLoading && !query.isError && rows.length === 0 && (
        <p className='text-muted-foreground py-8 text-center text-sm'>
          {t('No top-up records yet.')}
        </p>
      )}
      {rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Date')}</TableHead>
              <TableHead className='text-right'>{t('Amount')}</TableHead>
              <TableHead className='text-right'>{t('In CNY')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className='whitespace-nowrap'>
                  {dayjs.unix(row.paid_at).format('YYYY-MM-DD HH:mm')}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {money(row.paid, row.currency)}
                  {row.method && (
                    <span className='text-muted-foreground block text-xs'>
                      {row.method}
                    </span>
                  )}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {money(row.paid * row.rate, 'CNY')}
                </TableCell>
                <TableCell>
                  {STATUS_KEYS[row.status]
                    ? t(STATUS_KEYS[row.status])
                    : row.status}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Dialog>
  )
}
