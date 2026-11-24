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
import { Scale } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { TitledCard } from '@/components/ui/titled-card'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { commandCodePoolKeys, getLoadBalancing } from '../../api'
import {
  COMMAND_CODE_STICKY_BY,
  COMMAND_CODE_STRATEGIES,
  labelFor,
  MILLISECONDS_PER_SECOND,
  millisecondsToUnit,
} from '../../lib'
import { PoolQueryState } from '../query-state'

/**
 * How the proxy spreads traffic across keys. The deployed proxy only reports
 * retries and cooldown; the dispatch fields are shown when the reply carries
 * them, so this panel never claims a strategy that is not configured.
 */
export function LoadBalancingPanel() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const query = useQuery({
    queryKey: commandCodePoolKeys.lb,
    queryFn: async () => requireServerSuccess(await getLoadBalancing()),
    refetchInterval: 60_000,
  })
  const lb = query.data?.data
  const cooldownSeconds = lb
    ? millisecondsToUnit(lb.cooldownMs, MILLISECONDS_PER_SECOND)
    : 0

  return (
    <TitledCard
      title={t('Load balancing')}
      icon={<Scale />}
      iconTone='info'
      description={t(
        'How the proxy picks a key, and how long a failing key is held out of rotation.'
      )}
    >
      <PoolQueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
      >
        <dl className='grid gap-3 text-sm sm:grid-cols-2'>
          {lb?.strategy != null && (
            <div>
              <dt className='text-muted-foreground text-xs'>{t('Strategy')}</dt>
              <dd>{t(labelFor(COMMAND_CODE_STRATEGIES, lb.strategy))}</dd>
            </div>
          )}
          {lb?.stickyBy != null && (
            <div>
              <dt className='text-muted-foreground text-xs'>
                {t('Session affinity')}
              </dt>
              <dd>{t(labelFor(COMMAND_CODE_STICKY_BY, lb.stickyBy))}</dd>
            </div>
          )}
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Max retries')}
            </dt>
            <dd className='tabular-nums'>
              {lb ? formatNumber(lb.maxRetries, locale) : '—'}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('Cooldown after a failure')}
            </dt>
            <dd className='tabular-nums'>
              {lb
                ? t('{{seconds}} seconds', {
                    seconds: formatNumber(cooldownSeconds, locale),
                  })
                : '—'}
            </dd>
          </div>
          {lb?.expiryFirst != null && (
            <div>
              <dt className='text-muted-foreground text-xs'>
                {t('Expiry first')}
              </dt>
              <dd>{lb.expiryFirst ? t('Yes') : t('No')}</dd>
            </div>
          )}
        </dl>
      </PoolQueryState>
    </TitledCard>
  )
}
