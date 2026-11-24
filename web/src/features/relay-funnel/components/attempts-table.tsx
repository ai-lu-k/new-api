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
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { toIntlLocale } from '@/i18n/languages'
import { formatOriginalCurrencyAmount } from '@/lib/currency'
import { formatNumber } from '@/lib/format'

import type { ObservationAttempt } from '../types'

export function ObservationAttemptsTable(props: {
  attempts: ObservationAttempt[]
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const outcomes: Record<string, string> = {
    success: t('Completed'),
    error: t('Error'),
    timeout: t('Timeout'),
    client_cancelled: t('Cancelled'),
    incomplete: t('Incomplete'),
  }
  return (
    <StaticDataTable
      data={props.attempts}
      getRowKey={(attempt) => attempt.number}
      columns={[
        {
          id: 'channel',
          header: t('Channel'),
          cell: (a) =>
            `#${formatNumber(a.channel_id, locale)} · ${a.upstream_model}`,
        },
        {
          id: 'outcome',
          header: t('Status'),
          cell: (a) => outcomes[a.outcome] ?? t('Unknown'),
        },
        {
          id: 'duration',
          header: t('Duration'),
          cell: (a) => `${formatNumber(a.duration_ms, locale)} ms`,
        },
        {
          id: 'reasoning',
          header: t('First reasoning'),
          cell: (a) =>
            a.first_reasoning_ms == null
              ? t('Unknown')
              : `${formatNumber(a.first_reasoning_ms, locale)} ms`,
        },
        {
          id: 'first',
          header: t('First answer'),
          cell: (a) =>
            a.first_content_ms == null
              ? t('Unknown')
              : `${formatNumber(a.first_content_ms, locale)} ms`,
        },
        {
          id: 'tps',
          header: t('Output TPS'),
          cell: (a) => formatNumber(a.output_tps, locale),
        },
        {
          id: 'cache',
          header: t('Cache read tokens'),
          cell: (a) =>
            a.usage?.cache_read_tokens == null
              ? t('Unknown')
              : formatNumber(a.usage.cache_read_tokens, locale),
        },
        {
          id: 'cost',
          header: t('Procurement cost'),
          cell: (a) =>
            a.cost.amount == null
              ? t('Unknown')
              : `${formatOriginalCurrencyAmount(a.cost.amount, a.cost.currency)} · ${a.cost.status === 'reported' ? t('Reported') : t('Estimated')}`,
        },
      ]}
      emptyContent={t('No Data')}
    />
  )
}
