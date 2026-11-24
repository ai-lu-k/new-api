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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatTimestamp } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

import { listRegistrationRewards } from './api'

export function RegistrationRewards() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const identity = useAuthStore(
    (state) => `${state.auth.user?.id}:${state.auth.session?.sid}`
  )
  const [page, setPage] = useState(1)
  const rewards = useQuery({
    queryKey: ['registration-rewards', identity, page],
    queryFn: ({ signal }) => listRegistrationRewards(page, signal),
  })
  return (
    <div className='space-y-4'>
      {rewards.isError ? (
        <ErrorState onRetry={() => void rewards.refetch()} />
      ) : null}
      {rewards.isPending ? <LoadingState /> : null}
      {rewards.data ? (
        <StaticDataTable
          data={rewards.data.items}
          getRowKey={(row) => row.user_id}
          emptyContent={
            <EmptyState title={t('No registration verification records')} />
          }
          columns={[
            {
              id: 'user',
              header: t('User ID'),
              cell: (row) => formatNumber(row.user_id, locale),
            },
            {
              id: 'reason',
              header: t('Verification reason'),
              cell: (row) => (
                <div>
                  {row.reason
                    .split(';')
                    .filter(Boolean)
                    .map((reason) => {
                      let text = reason
                      if (reason === 'ip_velocity') {
                        text = t('Repeated registrations from this IP')
                      }
                      if (reason === 'device_reuse') {
                        text = t('Repeated registrations from this browser')
                      }
                      if (reason === 'missing_device') {
                        text = t('Browser identifier missing')
                      }
                      if (reason === 'missing_ip') {
                        text = t('IP address unavailable')
                      }
                      return <div key={reason}>{text}</div>
                    })}
                </div>
              ),
            },
            {
              id: 'verified',
              header: t('Verified at'),
              cell: (row) => formatTimestamp(row.verified_at),
            },
            {
              id: 'issued',
              header: t('Issued at'),
              cell: (row) =>
                row.issued_at ? formatTimestamp(row.issued_at) : t('Pending'),
            },
          ]}
        />
      ) : null}
      <div className='flex justify-end gap-2'>
        <Button
          variant='outline'
          disabled={page === 1 || rewards.isFetching}
          onClick={() => setPage(page - 1)}
        >
          {t('Previous')}
        </Button>
        <Button
          variant='outline'
          disabled={
            !rewards.data ||
            page * 20 >= rewards.data.total ||
            rewards.isFetching
          }
          onClick={() => setPage(page + 1)}
        >
          {t('Next')}
        </Button>
      </div>
    </div>
  )
}
