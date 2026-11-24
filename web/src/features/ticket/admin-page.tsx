import { Refresh01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { TabSwitch } from '@/components/motion/tab-switch'
import { SectionHeading } from '@/components/section-heading'
import { Button } from '@/components/ui/button'
import { requireServerSuccess } from '@/lib/server-error-message'
import { withViewTransition } from '@/lib/view-transition'

import { getTicketAssignees, getTicketQueue } from './api'
import { TicketDetailDialog } from './components/ticket-detail-dialog'
import { TicketTable } from './components/ticket-table'
import { TicketToolbar } from './components/ticket-toolbar'
import { TICKET_STATUS_TAB_LABELS } from './constants'
import {
  TICKET_STATUS_FILTER,
  type Ticket,
  type TicketFilters,
  type TicketStatusFilter,
} from './types'

const PAGE_SIZE = 20

/** The queue's status row: an administrator also sorts out closed tickets. */
const STATUS_TABS = [
  TICKET_STATUS_FILTER.ALL,
  TICKET_STATUS_FILTER.OPEN,
  TICKET_STATUS_FILTER.RESOLVED,
  TICKET_STATUS_FILTER.CLOSED,
]

const NO_FILTERS: TicketFilters = {
  status: TICKET_STATUS_FILTER.ALL,
  category: 0,
  priority: 0,
  assigneeId: 0,
  keyword: '',
}

/**
 * The administrator queue, a page of its own: every ticket a user opened,
 * filtered by status, category, priority and owner.
 */
export function TicketAdminPage() {
  const { t } = useTranslation()
  const [filters, setFilters] = useState<TicketFilters>(NO_FILTERS)
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  })
  const [openTicketId, setOpenTicketId] = useState<number | null>(null)

  const query = useQuery({
    queryKey: ['ticket', 'queue', filters, pagination],
    queryFn: async () =>
      requireServerSuccess(
        await getTicketQueue(filters, {
          page: pagination.pageIndex + 1,
          pageSize: pagination.pageSize,
        })
      ),
  })
  const assigneesQuery = useQuery({
    queryKey: ['ticket', 'assignees'],
    queryFn: async () => requireServerSuccess(await getTicketAssignees()),
  })
  const items = query.data?.data?.items ?? []
  const total = query.data?.data?.total ?? 0
  const assignees = assigneesQuery.data?.data ?? []

  // The subject travels from the row into the dialog header, which needs one
  // snapshot holding both states.
  const open = (ticket: Ticket) =>
    withViewTransition(() => setOpenTicketId(ticket.id))
  const applyFilters = (patch: Partial<TicketFilters>) => {
    setFilters((current) => ({ ...current, ...patch }))
    setPagination((current) => ({ ...current, pageIndex: 0 }))
  }

  return (
    <>
      <SectionPageLayout pageIndex={<>{t('Admin area')} / 10</>}>
        <SectionPageLayout.Title>{t('Ticket queue')}</SectionPageLayout.Title>
        <SectionPageLayout.Description>
          {t(
            'Every conversation a user opened. Assign it, move it forward, and answer in the same thread.'
          )}
        </SectionPageLayout.Description>
        <SectionPageLayout.Actions>
          <Button
            variant='outline'
            size='icon-sm'
            aria-label={t('Refresh')}
            onClick={() => {
              void query.refetch()
              void assigneesQuery.refetch()
            }}
          >
            <HugeiconsIcon icon={Refresh01Icon} size={16} strokeWidth={1.8} />
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='space-y-3'>
            <SectionHeading as='h2' title={t('All tickets')} />
            <TabSwitch
              value={filters.status}
              onValueChange={(value) =>
                applyFilters({ status: value as TicketStatusFilter })
              }
              ariaLabel={t('Status')}
              listClassName='max-w-full flex-wrap justify-start'
              tabs={STATUS_TABS.map((value) => ({
                value,
                label: t(TICKET_STATUS_TAB_LABELS[value]),
                content: (
                  <TicketTable
                    tickets={items}
                    total={total}
                    isLoading={query.isLoading}
                    isFetching={query.isFetching}
                    pageIndex={pagination.pageIndex}
                    pageSize={pagination.pageSize}
                    onPaginationChange={(pageIndex, pageSize) =>
                      setPagination({ pageIndex, pageSize })
                    }
                    onOpen={open}
                    openTicketId={openTicketId}
                    showOwner
                    showAssignee
                    emptyTitle={t('No tickets match these filters')}
                    emptyDescription={t(
                      'Widen the filters to see the rest of the queue.'
                    )}
                    toolbar={
                      <TicketToolbar
                        category={filters.category}
                        onCategoryChange={(value) =>
                          applyFilters({ category: value })
                        }
                        priority={filters.priority}
                        onPriorityChange={(value) =>
                          applyFilters({ priority: value })
                        }
                        keyword={filters.keyword}
                        onKeywordChange={(value) =>
                          applyFilters({ keyword: value })
                        }
                        placeholder={t('Search by subject or user')}
                        assignee={{
                          value: filters.assigneeId,
                          options: assignees,
                          onChange: (value) =>
                            applyFilters({ assigneeId: value }),
                        }}
                      />
                    }
                  />
                ),
              }))}
            />
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      {openTicketId !== null && (
        <TicketDetailDialog
          ticketId={openTicketId}
          isAdmin
          onClose={() => withViewTransition(() => setOpenTicketId(null))}
        />
      )}
    </>
  )
}
