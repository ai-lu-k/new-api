import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { StatRow, type StatRowItem } from '@/components/stat-row'
import { Skeleton } from '@/components/ui/skeleton'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { getReferralOverview } from './api'
import { InviteCodeCard } from './components/invite-code-card'
import { RewardHistoryCard } from './components/reward-history-card'
import { RewardLadderCard } from './components/reward-ladder-card'
import { RewardVerification } from './components/reward-verification'

export function Referral() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const overview = useQuery({
    queryKey: ['referral-overview'],
    queryFn: getReferralOverview,
  })
  const data = overview.data
  const loading = overview.isPending

  const stats: StatRowItem[] = [
    {
      key: 'rewarded',
      label: t('Rewarded invites'),
      value: formatNumber(data?.rewarded ?? 0, locale),
      valueText: formatNumber(data?.rewarded ?? 0, locale),
      loading,
    },
    {
      key: 'pending',
      label: t('Waiting for verification'),
      value: formatNumber(data?.pending ?? 0, locale),
      valueText: formatNumber(data?.pending ?? 0, locale),
      loading,
    },
    {
      key: 'vouchers',
      label: t('Voucher'),
      value: formatNumber(data?.available_vouchers ?? 0, locale),
      valueText: formatNumber(data?.available_vouchers ?? 0, locale),
      loading,
    },
  ]

  return (
    <SectionPageLayout pageIndex={<>{t('Personal workspace')} / 07</>}>
      <SectionPageLayout.Title>{t('Referral Program')}</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        {t(
          'Invite friends and earn vouchers together: ¥1 / ¥3 / ¥5 for the first three friends, then ¥1 each, and your friend gets ¥3'
        )}
      </SectionPageLayout.Description>
      <SectionPageLayout.Content>
        <div className='flex w-full flex-col gap-4 sm:gap-5'>
          <StatRow
            columns={3}
            size='analytics'
            items={stats}
            className='pb-1'
          />
          <RewardVerification />
          {overview.isError ? (
            <ErrorState onRetry={() => void overview.refetch()} />
          ) : null}
          {loading ? <Skeleton className='h-64 w-full' /> : null}
          {data ? (
            <>
              <InviteCodeCard
                affCode={data.aff_code}
                invites={data.invites}
                pending={data.pending}
              />
              <RewardLadderCard
                ladder={data.ladder}
                inviteeRewardYuan={data.invitee_reward_yuan}
                nextRewardYuan={data.next_reward_yuan}
              />
              <RewardHistoryCard rewards={data.rewards} />
            </>
          ) : null}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
