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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Reveal } from '@/components/motion/reveal'
import {
  SectionPanel,
  type SectionPanelStatus,
} from '@/components/section-panel'
import { getUserLogs } from '@/features/usage-logs/api'
import { LOG_TYPE_ENUM } from '@/features/usage-logs/constants'
import type { UsageLog } from '@/features/usage-logs/data/schema'
import { toIntlLocale } from '@/i18n/languages'
import {
  formatLogQuota,
  formatTimestampRelative,
  formatTokens,
} from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'
import { textActionClass } from '@/lib/text-action'
import { cn } from '@/lib/utils'

const SHOWN = 5

/** The account's latest requests, with the way to the full log. */
export function RecentRequests(props: { compact?: boolean }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const query = useQuery({
    queryKey: ['dashboard', 'overview', 'recent-requests'],
    queryFn: async () => {
      const result = requireServerSuccess(
        await getUserLogs({
          p: 1,
          page_size: SHOWN,
          type: LOG_TYPE_ENUM.CONSUME,
        })
      )
      return (result.data?.items ?? []) as UsageLog[]
    },
    staleTime: 30 * 1000,
    meta: { errorToast: false },
  })
  const logs = query.data ?? []

  let status: SectionPanelStatus = 'ready'
  if (query.isPending) status = 'loading'
  else if (logs.length === 0) status = 'empty'

  return (
    <SectionPanel
      title={t('Recent requests')}
      actions={
        <Link
          to='/usage-logs/$section'
          params={{ section: 'common' }}
          className={cn(
            'text-muted-foreground hover:text-foreground text-xs',
            textActionClass
          )}
        >
          {t('View all')}
        </Link>
      }
      status={status}
      emptyMessage={t('No requests yet')}
    >
      <ul className='divide-y text-sm'>
        {logs.map((log, index) => (
          <Reveal
            as='li'
            key={log.id}
            delay={Math.min(index, 3) * 0.04}
            className={cn(
              'flex items-center gap-3 px-4 py-2.5 tabular-nums',
              props.compact &&
                'grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 py-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,.55fr)_auto] lg:px-0'
            )}
          >
            <span
              className='min-w-0 flex-1 truncate font-medium'
              title={log.model_name}
            >
              {log.model_name}
            </span>
            <span
              className={cn(
                'text-muted-foreground hidden shrink-0 text-xs sm:inline',
                props.compact &&
                  'col-start-1 row-start-2 inline sm:inline lg:col-start-2 lg:row-start-1'
              )}
            >
              {formatTokens(log.prompt_tokens)} /{' '}
              {formatTokens(log.completion_tokens)}
            </span>
            <span
              className={cn(
                'w-20 shrink-0 text-right',
                props.compact &&
                  'col-start-2 row-start-1 w-auto text-xs lg:col-start-3 lg:text-left'
              )}
            >
              {formatLogQuota(log.quota)}
            </span>
            <span
              className={cn(
                'text-muted-foreground w-20 shrink-0 text-right text-xs',
                props.compact &&
                  'col-start-2 row-start-2 w-auto text-[11px] lg:col-start-4 lg:row-start-1'
              )}
            >
              {formatTimestampRelative(log.created_at, 'seconds', locale)}
            </span>
          </Reveal>
        ))}
      </ul>
    </SectionPanel>
  )
}
