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

import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import type { WorkBuddyGrowthTask, WorkBuddyTasksPayload } from './types'
import { useClaimTask, useRunTasks } from './use-task-mutations'

type TaskStatusStyle = {
  labelKey: string
  variant: 'default' | 'secondary' | 'outline'
}

/** The upstream accept statuses the hub forwards, and how each one reads. */
const TASK_STATUS: Record<string, TaskStatusStyle> = {
  not_accepted: { labelKey: 'Not accepted', variant: 'outline' },
  accepted: { labelKey: 'Accepted', variant: 'secondary' },
  in_progress: { labelKey: 'In progress', variant: 'secondary' },
  completed: { labelKey: 'Ready to claim', variant: 'default' },
  claimed: { labelKey: 'Claimed', variant: 'secondary' },
}

/**
 * Why this task cannot be claimed right now, as an i18n key. Mirrors the
 * dashboard: a reward is only claimable once the progress is complete, never
 * twice, and the hub needs one concrete account to claim for.
 */
function claimBlockKey(task: WorkBuddyGrowthTask, uid: string): string | null {
  if (uid === 'all') return 'Select a single account to claim'
  if (task.status === 'claimed') return 'Already claimed'
  if (task.status === 'completed') return null
  if (task.current >= task.target) return null
  return 'Progress is not complete yet'
}

/** Rounded progress for the bar; a zero target must not divide by zero. */
function progressPercent(task: WorkBuddyGrowthTask): number {
  if (task.target <= 0) return 0
  return Math.min(100, Math.round((task.current / task.target) * 100))
}

type TaskRowProps = {
  task: WorkBuddyGrowthTask
  uid: string
  locale: Intl.LocalesArgument
  isClaiming: boolean
  onClaim: (task: WorkBuddyGrowthTask) => void
}

function TaskRow(props: TaskRowProps): React.JSX.Element {
  const { t } = useTranslation()
  const task = props.task
  const style = TASK_STATUS[task.status]
  const blockKey = claimBlockKey(task, props.uid)
  const finished = task.status === 'claimed' || task.status === 'completed'
  const progressText = finished
    ? t('Completed')
    : `${formatNumber(task.current, props.locale)} / ${formatNumber(task.target, props.locale)}`

  return (
    <TableRow>
      <TableCell className='max-w-80 whitespace-normal'>
        <div className='flex flex-wrap items-center gap-1.5'>
          <span className='font-medium'>{task.name}</span>
          {task.unforgeable && (
            <Badge variant='warning' title={task.reason || undefined}>
              {t('Manual only')}
            </Badge>
          )}
        </div>
        <div className='text-muted-foreground mt-0.5 font-mono text-[11px]'>
          {task.task_code}
        </div>
        {task.description && (
          <p className='text-muted-foreground mt-1 text-xs'>
            {task.description}
          </p>
        )}
        {task.reason && (
          <p className='text-warning mt-1 text-xs'>{task.reason}</p>
        )}
      </TableCell>
      <TableCell className='w-40 whitespace-normal'>
        <Progress
          value={progressPercent(task)}
          aria-label={t('Task progress')}
          className='w-32'
        />
        <span className='text-muted-foreground mt-1 block text-xs'>
          {progressText}
        </span>
      </TableCell>
      <TableCell className='whitespace-normal'>
        <span className='block text-sm'>
          +{formatNumber(task.reward_credit, props.locale)} {t('credits')}
        </span>
        <span className='text-muted-foreground block text-xs'>
          +{formatNumber(task.reward_energy, props.locale)} {t('energy')}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant={style ? style.variant : 'outline'}>
          {style ? t(style.labelKey) : task.status}
        </Badge>
      </TableCell>
      <TableCell className='text-right'>
        <Button
          size='sm'
          variant='outline'
          disabled={blockKey !== null || props.isClaiming}
          title={blockKey ? t(blockKey) : undefined}
          onClick={() => props.onClaim(task)}
        >
          {t('Claim')}
        </Button>
      </TableCell>
    </TableRow>
  )
}

/**
 * The growth task list for one account (or the whole pool, when the operator
 * has not picked one). Claiming needs a single account; running works on every
 * participating domestic account at once, exactly like the hub dashboard.
 */
export function TasksTable(props: {
  uid: string
  payload: WorkBuddyTasksPayload
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [autoClaim, setAutoClaim] = useState(true)
  const claim = useClaimTask()
  const run = useRunTasks()
  const tasks = props.payload.tasks
  const logs = run.data?.logs ?? []

  const handleClaim = (task: WorkBuddyGrowthTask): void => {
    claim.mutate({ uid: props.uid, code: task.task_code })
  }

  const handleRun = (): void => {
    if (props.uid === 'all') {
      run.mutate({ claim: autoClaim })
      return
    }
    run.mutate({ uid: props.uid, claim: autoClaim })
  }

  return (
    <section
      aria-label={t('Growth tasks')}
      className='bg-card overflow-hidden rounded-xl border'
    >
      <header className='flex flex-wrap items-start justify-between gap-3 px-5 py-4'>
        <div>
          <h2 className='text-base font-semibold'>{t('Growth tasks')}</h2>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t(
              'Tasks the hub can accept, report and claim for a domestic account. A task the hub cannot automate is marked manual and needs the desktop app.'
            )}
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-3'>
          <div className='flex items-center gap-2'>
            <Checkbox
              id='workbuddy-task-auto-claim'
              checked={autoClaim}
              onCheckedChange={(checked) => setAutoClaim(checked === true)}
              disabled={run.isPending}
            />
            <Label htmlFor='workbuddy-task-auto-claim' className='text-xs'>
              {t('Claim rewards automatically')}
            </Label>
          </div>
          <Button
            size='sm'
            onClick={handleRun}
            disabled={run.isPending || tasks.length === 0}
          >
            {run.isPending ? t('Running tasks…') : t('Run all tasks')}
          </Button>
        </div>
      </header>

      {tasks.length === 0 ? (
        <div className='border-t'>
          <EmptyState
            title={t('No growth tasks')}
            description={
              props.payload.msg || t('No domestic account takes part in tasks.')
            }
          />
        </div>
      ) : (
        <div className='overflow-x-auto border-t'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Task')}</TableHead>
                <TableHead>{t('Progress')}</TableHead>
                <TableHead>{t('Reward')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead className='text-right'>{t('Action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TaskRow
                  key={task.task_code}
                  task={task}
                  uid={props.uid}
                  locale={locale}
                  isClaiming={claim.isPending}
                  onClaim={handleClaim}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {logs.length > 0 && (
        <div className='border-t px-5 py-4'>
          <h3 className='text-sm font-medium'>{t('Last run log')}</h3>
          <pre className='bg-muted/40 mt-2 max-h-64 overflow-auto rounded-md border p-3 font-mono text-xs whitespace-pre-wrap'>
            {logs.join('\n')}
          </pre>
        </div>
      )}
    </section>
  )
}
