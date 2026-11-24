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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { WorkBuddyCatTravel, WorkBuddyGrowthSummary } from './types'
import { useCatTravel, useStreakBonus } from './use-task-mutations'

/** How the cat's trip reads, from the summary the hub sends back. */
function travelStateKey(travel: WorkBuddyCatTravel | undefined): string {
  if (!travel) return 'Unknown'
  if (travel.state === 'arrived') return 'Reward waiting'
  if (travel.state === 'traveling') return 'Travelling'
  if (travel.daily_limit_reached) return 'Done for today'
  if (travel.state === 'idle') return 'At home'
  return 'Unknown'
}

/** Tier statuses are upstream words; only the two known ones are translated. */
function tierStatusKey(status: string | undefined): string {
  if (status === 'claimed') return 'Claimed'
  if (status === 'locked') return 'Locked'
  return 'Unknown'
}

/**
 * The welfare side of the tab: what the selected account has accumulated, and
 * the two maintenance actions the hub can only run on the operator's explicit
 * request. Both write to live accounts, so both ask first.
 */
export function WelfarePanel(props: {
  uid: string
  targetName: string
  summary: WorkBuddyGrowthSummary
}): React.JSX.Element {
  const { t } = useTranslation()
  const [streakOpen, setStreakOpen] = useState(false)
  const [travelOpen, setTravelOpen] = useState(false)
  const streak = useStreakBonus()
  const travel = useCatTravel()
  const summary = props.summary
  const target: { uid?: string } = props.uid === 'all' ? {} : { uid: props.uid }
  const tiers = summary.tiers ?? []
  const statuses = summary.tier_statuses ?? {}

  const tiles = [
    {
      label: t('Streak days'),
      value: String(summary.streak_days ?? 0),
    },
    { label: t('Energy balance'), value: String(summary.energy ?? 0) },
    { label: t('Makeup cards'), value: String(summary.makeup_cards ?? 0) },
    {
      label: t('Lottery chances'),
      value: String(summary.lottery_chances ?? 0),
    },
  ]

  const confirmStreak = (): void => {
    streak.mutate(target)
    setStreakOpen(false)
  }
  const confirmTravel = (): void => {
    travel.mutate(target)
    setTravelOpen(false)
  }

  return (
    <section
      aria-label={t('Welfare')}
      className='bg-card overflow-hidden rounded-xl border'
    >
      <header className='flex flex-wrap items-start justify-between gap-3 px-5 py-4'>
        <div>
          <h2 className='text-base font-semibold'>{t('Welfare')}</h2>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t(
              'Streak, energy, makeup cards and the cat trip for the selected account. The two actions below run on live accounts and ask before they start.'
            )}
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            size='sm'
            variant='outline'
            onClick={() => setStreakOpen(true)}
            disabled={streak.isPending}
          >
            {t('Redeem streak bonus and lottery')}
          </Button>
          <Button
            size='sm'
            variant='outline'
            onClick={() => setTravelOpen(true)}
            disabled={travel.isPending}
          >
            {t('Settle cat travel')}
          </Button>
        </div>
      </header>

      <dl className='grid grid-cols-2 border-t sm:grid-cols-3 lg:grid-cols-5'>
        {tiles.map((tile) => (
          <div key={tile.label} className='border-b px-5 py-3 lg:border-b-0'>
            <dt className='text-muted-foreground text-xs'>{tile.label}</dt>
            <dd className='mt-1 text-lg font-semibold'>{tile.value}</dd>
          </div>
        ))}
        <div className='border-b px-5 py-3 lg:border-b-0'>
          <dt className='text-muted-foreground text-xs'>{t('Cat travel')}</dt>
          <dd className='mt-1 flex items-center gap-2'>
            <Badge variant='secondary'>
              {t(travelStateKey(summary.travel))}
            </Badge>
            {summary.travel?.location?.name && (
              <span className='text-muted-foreground text-xs'>
                {summary.travel.location.name}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {tiers.length > 0 && (
        <p className='text-muted-foreground border-t px-5 py-3 text-xs'>
          {t('Streak tiers')}:{' '}
          {tiers
            .map(
              (tier) => `${tier.days}d ${t(tierStatusKey(statuses[tier.tier]))}`
            )
            .join(' · ')}
        </p>
      )}

      <ConfirmDialog
        open={streakOpen}
        onOpenChange={setStreakOpen}
        title={t('Redeem streak bonus and lottery')}
        desc={t(
          'For {{target}}: uses a makeup card if yesterday was missed, claims the starter gift and event compensation, redeems every ready streak tier, then spends the lottery chances. This writes to live accounts.',
          { target: props.targetName }
        )}
        confirmText={t('Redeem now')}
        isLoading={streak.isPending}
        handleConfirm={confirmStreak}
      />
      <ConfirmDialog
        open={travelOpen}
        onOpenChange={setTravelOpen}
        title={t('Settle cat travel')}
        desc={t(
          'For {{target}}: collects the reward when the cat has already arrived, otherwise sends it travelling to a new place. Enterprise accounts are skipped by the hub.',
          { target: props.targetName }
        )}
        confirmText={t('Settle now')}
        isLoading={travel.isPending}
        handleConfirm={confirmTravel}
      />
    </section>
  )
}
