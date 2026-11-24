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
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { StaticDataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { getVoucherStatusDisplay } from '@/features/referral/lib/voucher-status'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatTimestampToDate } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import {
  listReferralRewards,
  reissueReferralReward,
  type ReferralRewardStatusFilter,
} from './api'

const PAGE_SIZE = 20

function VoucherCell(props: { status: string; expiresAt: number }) {
  const { t } = useTranslation()

  if (!props.status) {
    return <span className='text-muted-foreground'>—</span>
  }

  const display = getVoucherStatusDisplay(props.status)

  return (
    <div className='space-y-1'>
      <StatusBadge
        label={t(display.labelKey)}
        variant={display.variant}
        copyable={false}
      />
      {props.expiresAt > 0 && (
        <div className='text-muted-foreground text-xs'>
          {formatTimestampToDate(props.expiresAt, 'seconds')}
        </div>
      )}
    </div>
  )
}

export function ReferralRewards() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const identity = useAuthStore(
    (state) => `${state.auth.user?.id}:${state.auth.session?.sid}`
  )
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<ReferralRewardStatusFilter>('')
  const [reissueId, setReissueId] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const rewards = useQuery({
    queryKey: ['referral-rewards', identity, page, status],
    queryFn: ({ signal }) =>
      listReferralRewards(page, PAGE_SIZE, status, signal),
  })
  const reissue = async () => {
    if (reissueId === null || busy.current) return
    busy.current = true
    setPending(true)
    try {
      await reissueReferralReward(reissueId)
      setReissueId(null)
      void client.invalidateQueries({ queryKey: ['referral-rewards'] })
      toast.success(t('Referral reward reissued'))
    } catch (error) {
      handleServerError(error)
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  return (
    <div className='space-y-6'>
      <div className='flex items-center gap-2'>
        <Label htmlFor='referral-status'>{t('Status')}</Label>
        <NativeSelect
          id='referral-status'
          value={status}
          disabled={pending}
          onChange={(event) => {
            setStatus(event.target.value as ReferralRewardStatusFilter)
            setPage(1)
          }}
        >
          <NativeSelectOption value=''>{t('All')}</NativeSelectOption>
          <NativeSelectOption value='pending'>
            {t('Pending')}
          </NativeSelectOption>
          <NativeSelectOption value='issued'>{t('Issued')}</NativeSelectOption>
          <NativeSelectOption value='abnormal'>
            {t('Abnormal')}
          </NativeSelectOption>
        </NativeSelect>
      </div>
      {rewards.isError && <ErrorState onRetry={() => void rewards.refetch()} />}
      {!rewards.isError && rewards.isPending && <LoadingState />}
      {!rewards.isError && !rewards.isPending && (
        <StaticDataTable
          data={rewards.data?.items ?? []}
          getRowKey={(row) => row.id}
          emptyContent={<EmptyState title={t('No referral rewards')} />}
          columns={[
            { id: 'reward', header: t('Reward'), cell: (row) => `#${row.id}` },
            {
              id: 'inviter',
              header: t('Inviter'),
              cell: (row) => (
                <div className='min-w-0'>
                  <div className='truncate'>{row.inviter || '—'}</div>
                  <div className='text-muted-foreground text-xs'>
                    #{formatNumber(row.inviter_id, locale)}
                  </div>
                </div>
              ),
            },
            {
              id: 'invitee',
              header: t('Invitee'),
              cell: (row) => (
                <div className='min-w-0'>
                  <div className='truncate'>{row.invitee || '—'}</div>
                  <div className='text-muted-foreground text-xs'>
                    #{formatNumber(row.invitee_id, locale)}
                  </div>
                </div>
              ),
            },
            {
              id: 'status',
              header: t('Status'),
              cell: (row) => (
                <div className='space-y-1'>
                  <StatusBadge
                    label={row.status === 'issued' ? t('Issued') : t('Pending')}
                    variant={row.status === 'issued' ? 'success' : 'warning'}
                    copyable={false}
                  />
                  {row.pending_reason === 'reward_verification_required' && (
                    <p className='text-warning text-xs'>
                      {t('Waiting for reward verification')}
                    </p>
                  )}
                  {row.pending_reason === 'email_unverified' && (
                    <p className='text-warning text-xs'>
                      {t(
                        'The invitee email is not verified, so this reward cannot be reissued.'
                      )}
                    </p>
                  )}
                  {row.note === 'inviter_disabled' && (
                    <p className='text-muted-foreground text-xs'>
                      {t(
                        'The inviter is disabled, so only the invitee voucher was issued.'
                      )}
                    </p>
                  )}
                </div>
              ),
            },
            {
              id: 'ladder',
              header: t('Ladder step'),
              cell: (row) =>
                row.inviter_ordinal > 0
                  ? formatNumber(row.inviter_ordinal, locale)
                  : '—',
            },
            {
              id: 'inviter_reward',
              header: t('Inviter reward'),
              cell: (row) =>
                row.inviter_reward_yuan > 0 ? (
                  <span className='tabular-nums'>
                    ¥{formatNumber(row.inviter_reward_yuan, locale)}
                  </span>
                ) : (
                  '—'
                ),
            },
            {
              id: 'invitee_reward',
              header: t('Invitee reward'),
              cell: (row) => (
                <span className='tabular-nums'>
                  ¥{formatNumber(row.invitee_reward_yuan, locale)}
                </span>
              ),
            },
            {
              id: 'inviter_voucher',
              header: t('Inviter voucher'),
              cell: (row) => (
                <VoucherCell
                  status={row.inviter_voucher_status}
                  expiresAt={row.inviter_voucher_expires_at}
                />
              ),
            },
            {
              id: 'invitee_voucher',
              header: t('Invitee voucher'),
              cell: (row) => (
                <VoucherCell
                  status={row.invitee_voucher_status}
                  expiresAt={row.invitee_voucher_expires_at}
                />
              ),
            },
            {
              id: 'actions',
              header: t('Actions'),
              cell: (row) =>
                row.status !== 'issued' ? (
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={
                      pending ||
                      row.pending_reason === 'email_unverified' ||
                      row.pending_reason === 'reward_verification_required'
                    }
                    onClick={() => setReissueId(row.id)}
                  >
                    {t('Reissue')}
                  </Button>
                ) : null,
            },
          ]}
        />
      )}
      <div className='flex justify-end gap-2'>
        <Button
          variant='outline'
          disabled={pending || page === 1}
          onClick={() => setPage(page - 1)}
        >
          {t('Previous')}
        </Button>
        <Button
          variant='outline'
          disabled={pending || page * PAGE_SIZE >= (rewards.data?.total ?? 0)}
          onClick={() => setPage(page + 1)}
        >
          {t('Next')}
        </Button>
      </div>
      <ConfirmDialog
        open={reissueId !== null}
        onOpenChange={(open) => {
          if (!open) setReissueId(null)
        }}
        title={t('Reissue referral reward')}
        desc={t(
          'Only the missing voucher is issued. Existing vouchers are not re-created or extended.'
        )}
        isLoading={pending}
        handleConfirm={() => void reissue()}
      />
    </div>
  )
}
