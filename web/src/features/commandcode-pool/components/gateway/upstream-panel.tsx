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
import { Route } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { TitledCard } from '@/components/ui/titled-card'
import { requireServerSuccess } from '@/lib/server-error-message'

import { commandCodePoolKeys, getPoolOverview } from '../../api'
import { PoolQueryState } from '../query-state'

/**
 * The proxy's own description of where it sends CommandCode traffic. The
 * overview also lists its other sources; only the `cc` one belongs on this
 * page, since the rest are served by their own consoles.
 */
export function UpstreamPanel() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: commandCodePoolKeys.overview,
    queryFn: async () => requireServerSuccess(await getPoolOverview()),
    refetchInterval: 60_000,
  })
  const source = query.data?.data?.sources?.find((item) => item.id === 'cc')
  const endpoints = source?.egress?.endpoints ?? []

  return (
    <TitledCard
      title={t('Upstream route')}
      icon={<Route />}
      iconTone='info'
      description={t(
        'Where the proxy sends CommandCode traffic and which endpoints it exposes.'
      )}
    >
      <PoolQueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
      >
        {!source ? (
          <p className='text-muted-foreground text-sm'>
            {t('The proxy did not describe its CommandCode source.')}
          </p>
        ) : (
          <dl className='grid gap-3 text-sm sm:grid-cols-2'>
            <div>
              <dt className='text-muted-foreground text-xs'>{t('Upstream')}</dt>
              <dd className='font-mono text-xs break-all'>
                {source.upstream || '—'}
              </dd>
            </div>
            <div>
              <dt className='text-muted-foreground text-xs'>
                {source.entryLabel ? t(source.entryLabel) : t('Entry')}
              </dt>
              <dd className='font-mono text-xs break-all'>
                {source.entry || '—'}
              </dd>
            </div>
            <div className='sm:col-span-2'>
              <dt className='text-muted-foreground text-xs'>
                {t('Internal egress')}
              </dt>
              <dd className='font-mono text-xs break-all'>
                {source.egress?.internal || '—'}
              </dd>
            </div>
            <div>
              <dt className='text-muted-foreground text-xs'>
                {t('Egress prefix')}
              </dt>
              <dd className='font-mono text-xs break-all'>
                {source.egress?.prefix || '—'}
              </dd>
            </div>
            <div className='sm:col-span-2'>
              <dt className='text-muted-foreground text-xs'>
                {t('Egress endpoints')}
              </dt>
              <dd className='mt-1 flex flex-wrap gap-1.5'>
                {endpoints.length === 0 && (
                  <span className='text-muted-foreground text-xs'>
                    {t('Not reported')}
                  </span>
                )}
                {endpoints.map((endpoint) => (
                  <span
                    key={endpoint}
                    className='bg-muted/60 rounded-md px-1.5 py-0.5 font-mono text-xs'
                  >
                    {endpoint}
                  </span>
                ))}
              </dd>
            </div>
            {source.note && (
              <div className='sm:col-span-2'>
                <dt className='text-muted-foreground text-xs'>{t('Note')}</dt>
                <dd className='text-xs'>{source.note}</dd>
              </div>
            )}
          </dl>
        )}
      </PoolQueryState>
    </TitledCard>
  )
}
