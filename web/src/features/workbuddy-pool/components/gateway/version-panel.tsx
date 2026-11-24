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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PackageCheck, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TitledCard } from '@/components/ui/titled-card'
import { formatTimestampToDate } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { hubPost } from '../../api'
import { gatewayKeys, readHub } from './gateway-queries'
import type { WorkBuddyUpdates } from './gateway-types'
import { GatewayQueryState } from './query-state'

/**
 * The gateway's own version. Checking is a read-only fetch of the release
 * feed; installing and rolling back stay on the Settings tab, which owns the
 * actions that restart the gateway.
 */
export function GatewayVersionPanel(): React.JSX.Element {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: gatewayKeys.updates,
    queryFn: () => readHub<WorkBuddyUpdates>('updates'),
    refetchInterval: 60_000,
  })
  const check = useMutation({
    mutationFn: async () =>
      requireServerSuccess(
        await hubPost<WorkBuddyUpdates>('updates.check', {})
      ),
    onSuccess: (response) => {
      const latest = response.data?.latest_version ?? response.data?.latest_tag
      if (response.data?.update_available) {
        toast.success(
          t('Version {{version}} is available', { version: latest })
        )
      } else {
        toast.success(t('You are on the latest version'))
      }
      void queryClient.invalidateQueries({ queryKey: gatewayKeys.updates })
    },
    onError: (error) => handleServerError(error),
  })
  const updates = query.data

  return (
    <TitledCard
      title={t('Version and updates')}
      icon={<PackageCheck />}
      iconTone='chart-3'
      description={t(
        'The gateway build this console drives. Installing an update restarts the gateway, so those actions live on the Settings tab.'
      )}
      action={
        <div className='flex items-center gap-2'>
          {updates?.update_available === true && (
            <Badge variant='warning'>{t('Update available')}</Badge>
          )}
          <Button
            variant='outline'
            size='sm'
            disabled={check.isPending}
            onClick={() => check.mutate()}
          >
            <RefreshCw className='size-3.5' />
            {t('Check for updates')}
          </Button>
        </div>
      }
    >
      <GatewayQueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
      >
        <dl className='grid gap-3 text-sm sm:grid-cols-2'>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Current version')}
            </dt>
            <dd className='font-mono text-xs'>
              {updates?.current_version || '—'}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Latest version')}
            </dt>
            <dd className='font-mono text-xs'>
              {updates?.latest_version || t('Not checked yet')}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Installation state')}
            </dt>
            <dd>{updates?.installation.state || t('Not reported')}</dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Last checked')}
            </dt>
            <dd className='tabular-nums'>
              {formatTimestampToDate(updates?.last_success ?? undefined)}
            </dd>
          </div>
          {updates?.last_error ? (
            <div className='sm:col-span-2'>
              <dt className='text-muted-foreground text-xs'>
                {t('Last check failed')}
              </dt>
              <dd className='text-warning'>{updates.last_error}</dd>
            </div>
          ) : null}
          {updates?.release_url ? (
            <div className='sm:col-span-2'>
              <dt className='text-muted-foreground text-xs'>
                {t('Release notes')}
              </dt>
              <dd>
                <Button
                  variant='link'
                  size='sm'
                  render={
                    <a
                      href={updates.release_url}
                      target='_blank'
                      rel='noreferrer'
                    />
                  }
                >
                  {updates.latest_tag || updates.release_url}
                </Button>
              </dd>
            </div>
          ) : null}
        </dl>
      </GatewayQueryState>
    </TitledCard>
  )
}
