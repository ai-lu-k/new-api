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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { requireServerSuccess } from '@/lib/server-error-message'

import { hubGet } from '../api'
import { ActivityHistory } from './tasks/activity-history'
import { CheckinTable } from './tasks/checkin-table'
import { SchedulerPanel } from './tasks/scheduler-panel'
import { TasksTable } from './tasks/tasks-table'
import type { WorkBuddyTasksPayload } from './tasks/types'
import { WelfarePanel } from './tasks/welfare-panel'

/** The whole pool, as the hub's own account picker offers it. */
const ALL_ACCOUNTS = 'all'

/**
 * Tasks and rewards: the hub's growth tasks, streak and cat welfare, the
 * scheduler that keeps them running, and the record of what it actually did.
 *
 * The task snapshot is per account — the hub answers with the first domestic
 * account when no `uid` is given — so the picker above it decides which
 * account every task and welfare figure on this page belongs to. The bulk
 * actions ignore it, exactly like the hub dashboard.
 */
export function TasksTab() {
  const { t } = useTranslation()
  const [uid, setUid] = useState(ALL_ACCOUNTS)
  const query = useQuery({
    queryKey: ['workbuddy', 'tasks', uid],
    queryFn: async (): Promise<WorkBuddyTasksPayload> => {
      const params = uid === ALL_ACCOUNTS ? undefined : { uid }
      const response = requireServerSuccess(
        await hubGet<WorkBuddyTasksPayload>('tasks', params)
      )
      return (
        response.data ?? {
          tasks: [],
          summary: {},
          accounts: [],
          msg: undefined,
        }
      )
    },
    refetchInterval: 60_000,
  })

  const payload = query.data
  const accounts = payload?.accounts ?? []
  const selected = accounts.find((account) => account.uid === uid)
  const targetName =
    uid === ALL_ACCOUNTS
      ? t('every domestic account')
      : selected?.nickname || uid.slice(0, 8)

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center gap-3'>
        <span className='text-muted-foreground text-sm'>
          {t('Tasks shown for')}
        </span>
        <Select
          items={[
            { value: ALL_ACCOUNTS, label: t('Every domestic account') },
            ...accounts.map((account) => ({
              value: account.uid,
              label: account.nickname || account.uid.slice(0, 8),
            })),
          ]}
          value={uid}
          onValueChange={(value) => setUid(String(value ?? ALL_ACCOUNTS))}
        >
          <SelectTrigger aria-label={t('Account')} className='min-w-56'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              <SelectItem value={ALL_ACCOUNTS}>
                {t('Every domestic account')}
              </SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.uid} value={account.uid}>
                  {account.nickname || account.uid.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className='text-muted-foreground text-xs'>
          {t(
            'Claiming needs one account. Running tasks and the welfare actions work on the whole pool when no account is picked.'
          )}
        </span>
      </div>

      {query.isLoading && <LoadingState />}
      {query.isError && (
        <ErrorState
          title={t('Could not read the growth tasks')}
          onRetry={() => query.refetch()}
        />
      )}
      {payload && (
        <>
          <TasksTable uid={uid} payload={payload} />
          <WelfarePanel
            uid={uid}
            targetName={targetName}
            summary={payload.summary}
          />
        </>
      )}

      <SchedulerPanel />
      <CheckinTable />
      <ActivityHistory />
    </div>
  )
}
