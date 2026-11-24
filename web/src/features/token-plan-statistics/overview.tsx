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
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { SectionHeading } from '@/components/section-heading'
import { StatRow, type StatRowItem } from '@/components/stat-row'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatNumber } from '@/lib/format'

import { getPlanStatistics, type PlanOverview } from './api'

export function PlanUsageOverview(props: { identity: string }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const query = useQuery({
    queryKey: ['token-plan-statistics', props.identity, 'overview'],
    queryFn: ({ signal }) =>
      getPlanStatistics<PlanOverview>('overview', {}, signal),
  })
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />
  const data = query.data
  const quota = (value?: number) => formatQuotaWithCurrency(value, { locale })
  const count = (value?: number) =>
    value === undefined ? '—' : formatNumber(value, locale)
  // Each figure keeps the sentence that says what it counts under the label,
  // so the four columns stay one row instead of four tall cards.
  const item = (
    key: string,
    label: string,
    detail: string,
    value: string
  ): StatRowItem => ({
    key,
    label: (
      <span className='flex flex-col gap-0.5'>
        <span>{label}</span>
        <span className='text-muted-foreground text-[11px] font-normal'>
          {detail}
        </span>
      </span>
    ),
    value,
    valueText: value,
    loading: query.isPending,
  })
  return (
    <section aria-label={t('Current cycle overview')} className='space-y-3'>
      <SectionHeading as='h2' title={t('Current cycle overview')} />
      <p className='text-muted-foreground text-sm'>
        {t(
          'Snapshots include all non-deleted users, including disabled users. Each user has their own current cycle. Pending reservations are shown separately and are not counted as used quota.'
        )}
      </p>
      <StatRow
        columns={4}
        size='analytics'
        // Every cell stretches to the tallest caption in its row, so pinning the
        // figure to the bottom keeps the four values on one baseline even when
        // one caption wraps to three lines in the two-column phone layout.
        itemClassName='flex flex-col justify-between'
        items={[
          item(
            'activated',
            t('Activated plans'),
            t('{{count}} users in total', {
              count: count(data?.users),
            }),
            count(data?.activated_users)
          ),
          item(
            'quota',
            t('Current cycle quota'),
            t('Remaining: {{amount}}', {
              amount: quota(data?.remaining_quota),
            }),
            quota(data?.total_quota)
          ),
          item(
            'free',
            t('Free plan usage'),
            t('Balance continuation: {{amount}}', {
              amount: quota(data?.wallet_used_quota),
            }),
            quota(data?.used_quota)
          ),
          item(
            'reserved',
            t('Pending reservations'),
            t('Free quota reserved, not settled usage'),
            quota(data?.reserved_quota)
          ),
        ]}
      />
      {data && data.as_of > 0 && (
        <p className='text-muted-foreground text-xs tabular-nums'>
          {t('Updated at')}:{' '}
          {new Date(data.as_of * 1000).toLocaleString(locale, {
            timeZone: 'Asia/Shanghai',
          })}{' '}
          · Asia/Shanghai
        </p>
      )}
    </section>
  )
}
