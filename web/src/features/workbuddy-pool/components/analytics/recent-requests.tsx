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
import { ListOrdered } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { TitledCard } from '@/components/ui/titled-card'
import { toIntlLocale } from '@/i18n/languages'
import dayjs from '@/lib/dayjs'
import { formatTimestampToDate } from '@/lib/format'

import type { WorkBuddyRecent, WorkBuddyRecentRow } from '../../types'
import {
  accountName,
  formatCny,
  formatCount,
  formatRate,
  formatTokens,
} from './lib'
import { OutcomeBadge } from './outcome-badge'
import { analyticsKeys, readHub } from './queries'
import { AnalyticsQueryState } from './query-state'
import { ALL_MODELS, type AnalyticsRealm, type AnalyticsWindow } from './types'

/** The hub serves up to 100 rows per page; twenty keeps the table readable. */
const RECENT_PAGE_SIZE = 20

type AnalyticsRecentRequestsProps = {
  realm: AnalyticsRealm
  window: AnalyticsWindow
  model: string
  page: number
  names: Record<string, string>
  onPageChange: (page: number) => void
}

function rowTime(row: WorkBuddyRecentRow): string {
  if (row.iso) return dayjs(row.iso).format('MM-DD HH:mm:ss')
  return formatTimestampToDate(row.at)
}

/**
 * The request log behind the totals. Paging is the hub's, so the model filter
 * can only narrow the page that came back — the copy says so.
 */
export function AnalyticsRecentRequests(
  props: AnalyticsRecentRequestsProps
): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const query = useQuery({
    queryKey: analyticsKeys.recent(
      props.realm,
      props.window,
      props.page,
      RECENT_PAGE_SIZE
    ),
    queryFn: () =>
      readHub<WorkBuddyRecent>('usage.recent', {
        realm: props.realm,
        page: props.page,
        limit: RECENT_PAGE_SIZE,
      }),
  })
  const payload = query.data
  const rows = (payload?.rows ?? []).filter(
    (row) => props.model === ALL_MODELS || row.model === props.model
  )
  const totalPages = payload?.total_pages ?? 1
  const canGoBack = props.page > 1
  const canGoForward = props.page < totalPages

  const columns: StaticDataTableColumn<WorkBuddyRecentRow>[] = [
    {
      id: 'at',
      header: t('Time'),
      cell: (row) => (
        <span className='text-xs tabular-nums'>{rowTime(row)}</span>
      ),
    },
    {
      id: 'model',
      header: t('Model'),
      cell: (row) => <span className='font-mono text-xs'>{row.model}</span>,
    },
    {
      id: 'account',
      header: t('Account'),
      cell: (row) => (
        <span className='font-mono text-xs' title={row.account}>
          {accountName(row.account, props.names)}
        </span>
      ),
    },
    {
      id: 'outcome',
      header: t('Outcome'),
      cell: (row) => <OutcomeBadge outcome={row.outcome} />,
    },
    {
      id: 'elapsed',
      header: t('Elapsed / TTFT (ms)'),
      className: 'text-right',
      cell: (row) => (
        <span className='tabular-nums'>
          {formatCount(row.elapsed_ms, locale)} /{' '}
          {formatCount(row.ttft_ms, locale)}
        </span>
      ),
    },
    {
      id: 'tokens',
      header: t('Tokens'),
      className: 'text-right',
      cell: (row) => (
        <span
          className='tabular-nums'
          title={formatCount(row.total_tokens, locale)}
        >
          {formatTokens(row.total_tokens, locale)}
        </span>
      ),
    },
    {
      id: 'cache',
      header: t('Cache hit'),
      className: 'text-right',
      cell: (row) => (
        <span className='tabular-nums'>
          {formatRate(row.cache_hit_pct, locale)}
        </span>
      ),
    },
    {
      id: 'credit',
      header: t('Credit'),
      className: 'text-right',
      cell: (row) => (
        <span className='tabular-nums'>{formatCount(row.credit, locale)}</span>
      ),
    },
    {
      id: 'cost',
      header: t('Estimated cost'),
      className: 'text-right',
      cell: (row) => (
        <span className='tabular-nums'>{formatCny(row.cost_cny, locale)}</span>
      ),
    },
    {
      id: 'key',
      header: t('API key'),
      cell: (row) => (
        <span className='font-mono text-xs' title={row.key}>
          {row.key_name ?? '-'}
        </span>
      ),
    },
  ]

  return (
    <TitledCard
      title={t('Recent requests')}
      icon={<ListOrdered />}
      iconTone='chart-5'
      description={t(
        'The newest requests the gateway recorded, newest first. Paging is the hub’s, so a model filter can leave a page empty.'
      )}
      action={
        <div className='flex items-center gap-2'>
          <Button
            size='sm'
            variant='outline'
            disabled={!canGoBack}
            onClick={() => props.onPageChange(props.page - 1)}
          >
            {t('Previous')}
          </Button>
          <span className='text-muted-foreground text-xs tabular-nums'>
            {t('Page {{page}} of {{pages}}', {
              page: formatCount(props.page, locale),
              pages: formatCount(totalPages, locale),
            })}
          </span>
          <Button
            size='sm'
            variant='outline'
            disabled={!canGoForward}
            onClick={() => props.onPageChange(props.page + 1)}
          >
            {t('Next')}
          </Button>
        </div>
      }
    >
      <AnalyticsQueryState
        isPending={query.isPending}
        isError={query.isError}
        errorMessage={query.error?.message}
        onRetry={() => void query.refetch()}
      >
        <StaticDataTable
          columns={columns}
          data={rows}
          getRowKey={(row) => `${row.at}-${row.model}-${row.account}`}
          tableClassName='min-w-[1080px]'
          emptyContent={
            <span className='text-muted-foreground text-sm'>
              {t('No request on this page')}
            </span>
          }
        />
        <p className='text-muted-foreground mt-3 text-xs tabular-nums'>
          {t('{{total}} requests recorded', {
            total: formatCount(payload?.total ?? 0, locale),
          })}
        </p>
      </AnalyticsQueryState>
    </TitledCard>
  )
}
