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

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import {
  DetailRow,
  DetailSection,
} from '@/features/usage-logs/components/dialogs/log-detail-layout'
import { toIntlLocale } from '@/i18n/languages'
import { formatOriginalCurrencyAmount } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { getServerErrorMessage } from '@/lib/server-error-message'

import { getRequestObservation } from '../api'
import { ObservationAttemptsTable } from './attempts-table'

export function RequestObservationDetails(props: {
  requestId: string
  enabled: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const query = useQuery({
    queryKey: ['relay-observation', props.requestId],
    queryFn: () => getRequestObservation(props.requestId),
    enabled: props.enabled && !!props.requestId,
    retry: false,
    staleTime: 30000,
    meta: { errorToast: false },
  })
  if (!props.enabled || !props.requestId) return null
  if (query.isPending) {
    return <LoadingState size='sm' message={t('Loading...')} inline />
  }
  if (query.isError) {
    return (
      <ErrorState
        compact
        description={getServerErrorMessage(query.error)}
        onRetry={() => void query.refetch()}
      />
    )
  }
  if (!query.data) {
    return (
      <EmptyState
        title={t('No request chain recorded')}
        className='min-h-0 p-3'
      />
    )
  }
  const request = query.data
  return (
    <DetailSection label={t('Request chain')}>
      {request.truncated && (
        <p role='status' className='text-amber-600'>
          {t('Observation data is incomplete')}
        </p>
      )}
      <DetailRow
        label={t('Duration')}
        value={`${formatNumber(request.duration_ms, locale)} ms`}
      />
      <DetailRow
        label={t('First reasoning')}
        value={
          request.first_reasoning_ms == null
            ? t('Unknown')
            : `${formatNumber(request.first_reasoning_ms, locale)} ms`
        }
      />
      <DetailRow
        label={t('First answer')}
        value={
          request.first_content_ms == null
            ? t('Unknown')
            : `${formatNumber(request.first_content_ms, locale)} ms`
        }
      />
      <DetailRow
        label={t('Unknown cost attempts')}
        value={formatNumber(request.unknown_cost_attempts, locale)}
      />
      {(request.procurement_costs ?? []).map((cost) => (
        <DetailRow
          key={cost.currency}
          label={cost.currency}
          value={`${t('Reported')}: ${formatOriginalCurrencyAmount(cost.reported, cost.currency)} · ${t('Estimated')}: ${formatOriginalCurrencyAmount(cost.estimated, cost.currency)}`}
        />
      ))}
      <ObservationAttemptsTable attempts={request.attempts} />
    </DetailSection>
  )
}
