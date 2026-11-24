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
import { ArrowRight, ListOrdered } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TitledCard } from '@/components/ui/titled-card'
import { toIntlLocale } from '@/i18n/languages'
import dayjs from '@/lib/dayjs'
import {
  formatCompactNumber,
  formatNumber,
  formatTimestampToDate,
} from '@/lib/format'

import type { WorkBuddyRecent, WorkBuddyRecentRow } from '../../types'
import { gatewayKeys, readHub } from './gateway-queries'
import { GatewayQueryState } from './query-state'

/** How many rows the compact table keeps before the Analytics tab takes over. */
const RECENT_LIMIT = 10

const OUTCOME_LABEL_KEYS: Record<string, string> = {
  completed: 'Completed',
  error: 'Error',
  failed: 'Failed',
  client_aborted: 'Client aborted',
}

const OUTCOME_VARIANTS: Record<
  string,
  'secondary' | 'destructive' | 'warning'
> = {
  completed: 'secondary',
  error: 'destructive',
  failed: 'destructive',
  client_aborted: 'warning',
}

function rowTime(row: WorkBuddyRecentRow): string {
  if (row.iso) return dayjs(row.iso).format('MM-DD HH:mm:ss')
  return formatTimestampToDate(row.at)
}

/**
 * The last few requests the gateway served, so an operator can see traffic
 * from this tab without switching to Analytics.
 */
export function GatewayRecentRequests(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const query = useQuery({
    queryKey: [...gatewayKeys.recent, RECENT_LIMIT],
    queryFn: () =>
      readHub<WorkBuddyRecent>('usage.recent', {
        limit: RECENT_LIMIT,
        page: 1,
      }),
    refetchInterval: 30_000,
  })
  const rows = query.data?.rows ?? []

  const columns: StaticDataTableColumn<WorkBuddyRecentRow>[] = [
    {
      id: 'at',
      header: t('Time'),
      className: 'w-[18%]',
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
      // A request can fail before the gateway picks an account, so the field
      // is genuinely absent on some rows.
      cell: (row) => (
        <span className='font-mono text-xs' title={row.account ?? ''}>
          {row.account ? row.account.slice(0, 8) : t('No account')}
        </span>
      ),
    },
    {
      id: 'outcome',
      header: t('Outcome'),
      cell: (row) => (
        <Badge variant={OUTCOME_VARIANTS[row.outcome] ?? 'outline'}>
          {t(OUTCOME_LABEL_KEYS[row.outcome] ?? row.outcome)}
        </Badge>
      ),
    },
    {
      id: 'tokens',
      header: t('Tokens'),
      className: 'w-[12%] text-right',
      cell: (row) => (
        <span
          className='tabular-nums'
          title={formatNumber(row.total_tokens, locale)}
        >
          {formatCompactNumber(row.total_tokens, locale)}
        </span>
      ),
    },
    {
      id: 'credit',
      header: t('Credits'),
      className: 'w-[12%] text-right',
      cell: (row) => (
        <span className='tabular-nums'>{formatNumber(row.credit, locale)}</span>
      ),
    },
  ]

  return (
    <TitledCard
      title={t('Recent requests')}
      icon={<ListOrdered />}
      iconTone='chart-4'
      description={t(
        'The newest {{shown}} of {{total}} requests the gateway has recorded.',
        {
          shown: formatNumber(RECENT_LIMIT, locale),
          total: formatNumber(query.data?.total ?? 0, locale),
        }
      )}
      action={
        <Button
          variant='ghost'
          size='sm'
          render={<Link to='/workbuddy' search={{ tab: 'analytics' }} />}
        >
          {t('Open analytics')}
          <ArrowRight className='size-3.5' />
        </Button>
      }
    >
      <GatewayQueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
      >
        <StaticDataTable
          columns={columns}
          data={rows}
          getRowKey={(row) => `${row.at}-${row.model}-${row.account}`}
          tableClassName='min-w-[720px]'
          emptyContent={
            <span className='text-muted-foreground text-sm'>
              {t('No request has been recorded yet')}
            </span>
          }
        />
      </GatewayQueryState>
    </TitledCard>
  )
}
