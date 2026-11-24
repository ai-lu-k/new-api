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
import { Sigma } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { TitledCard } from '@/components/ui/titled-card'
import { toIntlLocale } from '@/i18n/languages'

import {
  cacheHitShare,
  formatCount,
  formatCny,
  formatRate,
  formatTokens,
  unpricedRequests,
} from './lib'
import { analyticsKeys, readHub, type AnalyticsWindowParams } from './queries'
import { AnalyticsQueryState } from './query-state'
import { ALL_MODELS, type HubUsage } from './types'

type AnalyticsHeadlineProps = {
  model: string
  params: AnalyticsWindowParams
}

type Tile = { key: string; label: string; value: string; note?: string }

/**
 * The window's totals. When a model is selected the hub's per-model block
 * supplies the token, credit and cost figures, but it carries no error count —
 * that cell says so instead of showing a misleading zero.
 */
export function AnalyticsHeadline(
  props: AnalyticsHeadlineProps
): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const query = useQuery({
    queryKey: analyticsKeys.usage(props.params),
    queryFn: () => readHub<HubUsage>('usage', props.params),
  })
  const usage = query.data
  const scoped =
    props.model === ALL_MODELS ? undefined : usage?.by_model[props.model]
  const totals = scoped ?? usage
  // The hub counts `requests` as the ones that succeeded and keeps failures in
  // `errors`, so the share of failed attempts needs both. It reports errors for
  // the window as a whole but not per model, hence the gap when a model is
  // selected.
  const attempts = usage ? usage.requests + usage.errors : 0
  const errorRate =
    !scoped && usage && attempts > 0 ? (usage.errors / attempts) * 100 : null
  const hitShare = cacheHitShare(totals?.cached_tokens, totals?.prompt_tokens)
  const unpriced = unpricedRequests(usage?.cost_missing)
  const scopedOut = props.model !== ALL_MODELS && scoped === undefined

  const tiles: Tile[] = [
    {
      key: 'requests',
      label: t('Successful requests'),
      value: formatCount(totals?.requests, locale),
      note: scoped
        ? undefined
        : t('{{count}} attempts in total', {
            count: formatCount(attempts, locale),
          }),
    },
    {
      key: 'errors',
      label: t('Errors'),
      value: scoped ? '-' : formatCount(usage?.errors, locale),
      note: scoped
        ? t('Not broken down per model')
        : t('{{rate}} of attempts failed', {
            rate: formatRate(errorRate, locale),
          }),
    },
    {
      key: 'total',
      label: t('Total tokens'),
      value: formatTokens(totals?.total_tokens, locale),
      note: formatCount(totals?.total_tokens, locale),
    },
    {
      key: 'prompt',
      label: t('Prompt tokens'),
      value: formatTokens(totals?.prompt_tokens, locale),
      note: formatCount(totals?.prompt_tokens, locale),
    },
    {
      key: 'completion',
      label: t('Completion tokens'),
      value: formatTokens(totals?.completion_tokens, locale),
      note: formatCount(totals?.completion_tokens, locale),
    },
    {
      key: 'reasoning',
      label: t('Reasoning tokens'),
      value: formatTokens(totals?.reasoning_tokens, locale),
      note: formatCount(totals?.reasoning_tokens, locale),
    },
    {
      key: 'cached',
      label: t('Cached tokens'),
      value: formatTokens(totals?.cached_tokens, locale),
      note: formatCount(totals?.cached_tokens, locale),
    },
    {
      key: 'cache-hit',
      label: t('Cache hit ratio'),
      value: formatRate(hitShare, locale),
      note: t('Cached tokens over prompt tokens'),
    },
    {
      key: 'credit',
      label: t('Credit consumed'),
      value: formatCount(totals?.credit, locale),
    },
    {
      key: 'cost',
      label: t('Estimated cost'),
      value: formatCny(totals?.cost_cny, locale),
      note: t('{{rate}} CNY per USD', {
        rate: formatCount(usage?.usd_cny, locale),
      }),
    },
  ]

  const description = t(
    'Requests the gateway served in the selected window. Credit and the CNY figure are the gateway’s own estimates from its price table, not this site’s billing.'
  )

  return (
    <TitledCard
      title={t('Usage totals')}
      icon={<Sigma />}
      iconTone='primary'
      description={description}
    >
      <AnalyticsQueryState
        isPending={query.isPending}
        isError={query.isError}
        errorMessage={query.error?.message}
        onRetry={() => void query.refetch()}
      >
        {scopedOut && (
          <p className='text-muted-foreground text-sm'>
            {t('No request for this model in the window')}
          </p>
        )}
        {!scopedOut && (
          <>
            <dl className='grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5'>
              {tiles.map((tile) => (
                <div key={tile.key} className='min-w-0'>
                  <dt className='text-muted-foreground truncate text-xs'>
                    {tile.label}
                  </dt>
                  <dd className='mt-1 text-lg font-semibold tabular-nums'>
                    {tile.value}
                  </dd>
                  {tile.note != null && (
                    <dd className='text-muted-foreground truncate text-xs tabular-nums'>
                      {tile.note}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
            {unpriced > 0 && !scoped && (
              <p className='text-muted-foreground mt-4 text-xs'>
                {t(
                  '{{count}} requests used a model the gateway has no price for, so they add nothing to the cost estimate.',
                  { count: formatCount(unpriced, locale) }
                )}
              </p>
            )}
          </>
        )}
      </AnalyticsQueryState>
    </TitledCard>
  )
}
