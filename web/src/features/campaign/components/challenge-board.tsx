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
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { TIER_CLASS, TIER_LABEL } from '../constants'
import { formatYuan } from '../lib/format-event'
import type { CampaignChallenge, CampaignStatus } from '../types'

export function ChallengeBoard(props: {
  challenges: CampaignChallenge[]
  state: CampaignStatus['state']
  onSelect: (challenge: CampaignChallenge) => void
}) {
  const { t } = useTranslation()
  const locked = props.state !== 'active'

  return (
    <section aria-labelledby='campaign-board-heading' className='min-w-0'>
      <div className='mb-3 flex items-end justify-between gap-4'>
        <h2
          id='campaign-board-heading'
          className='font-mono text-lg tracking-wide text-[var(--campaign-fg)]'
        >
          {t('Challenge board')}
        </h2>
        <p className='font-mono text-xs text-[var(--campaign-fg-faint)]'>
          {t('Challenge order')}
        </p>
      </div>
      <ul className='grid gap-3 sm:grid-cols-2'>
        {props.challenges.map((challenge, index) => (
          <li key={challenge.id}>
            <ChallengeTile
              challenge={challenge}
              number={index + 1}
              locked={locked}
              onSelect={props.onSelect}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function ChallengeTile(props: {
  challenge: CampaignChallenge
  number: number
  locked: boolean
  onSelect: (challenge: CampaignChallenge) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const challenge = props.challenge
  return (
    <button
      type='button'
      className='campaign-tile focus-visible:ring-2 focus-visible:ring-emerald-300/60 focus-visible:outline-none'
      data-solved={challenge.solved}
      data-locked={props.locked}
      disabled={props.locked}
      aria-label={t('{{title}}, {{points}} points', {
        title: challenge.title,
        points: challenge.points,
      })}
      onClick={() => props.onSelect(challenge)}
    >
      <span className='flex items-center justify-between gap-2'>
        <span className='flex items-center gap-2'>
          <span className='font-mono text-xs text-[var(--campaign-fg-accent)]'>
            #{formatNumber(props.number, locale)}
          </span>
          <span
            className={cn(
              'rounded border px-1.5 py-0.5 text-[0.65rem] font-medium',
              TIER_CLASS[challenge.tier]
            )}
          >
            {t(TIER_LABEL[challenge.tier])}
          </span>
        </span>
        <span className='font-mono text-sm font-semibold text-[var(--campaign-fg)]'>
          {challenge.points} pts
        </span>
      </span>
      <span className='text-base font-medium text-[var(--campaign-fg-strong)]'>
        {challenge.solved ? (
          <>
            <Check
              className='me-1 inline size-4 text-[var(--campaign-fg-accent)]'
              aria-hidden='true'
            />
            {challenge.title}
          </>
        ) : (
          challenge.title
        )}
      </span>
      <span className='mt-auto flex items-center justify-between gap-2 text-xs text-[var(--campaign-fg-faint)]'>
        <span>
          {challenge.solved
            ? t('{{count}} solved', {
                count: formatNumber(challenge.solved_count, locale),
              })
            : t('{{count}} answers', {
                count: formatNumber(challenge.solved_count, locale),
              })}
        </span>
        <span className='font-mono text-[var(--campaign-fg-accent)]'>
          {challenge.bonus
            ? t('Bonus · score only')
            : formatYuan(challenge.reward_yuan, locale)}
        </span>
      </span>
    </button>
  )
}
