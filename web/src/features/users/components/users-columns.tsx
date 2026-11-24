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
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { LongText } from '@/components/long-text'
import { StatusBadge } from '@/components/status-badge'
import { TableId } from '@/components/table-id'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { UsageLevelBadge } from '@/features/usage-level/components/usage-level-badge'
import { USAGE_LEVEL_VISIBLE } from '@/features/usage-level/visibility'
import { getCurrencyDisplay } from '@/lib/currency'
import { formatQuota } from '@/lib/format'
import { useSystemConfigStore } from '@/stores/system-config-store'

import {
  USER_STATUS,
  USER_STATUSES,
  USER_ROLES,
  isUserDeleted,
} from '../constants'
import type { User } from '../types'
import { DataTableRowActions } from './data-table-row-actions'
import { UserIdentityCell } from './user-identity-cell'
import { UserQuotaCell } from './user-quota-cell'
import { UserQuotaHeader } from './user-quota-header'

export function useUsersColumns(): ColumnDef<User>[] {
  const { t } = useTranslation()
  const currencyConfig = useSystemConfigStore((state) => state.config.currency)
  const { meta: currency } = getCurrencyDisplay()
  const quotaUnit = currency.kind === 'tokens' ? t('Tokens') : currency.symbol
  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        accessorKey: 'id',
        header: t('ID'),
        cell: ({ row }) => {
          return (
            <TableId
              value={row.getValue('id') as number}
              className='w-[60px] [font-family:inherit] text-sm'
            />
          )
        },
        size: 80,
        meta: { mobileOrder: 10 },
      },
      {
        accessorKey: 'username',
        header: t('Username'),
        cell: ({ row }) => <UserIdentityCell user={row.original} />,
        enableHiding: false,
        size: 320,
        meta: { mobileTitle: true },
      },
      {
        accessorKey: 'status',
        header: t('Status'),
        cell: ({ row }) => {
          const user = row.original
          const requestCount = user.request_count

          const statusConfig = isUserDeleted(user)
            ? USER_STATUSES[USER_STATUS.DELETED]
            : USER_STATUSES[user.status as keyof typeof USER_STATUSES]

          if (!statusConfig) {
            return null
          }

          return (
            <Tooltip>
              <TooltipTrigger render={<div className='-ml-1.5 cursor-help' />}>
                <StatusBadge
                  label={t(statusConfig.labelKey)}
                  variant={
                    isUserDeleted(user) ? 'neutral' : statusConfig.variant
                  }
                  copyable={false}
                  className='font-normal'
                />
              </TooltipTrigger>
              <TooltipContent>
                <p className='text-xs'>
                  {t('Requests:')} {requestCount.toLocaleString()}
                </p>
              </TooltipContent>
            </Tooltip>
          )
        },
        filterFn: (row, id, value) => {
          return value.includes(String(row.getValue(id)))
        },
        enableSorting: false,
        size: 120,
        meta: { mobileBadge: true },
      },
      {
        id: 'quota',
        accessorKey: 'quota',
        // The heading picks which of the four figures sorts the list, so it
        // replaces the shared header menu instead of using a string title.
        header: ({ table }) => (
          <UserQuotaHeader table={table} unit={quotaUnit} />
        ),
        cell: ({ row }) => {
          const user = row.original
          return (
            <UserQuotaCell
              remaining={user.quota}
              used={user.used_quota}
              usageSource={user.usage_source}
            />
          )
        },
        size: 210,
        minSize: 190,
        // Cards have no heading row, so they name the field themselves.
        meta: {
          mobileOrder: 40,
          mobileLabel: `${t('Available Balance')} (${quotaUnit})`,
        },
      },
      {
        id: 'usage_level',
        accessorFn: (user) => user.usage_level?.level ?? 0,
        header: t('Usage level'),
        cell: ({ row }) => (
          <UsageLevelBadge level={row.original.usage_level?.level} showTitle />
        ),
        size: 160,
        meta: { mobileOrder: 35 },
      },
      {
        accessorKey: 'role',
        header: t('Role'),
        cell: ({ row }) => {
          const roleValue = row.getValue('role') as number
          const roleConfig = USER_ROLES[roleValue as keyof typeof USER_ROLES]

          if (!roleConfig) {
            return null
          }

          return <span className='text-sm'>{t(roleConfig.labelKey)}</span>
        },
        filterFn: (row, id, value) => {
          return value.includes(String(row.getValue(id)))
        },
        enableSorting: false,
        size: 120,
        meta: { mobileOrder: 20 },
      },
      {
        id: 'invite_info',
        // An accessor keeps the column in the column-visibility menu; it is
        // hidden by default and has no sorting or filtering of its own.
        accessorFn: (user) => user.aff_count ?? 0,
        header: t('Invite Info'),
        cell: ({ row }) => {
          const user = row.original
          const affCount = user.aff_count || 0
          const affHistoryQuota = user.aff_history_quota || 0
          const inviterId = user.inviter_id || 0

          if (affCount === 0 && affHistoryQuota === 0 && inviterId === 0) {
            return <span className='text-muted-foreground text-sm'>—</span>
          }

          return (
            <div
              data-table-text='secondary'
              className='min-w-0 space-y-1 text-xs font-normal'
            >
              {(affCount > 0 || affHistoryQuota !== 0) && (
                <LongText>
                  {t('Invited {{count}} users', { count: affCount })} ·{' '}
                  {t('Earnings')}:{' '}
                  <span className='tabular-nums'>
                    {formatQuota(affHistoryQuota)}
                  </span>
                </LongText>
              )}
              {inviterId > 0 && (
                <LongText className='text-muted-foreground'>
                  {t('Inviter')} ID: {inviterId}
                </LongText>
              )}
            </div>
          )
        },
        size: 240,
        enableSorting: false,
        meta: { mobileHidden: true },
      },
      {
        id: 'actions',
        header: () => t('Actions'),
        cell: ({ row }) => <DataTableRowActions row={row} />,
        meta: { pinned: 'right' as const },
      },
    ],
    // formatQuota reads the currency configuration from the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, quotaUnit, currencyConfig]
  )
  // Usage levels are temporarily offline; the column stays defined so that
  // restoring features/usage-level/visibility brings it back unchanged.
  return USAGE_LEVEL_VISIBLE
    ? columns
    : columns.filter((column) => column.id !== 'usage_level')
}
