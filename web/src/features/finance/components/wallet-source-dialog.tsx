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

import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatExpenseAmount } from '@/features/rankings/lib'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getFinanceUsers } from '../api'

const PAGE_SIZE = 20

/** The per-user wallet split, so the overview totals can be checked. */
export function WalletSourceDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const query = useQuery({
    queryKey: ['finance-users', search, offset],
    queryFn: async () =>
      requireServerSuccess(
        await getFinanceUsers({ offset, limit: PAGE_SIZE, search })
      ),
    enabled: props.open,
  })
  const items = query.data?.data?.items ?? []
  const total = query.data?.data?.total ?? 0
  const money = (value: number) => formatExpenseAmount(value, i18n.language)

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Wallet source by user')}
      description={t(
        'Paid balance is spent first, then gift balance. Quota that no record explains is treated as a gift.'
      )}
      contentClassName='sm:max-w-3xl'
      footer={
        <div className='flex w-full items-center justify-between gap-3'>
          <span className='text-muted-foreground text-xs tabular-nums'>
            {total === 0 ? '0' : `${offset + 1}-${offset + items.length}`} /{' '}
            {total}
          </span>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}
            >
              {t('Previous')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={offset + items.length >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              {t('Next')}
            </Button>
          </div>
        </div>
      }
    >
      <div className='space-y-3'>
        <Input
          aria-label={t('Search users')}
          placeholder={t('Search users')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setOffset(0)
          }}
        />
        {items.length === 0 ? (
          <p className='text-muted-foreground py-8 text-center text-sm'>
            {query.isLoading ? t('Loading') : t('No matching users.')}
          </p>
        ) : (
          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('User')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead className='text-right'>{t('Balance')}</TableHead>
                  <TableHead className='text-right'>{t('Paid')}</TableHead>
                  <TableHead className='text-right'>{t('Gift')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <span className='font-medium'>
                        {user.display_name || user.username}
                      </span>
                      <span className='text-muted-foreground ml-2 text-xs'>
                        #{user.id}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant='outline'>
                        {user.status === 1 ? t('Enabled') : t('Disabled')}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {money(user.balance)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {money(user.paid)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {money(user.gift)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Dialog>
  )
}
