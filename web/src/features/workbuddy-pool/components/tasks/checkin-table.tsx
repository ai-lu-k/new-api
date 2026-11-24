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

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
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

import { hubGet } from '../../api'
import type { WorkBuddyAccount, WorkBuddyAccountList } from '../../types'
import { BulkActionDialog } from './bulk-action-dialog'
import { useBulkDailyChat, useBulkDailyChatWeb } from './use-activity-mutations'

const REALM_LABEL: Record<string, string> = {
  cn: 'Domestic',
  intl: 'International',
}

/**
 * One capability and its last run. `can` is the hub's eligibility flag, not a
 * "still to do today" flag: it says the account has a growth system at all.
 */
function CapabilityCell(props: {
  can: boolean | undefined
  last: string | null | undefined
}): React.JSX.Element {
  const { t } = useTranslation()
  if (props.can === undefined) {
    return <span className='text-muted-foreground text-xs'>—</span>
  }
  return (
    <div className='space-y-1'>
      <Badge variant={props.can ? 'secondary' : 'outline'}>
        {props.can ? t('Eligible') : t('Not eligible')}
      </Badge>
      <span className='text-muted-foreground block text-xs'>
        {props.last
          ? t('Last run {{time}}', { time: props.last })
          : t('Never run')}
      </span>
    </div>
  )
}

/**
 * Who can check in, chat or report activity, with the last time each of those
 * really ran, plus the three bulk actions. The bulk actions touch every
 * matching account, so each one lists its targets before it starts.
 */
export function CheckinTable(): React.JSX.Element {
  const { t } = useTranslation()
  const [chatOpen, setChatOpen] = useState(false)
  const [webOpen, setWebOpen] = useState(false)
  const chat = useBulkDailyChat()
  const web = useBulkDailyChatWeb()
  const query = useQuery({
    queryKey: ['workbuddy', 'accounts'],
    queryFn: async (): Promise<WorkBuddyAccount[]> => {
      const response = requireServerSuccess(
        await hubGet<WorkBuddyAccountList>('accounts', { realm: 'all' })
      )
      return response.data?.accounts ?? []
    },
    refetchInterval: 60_000,
  })

  const accounts = query.data ?? []
  const chatTargets = accounts.filter(
    (account) => account.tasksEnabled && account.realm === 'intl'
  )

  const confirmChat = (): void => {
    chat.mutate()
    setChatOpen(false)
  }
  const confirmWeb = (): void => {
    web.mutate()
    setWebOpen(false)
  }

  return (
    <section
      aria-label={t('Daily activity')}
      className='bg-card overflow-hidden rounded-xl border'
    >
      <header className='flex flex-wrap items-start justify-between gap-3 px-5 py-4'>
        <div>
          <h2 className='text-base font-semibold'>{t('Daily activity')}</h2>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t(
              'Check-in runs on the gateway schedule (09:00 and 21:00), so this table only reports it. The chats below run on demand and hit every matching account.'
            )}
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            size='sm'
            variant='outline'
            onClick={() => setChatOpen(true)}
            disabled={chat.isPending}
          >
            {t('Run daily chat')}
          </Button>
          <Button
            size='sm'
            variant='outline'
            onClick={() => setWebOpen(true)}
            disabled={web.isPending}
          >
            {t('Run web-channel chat')}
          </Button>
        </div>
      </header>

      {query.isLoading && <LoadingState className='border-t py-6' />}
      {query.isError && (
        <div className='border-t'>
          <ErrorState
            compact
            title={t('Could not read the accounts')}
            onRetry={() => query.refetch()}
          />
        </div>
      )}
      {query.isSuccess && (
        <div className='overflow-x-auto border-t'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Account')}</TableHead>
                <TableHead>{t('Realm')}</TableHead>
                <TableHead>{t('Check-in')}</TableHead>
                <TableHead>{t('Daily chat')}</TableHead>
                <TableHead>{t('Activity report')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.uid}>
                  <TableCell className='whitespace-normal'>
                    <span className='font-medium'>
                      {account.nickname || account.uid.slice(0, 8)}
                    </span>
                    <span className='text-muted-foreground mt-0.5 block font-mono text-[11px]'>
                      {account.uid.slice(0, 8)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant='outline'>
                      {REALM_LABEL[account.realm]
                        ? t(REALM_LABEL[account.realm])
                        : account.realm}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <CapabilityCell
                      can={account.canCheckin}
                      last={account.lastCheckin}
                    />
                  </TableCell>
                  <TableCell>
                    <CapabilityCell
                      can={account.canDailyChat}
                      last={account.lastDailyChat}
                    />
                  </TableCell>
                  <TableCell>
                    <CapabilityCell
                      can={account.canReportActivity}
                      last={account.lastActivityReport}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <BulkActionDialog
        open={chatOpen}
        onOpenChange={setChatOpen}
        title={t('Run daily chat')}
        desc={t(
          'Runs the light desktop chat for every international account that takes part in tasks. Each chat spends a little of that account quota.'
        )}
        confirmText={t('Run chat now')}
        accounts={chatTargets}
        isLoading={chat.isPending}
        onConfirm={confirmChat}
      />
      <BulkActionDialog
        open={webOpen}
        onOpenChange={setWebOpen}
        title={t('Run web-channel chat')}
        desc={t(
          'Creates one web session per international account that takes part in tasks and runs a real task on it, because the official daily activity only counts web conversations. This spends account quota.'
        )}
        confirmText={t('Run chat now')}
        accounts={chatTargets}
        isLoading={web.isPending}
        onConfirm={confirmWeb}
      />
    </section>
  )
}
