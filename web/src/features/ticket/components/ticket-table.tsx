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
import { useTranslation } from 'react-i18next'

import {
  DataTablePage,
  SECTION_FRAME_CLASSNAME,
  SECTION_TABLE_HEAD_CLASSNAME,
  useDataTable,
} from '@/components/data-table'
import { SectionHeading } from '@/components/section-heading'
import { Button } from '@/components/ui/button'
import { formatTimestampToDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import { TICKET_PRIORITY_LABELS } from '../constants'
import { TICKET_PRIORITY, type Ticket } from '../types'
import { TicketCategoryLabel, TicketStatusBadge } from './ticket-badges'
import { TicketSharedSubject } from './ticket-shared-subject'

export type TicketTableProps = {
  tickets: Ticket[]
  total: number
  isLoading: boolean
  isFetching: boolean
  pageIndex: number
  pageSize: number
  onPaginationChange: (pageIndex: number, pageSize: number) => void
  onOpen: (ticket: Ticket) => void
  /** The ticket whose detail dialog is open, if any: its row steps aside so the
   *  subject can travel into the dialog header. */
  openTicketId?: number | null
  /** Show who opened the ticket; for the administrator queue. */
  showOwner?: boolean
  /** Show who works on it; for the administrator queue. */
  showAssignee?: boolean
  toolbar?: React.ReactNode
  /** Section heading above the table; omit for a bare list. */
  heading?: string
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
}

/** One row per ticket; the subject opens the thread. */
export function TicketTable(props: TicketTableProps) {
  const { t } = useTranslation()
  const columns: ColumnDef<Ticket>[] = [
    {
      accessorKey: 'subject',
      header: t('Subject'),
      enableHiding: false,
      cell: ({ row }) => (
        <div className='flex min-w-0 flex-col gap-0.5'>
          <Button
            variant='link'
            className='text-foreground h-auto min-w-0 justify-start p-0 text-left text-sm font-medium'
            onClick={() => props.onOpen(row.original)}
          >
            <span className='max-w-72 truncate'>
              <TicketSharedSubject
                id={row.original.id}
                subject={row.original.subject}
                detailOpen={props.openTicketId === row.original.id}
              />
            </span>
          </Button>
          <span className='text-muted-foreground text-xs'>
            #{row.original.id}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: t('Status'),
      cell: ({ row }) => <TicketStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'priority',
      header: t('Priority'),
      cell: ({ row }) => (
        <span
          className={cn(
            'text-sm',
            row.original.priority === TICKET_PRIORITY.HIGH
              ? 'text-warning font-medium'
              : 'text-muted-foreground'
          )}
        >
          {row.original.priority in TICKET_PRIORITY_LABELS
            ? t(TICKET_PRIORITY_LABELS[row.original.priority])
            : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'category',
      header: t('Category'),
      cell: ({ row }) => (
        <span className='text-muted-foreground text-sm'>
          <TicketCategoryLabel category={row.original.category} />
        </span>
      ),
    },
    ...(props.showOwner
      ? [
          {
            accessorKey: 'username',
            header: t('User'),
            cell: ({ row }) => (
              <span className='text-muted-foreground text-sm'>
                {row.original.username || '—'}
              </span>
            ),
          } satisfies ColumnDef<Ticket>,
        ]
      : []),
    ...(props.showAssignee
      ? [
          {
            accessorKey: 'assignee_name',
            header: t('Assignee'),
            cell: ({ row }) => (
              <span className='text-muted-foreground text-sm'>
                {row.original.assignee_name || t('Unassigned')}
              </span>
            ),
          } satisfies ColumnDef<Ticket>,
        ]
      : []),
    {
      accessorKey: 'last_reply_at',
      header: t('Last activity'),
      cell: ({ row }) => (
        <span className='text-muted-foreground text-sm tabular-nums'>
          {formatTimestampToDate(
            row.original.last_reply_at || row.original.created_at
          )}
        </span>
      ),
    },
  ]
  const { table } = useDataTable({
    data: props.tickets,
    columns,
    totalCount: props.total,
    getRowId: (ticket) => String(ticket.id),
    pagination: { pageIndex: props.pageIndex, pageSize: props.pageSize },
    onPaginationChange: (updater) => {
      const current = { pageIndex: props.pageIndex, pageSize: props.pageSize }
      const next = typeof updater === 'function' ? updater(current) : updater
      props.onPaginationChange(next.pageIndex, next.pageSize)
    },
    manualPagination: true,
    enableSorting: false,
  })

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={props.isLoading}
      isFetching={props.isFetching}
      emptyTitle={props.emptyTitle ?? t('No tickets yet')}
      emptyDescription={props.emptyDescription}
      emptyAction={props.emptyAction}
      fixedHeight={false}
      paginationInFooter={false}
      tableClassName={cn(
        SECTION_FRAME_CLASSNAME,
        SECTION_TABLE_HEAD_CLASSNAME,
        '[&_td]:h-16'
      )}
      className='border-border border-t pt-4'
      // The section title names the list before its tabs and filters; the table
      // shell renders the heading after the toolbar, so both go in here.
      tableHeading={
        props.heading || props.toolbar ? (
          <div className='space-y-3'>
            {props.heading ? (
              <SectionHeading as='h2' title={props.heading} />
            ) : null}
            {props.toolbar}
          </div>
        ) : undefined
      }
    />
  )
}
