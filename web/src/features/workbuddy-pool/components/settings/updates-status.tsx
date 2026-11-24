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
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

import type { HubUpdateStatus } from './types'

/** Installation states in which the updater is already doing something. */
export const BUSY_STATES = new Set([
  'queued',
  'downloading',
  'verifying',
  'backing_up',
  'stopping',
  'applying',
  'restoring',
  'restarting',
  'checking',
  'rolling_back',
])

const STATE_LABELS: Record<string, string> = {
  idle: 'Not started',
  queued: 'Queued',
  downloading: 'Downloading the release',
  verifying: 'Verifying the release',
  backing_up: 'Backing up the program files',
  stopping: 'Stopping the gateway',
  applying: 'Installing',
  restoring: 'Restoring an earlier version',
  restarting: 'Restarting the gateway',
  checking: 'Checking the gateway',
  succeeded: 'Update complete',
  restored: 'Rollback complete',
  rolling_back: 'Update failed, rolling back',
  rolled_back: 'Update rolled back',
  failed: 'Update failed',
  unavailable: 'Updater not installed',
}

/**
 * The version facts the updater reports: what runs now, what is on offer, and
 * how far the last installation got. Nothing here changes the host.
 */
export function UpdatesStatus(props: { status: HubUpdateStatus }) {
  const { t } = useTranslation()
  const status = props.status
  const installState = status.installation?.state || 'idle'
  const busy = BUSY_STATES.has(installState)

  return (
    <div className='space-y-3'>
      <dl className='grid gap-2 text-sm sm:grid-cols-2'>
        <div className='flex items-center justify-between gap-2'>
          <dt className='text-muted-foreground'>{t('Current version')}</dt>
          <dd className='font-mono'>{status.current_version || '-'}</dd>
        </div>
        <div className='flex items-center justify-between gap-2'>
          <dt className='text-muted-foreground'>{t('Latest version')}</dt>
          <dd className='font-mono'>{status.latest_version || '-'}</dd>
        </div>
        <div className='flex items-center justify-between gap-2'>
          <dt className='text-muted-foreground'>{t('Last checked')}</dt>
          <dd className='font-mono'>{status.last_attempt || '-'}</dd>
        </div>
        <div className='flex items-center justify-between gap-2'>
          <dt className='text-muted-foreground'>{t('Installation state')}</dt>
          <dd>
            <Badge variant={busy ? 'secondary' : 'outline'}>
              {t(STATE_LABELS[installState] || 'Unknown')}
            </Badge>
          </dd>
        </div>
      </dl>
      {!status.install_enabled && (
        <p className='text-muted-foreground text-xs'>
          {t(
            'Installing is disabled because the hub updater is not installed on this host.'
          )}
        </p>
      )}
      {status.last_error !== '' && (
        <p className='text-destructive text-xs'>{status.last_error}</p>
      )}
      {status.installation?.message !== '' && (
        <p className='text-muted-foreground text-xs'>
          {status.installation.message}
        </p>
      )}
    </div>
  )
}
