import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { SectionPanel } from '@/components/section-panel'
import { StatusBadge } from '@/components/status-badge'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatTimestamp } from '@/lib/format'

import { getVoucherStatusDisplay } from '../lib/voucher-status'
import type { ReferralRewardRecord } from '../types'

interface RewardHistoryCardProps {
  rewards: ReferralRewardRecord[]
}

export function RewardHistoryCard(props: RewardHistoryCardProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  const voucherBadge = (status: string) => {
    const display = getVoucherStatusDisplay(status)
    return (
      <StatusBadge
        type='text'
        label={t(display.labelKey)}
        variant={display.variant}
        copyable={false}
        className='text-sm font-normal'
      />
    )
  }

  const statusCell = (row: ReferralRewardRecord) => {
    if (row.status === 'issued') {
      return (
        <StatusBadge
          type='text'
          label={t('Issued')}
          variant='neutral'
          copyable={false}
          className='text-foreground text-sm font-normal'
        />
      )
    }
    if (row.pending_reason === 'reward_verification_required') {
      return (
        <StatusBadge
          type='text'
          label={t('Waiting for reward verification')}
          variant='warning'
          copyable={false}
          className='text-sm font-normal'
        />
      )
    }
    if (row.pending_reason === 'email_unverified') {
      return (
        <StatusBadge
          type='text'
          label={t('Waiting for email verification')}
          variant='warning'
          copyable={false}
          className='text-sm font-normal'
        />
      )
    }
    return (
      <StatusBadge
        type='text'
        label={t('Pending')}
        variant='warning'
        copyable={false}
        className='text-sm font-normal'
      />
    )
  }

  return (
    <SectionPanel
      title={t('Reward records')}
      status={props.rewards.length === 0 ? 'empty' : 'ready'}
      emptyMessage={t('No referral rewards yet')}
      emptyAction={
        <p className='text-muted-foreground text-[13px]'>
          {t(
            'Share your invite link. Once a friend signs up and verifies the email, both of you receive a voucher.'
          )}
        </p>
      }
      contentClassName='pt-1'
    >
      <StaticDataTable
        data={props.rewards}
        getRowKey={(row) => row.id}
        columns={[
          {
            id: 'invitee',
            header: t('Invitee'),
            cell: (row) => row.invitee,
          },
          {
            id: 'status',
            header: t('Status'),
            cell: statusCell,
          },
          {
            id: 'voucher',
            header: t('Your voucher'),
            cell: (row) =>
              row.inviter_reward_yuan > 0 ? (
                <span className='tabular-nums'>
                  ¥{formatNumber(row.inviter_reward_yuan, locale)}
                </span>
              ) : (
                '-'
              ),
          },
          {
            id: 'voucher-status',
            header: t('Voucher status'),
            cell: (row) => voucherBadge(row.voucher_status),
          },
          {
            id: 'expiry',
            header: t('Valid until'),
            cell: (row) => formatTimestamp(row.voucher_expires_at),
          },
          {
            id: 'created',
            header: t('Invited at'),
            cell: (row) => formatTimestamp(row.created_at),
          },
        ]}
      />
    </SectionPanel>
  )
}
