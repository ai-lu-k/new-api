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
import { TimerReset } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { TitledCard } from '@/components/ui/titled-card'
import { toIntlLocale } from '@/i18n/languages'
import {
  formatNumber,
  formatTimestampRelative,
  formatTimestampToDate,
} from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { commandCodePoolKeys, getPoolState } from '../../api'
import { MILLISECONDS_PER_MINUTE, millisecondsToUnit } from '../../lib'
import { PoolQueryState } from '../query-state'

/**
 * The proxy's credits polling job: when it last read the keys, when it reads
 * them again, and whether the last pass succeeded. Without this an operator
 * cannot tell a stale balance from an exhausted one.
 */
export function CreditsRefreshPanel() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const query = useQuery({
    queryKey: commandCodePoolKeys.pool,
    queryFn: async () => requireServerSuccess(await getPoolState()),
    refetchInterval: 60_000,
  })
  const refresh = query.data?.data?.creditsRefresh
  const intervalMinutes = refresh
    ? millisecondsToUnit(refresh.intervalMs, MILLISECONDS_PER_MINUTE)
    : 0

  return (
    <TitledCard
      title={t('Credits refresh')}
      icon={<TimerReset />}
      iconTone='info'
      description={t(
        'The proxy re-reads every key’s credits on this schedule. A failed pass keeps the previous readings.'
      )}
      action={
        refresh ? (
          <Badge variant={refresh.running ? 'secondary' : 'outline'}>
            {refresh.running ? t('Running') : t('Idle')}
          </Badge>
        ) : undefined
      }
    >
      <PoolQueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
      >
        <dl className='grid gap-3 text-sm sm:grid-cols-2'>
          <div>
            <dt className='text-muted-foreground text-xs'>{t('Interval')}</dt>
            <dd className='tabular-nums'>
              {refresh
                ? t('{{minutes}} minutes', {
                    minutes: formatNumber(intervalMinutes, locale),
                  })
                : '—'}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Last refresh')}
            </dt>
            <dd className='tabular-nums'>
              {refresh?.lastAt
                ? formatTimestampToDate(refresh.lastAt, 'milliseconds')
                : '—'}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Next refresh')}
            </dt>
            <dd className='tabular-nums'>
              {refresh?.nextAt
                ? t('{{time}} ({{relative}})', {
                    time: formatTimestampToDate(refresh.nextAt, 'milliseconds'),
                    relative: formatTimestampRelative(
                      refresh.nextAt,
                      'milliseconds',
                      locale
                    ),
                  })
                : '—'}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Last result')}
            </dt>
            <dd className='tabular-nums'>
              {refresh
                ? t('{{ok}} read, {{failed}} failed', {
                    ok: formatNumber(refresh.lastOk, locale),
                    failed: formatNumber(refresh.lastFailed, locale),
                  })
                : '—'}
            </dd>
          </div>
          {refresh?.lastError && (
            <div className='sm:col-span-2'>
              <dt className='text-muted-foreground text-xs'>
                {t('Last error')}
              </dt>
              <dd className='text-destructive text-xs break-all'>
                {refresh.lastError}
              </dd>
            </div>
          )}
        </dl>
      </PoolQueryState>
    </TitledCard>
  )
}
