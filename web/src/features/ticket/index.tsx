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

import { getMyTickets } from './api'
import { TicketCreateDialog } from './components/ticket-create-dialog'
import { TicketDetailDialog } from './components/ticket-detail-dialog'
import { TicketTable } from './components/ticket-table'
import { TicketToolbar } from './components/ticket-toolbar'
import { TICKET_STATUS_TAB_LABELS } from './constants'
import {
  TICKET_STATUS_FILTER,
  type Ticket,
  type TicketStatusFilter,
} from './types'

const PAGE_SIZE = 20

/** The status row of the user's own tickets. */
const STATUS_TABS = [
  TICKET_STATUS_FILTER.ALL,
  TICKET_STATUS_FILTER.OPEN,
  TICKET_STATUS_FILTER.RESOLVED,
]

/**
 * A user's own tickets: the threads they opened, with the status tabs and
 * filters of the reference console.
 */
export function TicketPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<TicketStatusFilter>(
    TICKET_STATUS_FILTER.ALL
  )
  const [category, setCategory] = useState(0)
  const [priority, setPriority] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  })
  const [openTicketId, setOpenTicketId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)

  const query = useQuery({
    queryKey: [
      'ticket',
      'mine',
      { status, category, priority, keyword, pagination },
    ],
    queryFn: async () =>
      requireServerSuccess(
        await getMyTickets({
          page: pagination.pageIndex + 1,
          pageSize: pagination.pageSize,
          status,
          category,
          priority,
          keyword,
        })
      ),
  })
  const items = query.data?.data?.items ?? []
  const total = query.data?.data?.total ?? 0

  // The subject travels from the row into the dialog header, which needs one
  // snapshot holding both states.
  const open = (ticket: Ticket) =>
    withViewTransition(() => setOpenTicketId(ticket.id))
  const backToFirstPage = () =>
    setPagination((current) => ({ ...current, pageIndex: 0 }))

  return (
    <>
      <SectionPageLayout pageIndex={<>{t('Personal workspace')} / 08</>}>
        <SectionPageLayout.Title>
          {t('Feedback and tickets')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Description>
          {t(
            'Write to the administrators and keep answering here until the ticket is closed.'
          )}
        </SectionPageLayout.Description>
        <SectionPageLayout.Actions>
          <Button
            size='sm'
            className='min-h-11 sm:min-h-8'
            onClick={() => setCreating(true)}
          >
            {t('New ticket')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='space-y-3'>
            <SectionHeading as='h2' title={t('My tickets')} />
            {/* The status row is a tab group: switching it crosses the list
                itself over, so the table is the panel. */}
            <TabSwitch
              value={status}
              onValueChange={(value) => {
                setStatus(value as TicketStatusFilter)
                backToFirstPage()
              }}
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
                    emptyTitle={t('No tickets yet')}
                    emptyDescription={t(
                      'Open a ticket when you need help from the team.'
                    )}
                    emptyAction={
                      <Button
                        size='sm'
                        className='min-h-11 sm:min-h-8'
                        onClick={() => setCreating(true)}
                      >
                        {t('New ticket')}
                      </Button>
                    }
                    toolbar={
                      <TicketToolbar
                        category={category}
                        onCategoryChange={(value) => {
                          setCategory(value)
                          backToFirstPage()
                        }}
                        priority={priority}
                        onPriorityChange={(value) => {
                          setPriority(value)
                          backToFirstPage()
                        }}
                        keyword={keyword}
                        onKeywordChange={(value) => {
                          setKeyword(value)
                          backToFirstPage()
                        }}
                        placeholder={t('Search by subject')}
                      />
                    }
                  />
                ),
              }))}
            />
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      {creating && (
        <TicketCreateDialog
          onClose={() => setCreating(false)}
          onCreated={(ticket) => {
            setCreating(false)
            open(ticket)
          }}
        />
      )}
      {openTicketId !== null && (
        <TicketDetailDialog
          ticketId={openTicketId}
          isAdmin={false}
          onClose={() => withViewTransition(() => setOpenTicketId(null))}
        />
      )}
    </>
  )
}
