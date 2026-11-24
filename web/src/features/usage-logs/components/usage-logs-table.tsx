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
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTablePage,
  getListEntranceSignature,
  DataTableRow,
  SECTION_FRAME_CLASSNAME,
  SECTION_TABLE_HEAD_CLASSNAME,
  useDataTable,
} from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { useResultEnter } from '@/features/keys/components/motion/result-enter'
import {
  getAdminPlans,
  getSelfSubscriptionFull,
} from '@/features/subscriptions/api'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import { createServerError } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import {
  DEFAULT_LOGS_DATA,
  LOG_TYPE_ALL_VALUE,
  LOG_TYPE_ENUM,
} from '../constants'
import { shouldShowBillingSource } from '../lib/billing-source'
import { useColumnsByCategory } from '../lib/columns'
import { parseLogOther } from '../lib/format'
import { fetchLogsByCategory } from '../lib/utils'
import type { GetLogsResponse, LogCategory } from '../types'
import { CommonLogsFilterBar } from './common-logs-filter-bar'
import { TaskLogsFilterBar } from './task-logs-filter-bar'
import { UsageLogsMobileList } from './usage-logs-mobile-card'
import { useLogsViewScope, type LogsViewAccess } from './usage-logs-provider'

const route = getRouteApi('/_authenticated/usage-logs/$section')

const logTypeRowTint: Record<number, string> = {
  [LOG_TYPE_ENUM.ERROR]: 'bg-rose-50/40 dark:bg-rose-950/20',
  [LOG_TYPE_ENUM.REFUND]: 'bg-blue-50/30 dark:bg-blue-950/15',
}

// Warning tint for logs where a quota conversion saturated (admin-only marker).
// Takes precedence over the per-type tint since it flags a billing anomaly.
const quotaSaturationRowTint = 'bg-amber-50/60 dark:bg-amber-950/25'

/**
 * Pure numeric columns read as a column of figures, so they are right-aligned
 * in both the heading and the body and share tabular figures. Composite cells
 * (timestamp + type, timer + first token, stream + throughput) stay
 * left-aligned because they mix a label with the figure.
 */
const RIGHT_ALIGNED_COLUMNS = new Set(['prompt_tokens', 'quota'])

function getColumnVisibilityStorageKey(
  logCategory: LogCategory,
  viewAccess: LogsViewAccess
): string {
  return `usage-logs:${logCategory}:${viewAccess}:column-visibility:v2`
}

/**
 * List failures are returned as data instead of a rejected query, so the page
 * keeps its header, filters and retry affordance.
 */
type LogsQueryOutcome =
  | { ok: true; data: NonNullable<GetLogsResponse['data']> }
  | { ok: false }

function deserializeLogTypeFilter(value: unknown): unknown[] {
  let values: unknown[] = []
  if (Array.isArray(value)) {
    values = value
  } else if (value) {
    values = [value]
  }
  return values.filter((item) => String(item) !== LOG_TYPE_ALL_VALUE)
}

interface UsageLogsTableProps {
  logCategory: LogCategory
  sensitiveToggleInHeader?: boolean
}

export function UsageLogsTable({
  logCategory,
  sensitiveToggleInHeader,
}: UsageLogsTableProps) {
  const { t } = useTranslation()
  const getColumnClassName = useCallback(
    (columnId: string) => {
      const vertical = logCategory === 'common' ? 'py-1.5' : 'py-3.5'
      if (!RIGHT_ALIGNED_COLUMNS.has(columnId)) return vertical
      return cn(vertical, 'text-right')
    },
    [logCategory]
  )
  const {
    isAdminView: isAdmin,
    isRootView: isRoot,
    viewAccess,
  } = useLogsViewScope()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const searchParams = route.useSearch()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const { data: showBillingSource = false } = useQuery({
    queryKey: ['usage-log-billing-source', isAdmin, userId],
    enabled: logCategory === 'common' && userId != null,
    queryFn: async () => {
      if (isAdmin) {
        const plansResult = await getAdminPlans()
        return shouldShowBillingSource({
          isAdmin,
          plans: plansResult.success ? plansResult.data : undefined,
          subscriptions: undefined,
        })
      }

      const selfResult = await getSelfSubscriptionFull()
      return shouldShowBillingSource({
        isAdmin,
        plans: undefined,
        subscriptions: selfResult.success
          ? selfResult.data?.subscriptions
          : undefined,
      })
    },
  })

  const {
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search: route.useSearch(),
    navigate: route.useNavigate(),
    pagination: { defaultPage: 1, defaultPageSize: isMobile ? 20 : 100 },
    globalFilter: { enabled: false },
    columnFilters: [
      {
        columnId: 'created_at',
        searchKey: 'type',
        type: 'array' as const,
        deserialize: deserializeLogTypeFilter,
      },
      { columnId: 'model_name', searchKey: 'model', type: 'string' as const },
      { columnId: 'token_name', searchKey: 'token', type: 'string' as const },
      { columnId: 'group', searchKey: 'group', type: 'string' as const },
      ...(isAdmin
        ? [
            {
              columnId: 'channel',
              searchKey: 'channel',
              type: 'string' as const,
            },
            {
              columnId: 'username',
              searchKey: 'username',
              type: 'string' as const,
            },
          ]
        : []),
    ],
  })

  const {
    data: outcome,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: [
      'logs',
      logCategory,
      viewAccess,
      pagination.pageIndex + 1,
      pagination.pageSize,
      columnFilters,
      searchParams,
      t,
    ],
    // The table renders its own failure state; keep the shell and filters.
    meta: { skipInternalErrorRedirect: true },
    queryFn: async (): Promise<LogsQueryOutcome> => {
      try {
        const result = await fetchLogsByCategory({
          logCategory,
          isAdmin,
          page: pagination.pageIndex + 1,
          pageSize: pagination.pageSize,
          searchParams,
          columnFilters,
        })

        if (!result?.success) {
          throw createServerError(result, t('Failed to load logs'))
        }

        return {
          ok: true,
          data: result.data ?? {
            ...DEFAULT_LOGS_DATA,
            page: pagination.pageIndex + 1,
            page_size: pagination.pageSize,
          },
        }
      } catch {
        // A failed list request belongs in the table area. Rejecting the query
        // would hand every HTTP 500 to the app-level error handler, which
        // replaces the page header, filters and pagination with a generic
        // error screen and leaves no way to retry in place.
        return { ok: false }
      }
    },
    placeholderData: (previousData, previousQuery) => {
      if (
        previousQuery?.queryKey[1] === logCategory &&
        previousQuery.queryKey[2] === viewAccess
      ) {
        return previousData
      }
      return undefined
    },
  })

  const isError = outcome?.ok === false
  const data = outcome?.ok ? outcome.data : undefined
  const logs = data?.items || []
  const columns = useColumnsByCategory(
    logCategory,
    isAdmin,
    isRoot,
    showBillingSource
  )
  const isLoadingData = isLoading || (isFetching && !outcome)

  const { table } = useDataTable({
    data: logs as Record<string, unknown>[],
    columns: columns as ColumnDef<Record<string, unknown>>[],
    columnFilters,
    columnVisibilityStorageKey: getColumnVisibilityStorageKey(
      logCategory,
      viewAccess
    ),
    // Ten columns do not fit the main content width; the admin view opens with
    // "Stream" folded away and keeps it one click away in the column menu.
    initialColumnVisibility:
      logCategory === 'common' && isAdmin ? { is_stream: false } : undefined,
    pagination,
    enableRowSelection: false,
    onPaginationChange,
    onColumnFiltersChange,
    manualPagination: true,
    manualFiltering: true,
    totalCount: data?.total || 0,
    ensurePageInRange,
  })

  const isCommon = logCategory === 'common'
  const hasActiveFilters =
    isCommon &&
    Boolean(
      searchParams.model ||
      searchParams.token ||
      searchParams.group ||
      searchParams.username ||
      searchParams.channel ||
      searchParams.requestId ||
      searchParams.upstreamRequestId
    )
  const hasActiveType =
    isCommon &&
    (searchParams.type ?? []).some((type) => type !== LOG_TYPE_ALL_VALUE)
  const toolbar = isCommon ? (
    <CommonLogsFilterBar
      table={table}
      sensitiveToggleInHeader={sensitiveToggleInHeader}
    />
  ) : (
    <TaskLogsFilterBar table={table} logCategory={logCategory} />
  )

  const showsFilteredResult = hasActiveFilters || hasActiveType
  // Task and drawing logs are not request logs, so the usage-log empty copy is
  // wrong for them and no dedicated copy exists yet.
  let emptyDescription = ''
  if (showsFilteredResult) emptyDescription = t('Try adjusting your search')
  else if (isCommon) {
    emptyDescription = t(
      'No usage logs available. Logs will appear here once API calls are made.'
    )
  }

  // The body arrives once per filter / page change instead of blinking in. The
  // key is the identity of the rows on screen: the route search turns over a
  // request earlier than the rows do, and the entrance belongs to the commit
  // that swapped them.
  const resultRef = useResultEnter(
    `${logs.map((log) => log.id).join(',')}|${showsFilteredResult}`
  )

  if (isError) {
    return (
      <div
        className={
          isCommon ? 'space-y-4' : 'flex h-full min-h-0 flex-col gap-4'
        }
      >
        {toolbar}
        <ErrorState
          title={t('Failed to load logs')}
          description={t('Please try again later.')}
          onRetry={() => {
            void refetch()
          }}
        />
      </div>
    )
  }

  // Custom rows still arrive in the same ladder as the default ones.
  const entranceSignature = getListEntranceSignature(
    table.getRowModel().rows,
    table.getState()
  )

  return (
    <div ref={resultRef} className='contents'>
      <DataTablePage
        table={table}
        compactPagination={isMobile && isCommon}
        columns={columns as ColumnDef<Record<string, unknown>>[]}
        isLoading={isLoadingData}
        isFetching={isFetching}
        emptyTitle={
          showsFilteredResult ? t('No matching results') : t('No Logs Found')
        }
        emptyDescription={emptyDescription}
        fixedHeight={!isCommon}
        paginationInFooter={!isCommon}
        skeletonKeyPrefix='usage-log-skeleton'
        applyHeaderSize={!isCommon || isAdmin}
        tableClassName={cn(
          isCommon && SECTION_FRAME_CLASSNAME,
          isCommon && SECTION_TABLE_HEAD_CLASSNAME,
          isCommon && '[&_td]:h-16',
          '[&_[data-slot=table]]:text-[13px] [&_[data-slot=table]_td]:text-[13px] [&_[data-slot=table]_td_*]:text-[13px] [&_[data-slot=table]_th]:text-[12px] [&_[data-slot=table]_th_*]:text-[12px]'
        )}
        mobile={
          <UsageLogsMobileList
            table={table}
            isLoading={isLoadingData}
            logCategory={logCategory}
          />
        }
        toolbar={toolbar}
        renderRow={(row) => {
          const logType = (row.original as Record<string, unknown>).type as
            | number
            | undefined
          let tintClass =
            isCommon && logType != null ? (logTypeRowTint[logType] ?? '') : ''
          if (isCommon && isAdmin) {
            const other = parseLogOther(
              ((row.original as Record<string, unknown>).other as string) ?? ''
            )
            if (other?.admin_info?.quota_saturation) {
              tintClass = quotaSaturationRowTint
            }
          }

          return (
            <DataTableRow
              key={row.id}
              row={row}
              className={cn('transition-colors', tintClass)}
              getColumnClassName={getColumnClassName}
              cellRenderColumns={table.options.columns}
              entranceSignature={entranceSignature}
              entranceIndex={row.index}
            />
          )
        }}
      />
    </div>
  )
}
