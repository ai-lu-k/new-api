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
import { isAxiosError } from 'axios'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTablePage,
  SECTION_FRAME_CLASSNAME,
  SECTION_TABLE_HEAD_CLASSNAME,
  useDataTable,
} from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { getAuditLogs, type AuditFilters, type AuditLog } from '../api'
import { useAuditLogColumns } from './audit-log-columns'
import { AuditLogFilterBar } from './audit-log-filter-bar'

const EMPTY_LOGS: AuditLog[] = []

export function AuditLogViewer(props: {
  scope: 'all' | 'self'
  accessOnly?: boolean
  currentTokenRef?: string
  onAccessDenied?: () => Promise<void>
}) {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const [filters, setFilters] = useState<AuditFilters>({ p: 1, page_size: 20 })
  const [tokenScope, setTokenScope] = useState('all')
  const params = { ...filters }
  if (props.accessOnly) params.category = 'access_token'
  if (tokenScope === 'current') params.token_ref = props.currentTokenRef
  if (tokenScope === 'historical') {
    params.exclude_token_ref = props.currentTokenRef
  }
  const canQuery =
    tokenScope === 'all' ||
    (props.currentTokenRef !== undefined &&
      (tokenScope === 'historical' || !!props.currentTokenRef))
  const invalidRange =
    filters.start_timestamp !== undefined &&
    filters.end_timestamp !== undefined &&
    filters.start_timestamp > filters.end_timestamp
  const query = useQuery({
    queryKey: ['audit', userId, props.scope, params],
    queryFn: async () =>
      requireServerSuccess(await getAuditLogs(props.scope, params)),
    enabled: canQuery && !invalidRange,
    retry: false,
    // Keep the filters and the page shell; the table shows the failure itself.
    meta: { skipInternalErrorRedirect: true },
  })
  const accessDenied =
    props.scope === 'all' &&
    isAxiosError(query.error) &&
    query.error.response?.status === 403
  const onAccessDenied = props.onAccessDenied
  useEffect(() => {
    if (accessDenied) void onAccessDenied?.()
  }, [accessDenied, onAccessDenied])
  const columns = useAuditLogColumns(props.accessOnly)
  const { table } = useDataTable({
    columns,
    data:
      canQuery && !query.isError
        ? (query.data?.items ?? EMPTY_LOGS)
        : EMPTY_LOGS,
    getRowId: (entry) => entry.event_id,
    totalCount: query.isError ? 0 : (query.data?.total ?? 0),
    pagination: { pageIndex: filters.p - 1, pageSize: filters.page_size },
    onPaginationChange: (updater) => {
      if (query.isFetching || query.isError || invalidRange || !canQuery) return
      setFilters((previous) => {
        const current = {
          pageIndex: previous.p - 1,
          pageSize: previous.page_size,
        }
        const next = typeof updater === 'function' ? updater(current) : updater
        return {
          ...previous,
          p: next.pageSize === previous.page_size ? next.pageIndex + 1 : 1,
          page_size: next.pageSize,
        }
      })
    },
    enableRowSelection: false,
    enableSorting: false,
    manualFiltering: true,
    manualPagination: true,
  })
  const update = (patch: Partial<AuditFilters>) =>
    setFilters((previous) => ({ ...previous, ...patch, p: 1 }))

  const hasActiveFilters = Boolean(
    filters.start_timestamp ||
    filters.end_timestamp ||
    filters.success ||
    filters.category ||
    filters.username ||
    filters.request_id ||
    tokenScope !== 'all'
  )
  const toolbar = (
    <div className='shrink-0 space-y-2'>
      <AuditLogFilterBar
        table={table}
        filters={filters}
        onChange={update}
        scope={props.scope}
        accessOnly={props.accessOnly}
        tokenScope={tokenScope}
        currentTokenRef={props.currentTokenRef}
        onTokenScopeChange={(value) => {
          setTokenScope(value)
          update({})
        }}
        isFetching={query.isFetching}
        onSearch={() => {
          if (!invalidRange && canQuery) void query.refetch()
        }}
        onReset={() => {
          setTokenScope('all')
          setFilters({ p: 1, page_size: filters.page_size })
        }}
      />
      {invalidRange && (
        <Alert variant='destructive'>
          <AlertDescription>
            {t('End time must be after start time')}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )

  if (query.isError) {
    return (
      <div className='flex h-full min-h-0 flex-col gap-3'>
        {toolbar}
        <ErrorState
          title={t('Failed to load audit records')}
          description={t('Please try again later.')}
          onRetry={() => {
            void query.refetch()
          }}
        />
      </div>
    )
  }

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <DataTablePage
        table={table}
        columns={columns}
        isLoading={query.isPending && canQuery && !invalidRange}
        isFetching={query.isFetching}
        emptyTitle={
          hasActiveFilters ? t('No matching results') : t('No records')
        }
        emptyDescription={
          hasActiveFilters
            ? t('Try adjusting your search')
            : t(
                'Audit records start after this feature was enabled. Earlier records remain in Common Logs.'
              )
        }
        hideMobile={props.accessOnly}
        paginationInFooter={!props.accessOnly}
        className='h-auto min-h-0 flex-1'
        applyHeaderSize
        getColumnClassName={() => 'py-2.5'}
        tableClassName={cn(
          SECTION_FRAME_CLASSNAME,
          SECTION_TABLE_HEAD_CLASSNAME,
          '[&_td]:h-12',
          // The empty block sizes to its own copy instead of a fixed 400 px
          // table row that pushes the footer pagination away from the list.
          '[&_td[colspan]]:h-auto',
          '[&_[data-slot=table]]:text-[13px] [&_[data-slot=table]_td]:text-[13px] [&_[data-slot=table]_td_*]:text-[13px] [&_[data-slot=table]_th]:text-[12px] [&_[data-slot=table]_th_*]:text-[12px]'
        )}
        toolbar={toolbar}
      />
    </div>
  )
}
