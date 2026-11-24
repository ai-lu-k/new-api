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
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  SectionPanel,
  type SectionPanelStatus,
} from '@/components/section-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { listSystemTasks } from '@/features/system-settings/api'
import { createServerError } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { SystemTaskHistory } from './system-task-history'
import { SystemTasksTable } from './system-tasks-table'

const ACTIVE_POLL_INTERVAL_MS = 8000

export function SystemTasksPanel() {
  const { t } = useTranslation()
  const tasksQuery = useQuery({
    queryKey: ['system-info', 'system-tasks', 'active'],
    queryFn: async () => {
      const res = await listSystemTasks(100, { scope: 'active' })
      if (!res.success || !Array.isArray(res.data)) {
        throw createServerError(res, t('We could not load system tasks.'))
      }
      return res.data
    },
    staleTime: 30 * 1000,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.length ? ACTIVE_POLL_INTERVAL_MS : false,
  })

  const activeTasks = tasksQuery.data ?? []
  const loading = tasksQuery.isLoading
  const refreshing = tasksQuery.isFetching && !loading
  const hasActiveTasks = activeTasks.length > 0

  let panelStatus: SectionPanelStatus = 'ready'
  if (loading) panelStatus = 'loading'
  else if (tasksQuery.isError) panelStatus = 'error'

  const errorDescription =
    tasksQuery.error instanceof Error ? tasksQuery.error.message : undefined

  return (
    <SectionPanel
      title={t('System Tasks')}
      description={t(
        'Recent maintenance tasks running across instances and their execution status.'
      )}
      actions={
        <div className='flex shrink-0 items-center gap-3'>
          <span
            className='text-muted-foreground inline-flex items-center gap-1.5 text-xs'
            aria-live='polite'
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                hasActiveTasks ? 'bg-emerald-500' : 'bg-muted-foreground/40'
              )}
              aria-hidden='true'
            />
            {hasActiveTasks
              ? t('Auto-refreshing every {{seconds}}s', {
                  seconds: ACTIVE_POLL_INTERVAL_MS / 1000,
                })
              : t('Live refresh pauses when no task is running')}
          </span>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => void tasksQuery.refetch()}
            disabled={tasksQuery.isFetching}
            aria-label={t('Refresh')}
          >
            <RefreshCw
              data-icon='inline-start'
              className={cn('size-3.5', refreshing && 'animate-spin')}
              aria-hidden='true'
            />
            {refreshing ? t('Refreshing...') : t('Refresh')}
          </Button>
        </div>
      }
      status={panelStatus}
      errorMessage={errorDescription}
      onRetry={() => void tasksQuery.refetch()}
      placeholderClassName='h-40'
    >
      <div aria-busy={tasksQuery.isFetching}>
        <div>
          <div className='mb-2 flex items-center justify-between gap-3'>
            <div>
              <h4 className='text-sm font-medium'>{t('Active Tasks')}</h4>
              <p className='text-muted-foreground mt-0.5 text-xs'>
                {t('Tasks currently pending or running.')}
              </p>
            </div>
            <Badge variant='outline'>{activeTasks.length}</Badge>
          </div>
          {activeTasks.length > 0 ? (
            <SystemTasksTable tasks={activeTasks} />
          ) : (
            <div className='flex items-center py-6'>
              <p className='text-muted-foreground text-[13px] leading-snug'>
                {t('No active system tasks.')}
              </p>
            </div>
          )}
        </div>
      </div>
      <div className='pt-4'>
        <SystemTaskHistory activeRefreshAt={tasksQuery.dataUpdatedAt} />
      </div>
    </SectionPanel>
  )
}
