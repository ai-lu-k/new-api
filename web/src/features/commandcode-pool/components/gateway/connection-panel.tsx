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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Cable, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TitledCard } from '@/components/ui/titled-card'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { commandCodePoolKeys, getPoolStatus } from '../../api'
import { PoolQueryState } from '../query-state'

/**
 * The link between this site and its CommandCode proxy: whether the console may
 * use it at all, where it points, and whether the proxy answers right now.
 */
export function ConnectionPanel() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: commandCodePoolKeys.status,
    queryFn: async () => requireServerSuccess(await getPoolStatus()),
    refetchInterval: 60_000,
  })
  const status = query.data?.data

  async function retry() {
    await Promise.all([
      query.refetch(),
      queryClient.invalidateQueries({ queryKey: commandCodePoolKeys.pool }),
    ])
  }

  return (
    <TitledCard
      title={t('Connection')}
      icon={<Cable />}
      iconTone='info'
      description={t(
        'The address this console uses to reach the CommandCode proxy, and whether it answers.'
      )}
      action={
        <div className='flex items-center gap-2'>
          {status && (
            <Badge variant={status.reachable ? 'secondary' : 'destructive'}>
              {status.reachable ? t('Reachable') : t('Unreachable')}
            </Badge>
          )}
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={query.isFetching}
            onClick={() => void retry()}
          >
            <RefreshCw className='mr-1 size-4' />
            {t('Retry')}
          </Button>
        </div>
      }
    >
      <PoolQueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
      >
        <dl className='grid gap-3 text-sm sm:grid-cols-2'>
          <div className='sm:col-span-2'>
            <dt className='text-muted-foreground text-xs'>
              {t('Proxy address')}
            </dt>
            <dd className='font-mono text-xs break-all'>
              {status?.base_url || '—'}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Console enabled')}
            </dt>
            <dd>{status?.enabled ? t('Yes') : t('No')}</dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>{t('Configured')}</dt>
            <dd>{status?.configured ? t('Yes') : t('No')}</dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>{t('Keys')}</dt>
            <dd className='tabular-nums'>
              {status?.keys_total == null
                ? '—'
                : t('{{enabled}} enabled of {{total}}', {
                    enabled: formatNumber(status.keys_enabled ?? 0, locale),
                    total: formatNumber(status.keys_total, locale),
                  })}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Upstream API')}
            </dt>
            <dd className='font-mono text-xs break-all'>
              {status?.api_base || '—'}
            </dd>
          </div>
          {status?.error && (
            <div className='sm:col-span-2'>
              <dt className='text-muted-foreground text-xs'>
                {t('Last error')}
              </dt>
              <dd className='text-destructive text-xs break-all'>
                {status.error}
              </dd>
            </div>
          )}
        </dl>
      </PoolQueryState>
    </TitledCard>
  )
}
