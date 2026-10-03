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

const SHOWN = 5

/** The account's latest requests, with the way to the full log. */
export function RecentRequests() {
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

  return (
    <section className='bg-card flex flex-col rounded-lg border'>
      <header className='flex items-center justify-between gap-3 border-b px-4 py-3'>
        <h3 className='text-sm font-semibold'>{t('Recent requests')}</h3>
        <Link
          to='/usage-logs/$section'
          params={{ section: 'common' }}
          className='text-muted-foreground hover:text-foreground text-xs'
        >
          {t('View all')}
        </Link>
      </header>
      {logs.length === 0 ? (
        <p className='text-muted-foreground px-4 py-8 text-center text-sm'>
          {query.isPending ? t('Loading...') : t('No requests yet')}
        </p>
      ) : (
        <ul className='divide-y text-sm'>
          {logs.map((log) => (
            <li
              key={log.id}
              className='flex items-center gap-3 px-4 py-2.5 tabular-nums'
            >
              <span className='min-w-0 flex-1 truncate font-medium'>
                {log.model_name}
              </span>
              <span className='text-muted-foreground hidden shrink-0 text-xs sm:inline'>
                {formatTokens(log.prompt_tokens)} /{' '}
                {formatTokens(log.completion_tokens)}
              </span>
              <span className='w-20 shrink-0 text-right'>
                {formatLogQuota(log.quota)}
              </span>
              <span className='text-muted-foreground w-20 shrink-0 text-right text-xs'>
                {formatTimestampRelative(log.created_at, 'seconds', locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
