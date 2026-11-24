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
import { Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { TitledCard } from '@/components/ui/titled-card'
import { toIntlLocale } from '@/i18n/languages'

import type { WorkBuddyByAccount } from '../../types'
import {
  accountName,
  cacheHitShare,
  formatCount,
  formatRate,
  formatTokens,
  topModels,
} from './lib'
import { analyticsKeys, readHub } from './queries'
import { AnalyticsQueryState } from './query-state'
import {
  ALL_MODELS,
  type AnalyticsRealm,
  type AnalyticsWindow,
  type HubByAccount,
} from './types'

const TOP_MODEL_COUNT = 3

type AnalyticsPerAccountProps = {
  realm: AnalyticsRealm
  window: AnalyticsWindow
  model: string
  names: Record<string, string>
}

/**
 * Who spent the tokens. The hub answers this call for its whole log, so the
 * table does not follow the window selector — the copy says so. A model filter
 * narrows which accounts are listed, because the endpoint has no per-model
 * token split.
 */
export function AnalyticsPerAccount(
  props: AnalyticsPerAccountProps
): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const query = useQuery({
    queryKey: analyticsKeys.byAccount(props.realm, props.window),
    queryFn: () =>
      readHub<HubByAccount>('usage.by-account', { realm: props.realm }),
  })
  const rows = [...(query.data?.accounts ?? [])]
    .filter(
      (row) =>
        props.model === ALL_MODELS ||
        row.models.some(([model]) => model === props.model)
    )
    .sort((left, right) => right.requests - left.requests)

  const columns: StaticDataTableColumn<WorkBuddyByAccount>[] = [
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
      id: 'requests',
      header: t('Requests'),
      className: 'text-right',
      cell: (row) => (
        <span className='tabular-nums'>
          {formatCount(row.requests, locale)}
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
          {formatRate(
            cacheHitShare(row.cached_tokens, row.prompt_tokens),
            locale
          )}
        </span>
      ),
    },
    {
      id: 'models',
      header: t('Top models'),
      cell: (row) => (
        <span className='flex flex-wrap gap-1'>
          {topModels(row.models, TOP_MODEL_COUNT).map(([model, count]) => (
            <span
              key={model}
              className='bg-muted/60 rounded-md px-1.5 py-0.5 font-mono text-xs tabular-nums'
            >
              {model} · {formatCount(count, locale)}
            </span>
          ))}
        </span>
      ),
    },
  ]

  return (
    <TitledCard
      title={t('Usage per account')}
      icon={<Users />}
      iconTone='chart-3'
      description={t(
        'Requests and tokens each account served. The hub answers this call for its whole log, so the table does not follow the time window.'
      )}
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
          getRowKey={(row) => row.account}
          tableClassName='min-w-[720px]'
          emptyContent={
            <span className='text-muted-foreground text-sm'>
              {t('No account has served a request yet')}
            </span>
          }
        />
        {props.model !== ALL_MODELS && (
          <p className='text-muted-foreground mt-3 text-xs'>
            {t(
              'Filtered to accounts that served this model; the request and token totals still cover every model that account used.'
            )}
          </p>
        )}
      </AnalyticsQueryState>
    </TitledCard>
  )
}
