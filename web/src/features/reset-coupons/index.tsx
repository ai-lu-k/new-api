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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { PlanTrendUser } from '@/features/token-plan-statistics'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

import { listVoucherBatches } from './api'
import { CouponGrantForm } from './grant-form'
import { ReferralRewards } from './referrals'
import { RegistrationRewards } from './registration-rewards'

export function ResetCouponsPanel(props: {
  recipient: PlanTrendUser | null
  onClearRecipient: () => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState('batches')

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
      <TabsList>
        <TabsTrigger value='batches'>{t('Voucher batches')}</TabsTrigger>
        <TabsTrigger value='referrals'>{t('Referral rewards')}</TabsTrigger>
        <TabsTrigger value='registration'>
          {t('Registration verification')}
        </TabsTrigger>
      </TabsList>
      <TabsContent value='batches'>
        <VoucherBatches
          recipient={props.recipient}
          onClearRecipient={props.onClearRecipient}
        />
      </TabsContent>
      <TabsContent value='referrals'>
        <ReferralRewards />
      </TabsContent>
      <TabsContent value='registration'>
        <RegistrationRewards />
      </TabsContent>
    </Tabs>
  )
}

function VoucherBatches(props: {
  recipient: PlanTrendUser | null
  onClearRecipient: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const identity = useAuthStore(
    (state) => `${state.auth.user?.id}:${state.auth.session?.sid}`
  )
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  // A grant commits its batch and every voucher together, so there is nothing
  // to resume or void: the list only reports what was handed out.
  const batches = useQuery({
    queryKey: ['voucher-batches', identity, page],
    queryFn: ({ signal }) => listVoucherBatches(page, signal),
  })
  const refresh = () =>
    void client.invalidateQueries({ queryKey: ['voucher-batches'] })
  return (
    <div className='space-y-6'>
      <CouponGrantForm
        onCreated={refresh}
        recipient={props.recipient}
        onClearRecipient={props.onClearRecipient}
      />
      {batches.isError && <ErrorState onRetry={() => void batches.refetch()} />}
      <StaticDataTable
        data={batches.data?.items ?? []}
        getRowKey={(row) => row.id}
        columns={[
          { id: 'id', header: t('Batch'), cell: (row) => `#${row.id}` },
          {
            id: 'faceValue',
            header: t('Face value'),
            // The frozen face value is what a recipient is actually credited,
            // so it is the amount worth reporting, not the yuan it was priced in.
            cell: (row) => formatQuotaWithCurrency(row.face_value, { locale }),
          },
          {
            id: 'recipients',
            header: t('Recipients'),
            cell: (row) => formatNumber(row.recipient_count, locale),
          },
          {
            id: 'validity',
            header: t('Validity (days)'),
            cell: (row) => formatNumber(row.validity_days, locale),
          },
          {
            id: 'expiry',
            header: t('Expires at'),
            cell: (row) =>
              new Date(row.expires_at * 1000).toLocaleString(locale),
          },
          { id: 'reason', header: t('Reason'), cell: (row) => row.reason },
        ]}
      />
      <div className='flex justify-end gap-2'>
        <Button
          variant='outline'
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          {t('Previous')}
        </Button>
        <Button
          variant='outline'
          disabled={page * 20 >= (batches.data?.total ?? 0)}
          onClick={() => setPage(page + 1)}
        >
          {t('Next')}
        </Button>
      </div>
    </div>
  )
}
