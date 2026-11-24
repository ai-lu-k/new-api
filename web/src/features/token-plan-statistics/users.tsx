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
import type {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTablePagination,
  DataTableToolbar,
  DataTableView,
  TruncatedCell,
  useDataTable,
} from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { UsageLevelBadge } from '@/features/usage-level/components/usage-level-badge'
import { USAGE_LEVEL_VISIBLE } from '@/features/usage-level/visibility'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatNumber } from '@/lib/format'

import { getPlanStatistics, type PlanUserUsage } from './api'

export type PlanTrendUser = { id: number; name: string }
const EMPTY_USERS: PlanUserUsage[] = []
const EMPTY_FILTERS: ColumnFiltersState = []

export function PlanUsageUsers(props: {
  identity: string
  onSelectUser: (user: PlanTrendUser) => void
  onGrantCoupons: (user: PlanTrendUser) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [search, setSearch] = useState('')
  // Accounts that never consumed quota are mostly noise here, so the list
  // starts above LV0 while the filter stays visible and reversible. With levels
  // offline there is no LV0 to hide behind, so the list shows every account.
  const [minLevel, setMinLevel] = useState(USAGE_LEVEL_VISIBLE ? 1 : 0)
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })
  const query = useQuery({
    queryKey: [
      'token-plan-statistics',
      props.identity,
      'users',
      search,
      minLevel,
      pagination,
    ],
    queryFn: ({ signal }) =>
      getPlanStatistics<{ items: PlanUserUsage[]; total: number }>(
        'users',
        {
          search,
          min_level: minLevel,
          page: pagination.pageIndex + 1,
          size: pagination.pageSize,
        },
        signal
      ),
  })
  const onSelectUser = props.onSelectUser
  const onGrantCoupons = props.onGrantCoupons
  const columns = useMemo<ColumnDef<PlanUserUsage>[]>(() => {
    const quota = (amount: number) =>
      formatQuotaWithCurrency(amount, { locale })
    return [
      {
        accessorKey: 'username',
        header: t('User'),
        cell: ({ row }) => (
          <div className='max-w-48'>
            <TruncatedCell>{row.original.username}</TruncatedCell>
            <span className='text-muted-foreground text-xs'>
              #{formatNumber(row.original.user_id, locale)} ·{' '}
              {row.original.display_name}
            </span>
          </div>
        ),
      },
      {
        id: 'level',
        accessorKey: 'level',
        header: t('Level'),
        cell: ({ row }) => <UsageLevelBadge level={row.original.level} />,
      },
      {
        accessorKey: 'activated',
        header: t('Status'),
        cell: ({ row }) => (
          <span>
            {row.original.activated ? t('Activated') : t('Not activated')}
            {row.original.status !== 1 && ` · ${t('Disabled')}`}
          </span>
        ),
      },
      {
        accessorKey: 'base_quota',
        header: t('Base quota'),
        cell: ({ row }) => quota(row.original.base_quota),
      },
      {
        accessorKey: 'multiplier',
        header: t('Multiplier'),
        cell: ({ row }) => `×${row.original.multiplier}`,
      },
      {
        accessorKey: 'total_quota',
        header: t('Current cycle quota'),
        cell: ({ row }) => quota(row.original.total_quota),
      },
      {
        accessorKey: 'used_quota',
        header: t('Free plan usage'),
        cell: ({ row }) => quota(row.original.used_quota),
      },
      {
        accessorKey: 'remaining_quota',
        header: t('Remaining'),
        cell: ({ row }) => quota(row.original.remaining_quota),
      },
      {
        accessorKey: 'reserved_quota',
        header: t('Pending reservations'),
        cell: ({ row }) => quota(row.original.reserved_quota),
      },
      {
        accessorKey: 'wallet_used_quota',
        header: t('Balance continuation'),
        cell: ({ row }) => (
          <div>
            {quota(row.original.wallet_used_quota)}
            <div className='text-muted-foreground text-xs'>
              {row.original.wallet_fallback ? t('Enabled') : t('Disabled')}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'resets_at',
        header: t('Resets at'),
        cell: ({ row }) => (
          <div>
            {new Date(row.original.resets_at * 1000).toLocaleString(locale, {
              timeZone: 'Asia/Shanghai',
            })}
            <div className='text-muted-foreground text-xs'>
              {row.original.personal_cycle
                ? t('Personal seven-day cycle')
                : t('Monday calendar cycle')}
            </div>
          </div>
        ),
      },
      {
        id: 'actions',
        header: t('Actions'),
        cell: ({ row }) => (
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() =>
                onSelectUser({
                  id: row.original.user_id,
                  name: row.original.username,
                })
              }
            >
              {t('View trend')}
            </Button>
            <Button
              variant='ghost'
              size='sm'
              onClick={() =>
                onGrantCoupons({
                  id: row.original.user_id,
                  name: row.original.username,
                })
              }
            >
              {t('Issue vouchers')}
            </Button>
          </div>
        ),
      },
    ]
  }, [locale, onGrantCoupons, onSelectUser, t])
  const { table } = useDataTable({
    data: query.data?.items ?? EMPTY_USERS,
    // Usage levels are temporarily offline (see features/usage-level/visibility).
    columns: USAGE_LEVEL_VISIBLE
      ? columns
      : columns.filter((column) => column.id !== 'level'),
    totalCount: query.data?.total ?? 0,
    manualPagination: true,
    manualFiltering: true,
    pagination,
    onPaginationChange: setPagination,
    globalFilter: search,
    columnFilters: EMPTY_FILTERS,
    onGlobalFilterChange: (value) => {
      setSearch(String(typeof value === 'function' ? value(search) : value))
      setPagination((current) => ({ ...current, pageIndex: 0 }))
    },
    enableSorting: false,
  })
  return (
    <section aria-label={t('User details')} className='min-w-0 space-y-3'>
      <h2 className='text-lg font-semibold'>{t('User details')}</h2>
      <DataTableToolbar
        table={table}
        searchPlaceholder={t('Search by user ID or username')}
        searchDebounceMs={300}
        hideViewOptions
        hasAdditionalFilters={minLevel > 0}
        onReset={() => {
          setMinLevel(0)
          setPagination((current) => ({ ...current, pageIndex: 0 }))
        }}
        additionalSearch={
          USAGE_LEVEL_VISIBLE ? (
            <label className='flex items-center gap-2 text-sm whitespace-nowrap'>
              <Checkbox
                checked={minLevel > 0}
                onCheckedChange={(checked) => {
                  setMinLevel(checked ? 1 : 0)
                  setPagination((current) => ({ ...current, pageIndex: 0 }))
                }}
              />
              {t('Hide LV0 (unused) accounts')}
            </label>
          ) : undefined
        }
      />
      {query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : (
        <DataTableView
          table={table}
          isLoading={query.isPending}
          emptyTitle={t('No users found')}
          tableClassName='min-w-[1200px]'
        />
      )}
      <DataTablePagination table={table} compact />
    </section>
  )
}
