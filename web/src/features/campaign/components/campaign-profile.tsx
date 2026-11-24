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
import { Link } from '@tanstack/react-router'
import { Download, Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { EVENT_PATH } from '../constants'
import { formatYuan } from '../lib/format-event'
import type { CampaignStatus } from '../types'

export function CampaignProfile(props: {
  status: CampaignStatus
  sharing: boolean
  onShare: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const status = props.status
  const me = status.me
  const total = status.challenges.length
  const percent = total === 0 ? 0 : Math.round((me.solved_count / total) * 100)

  return (
    <section className='rounded-xl border border-[var(--campaign-line)] bg-[var(--campaign-surface)] p-5 text-[var(--campaign-fg-strong)]'>
      <div className='flex items-center justify-between gap-2'>
        <h2 className='font-mono text-sm tracking-widest text-[var(--campaign-fg-accent)] uppercase'>
          {t('My run')}
        </h2>
        {me.final_rank > 0 ? (
          <Badge className='border-amber-600/50 bg-amber-500/10 text-amber-900 dark:border-amber-300/50 dark:bg-amber-300/10 dark:text-amber-100'>
            <Trophy className='size-3' aria-hidden='true' />#{me.final_rank}
          </Badge>
        ) : null}
      </div>

      <div className='mt-3 flex items-end gap-2'>
        <span className='font-mono text-4xl font-bold text-[var(--campaign-fg)] tabular-nums'>
          {formatNumber(me.points, locale)}
        </span>
        <span className='pb-1 font-mono text-xs text-[var(--campaign-fg-muted)]'>
          {t('points')}
        </span>
        <span className='ms-auto pb-1 font-mono text-xs text-[var(--campaign-fg-muted)]'>
          {me.rank > 0 ? `#${me.rank}` : t('Unranked')}
        </span>
      </div>

      <div className='mt-4 space-y-1.5'>
        <div className='flex justify-between font-mono text-[0.7rem] text-[var(--campaign-fg-muted)]'>
          <span>
            {t('Solved')} {me.solved_count} / {total}
          </span>
          <span>{percent}%</span>
        </div>
        <Progress
          value={percent}
          aria-label={t('Solved puzzles')}
          className='[&_[data-slot=progress-indicator]]:bg-emerald-400 [&_[data-slot=progress-track]]:bg-[var(--campaign-inset)]'
        />
      </div>

      <div className='mt-4'>
        {me.eligible ? (
          <Badge className='border-[var(--campaign-line-strong)] bg-[var(--campaign-chip)] text-[var(--campaign-fg)]'>
            {t('Reward slot #{{slot}}', { slot: me.reward_slot })}
          </Badge>
        ) : (
          <Badge className='border-[var(--campaign-line)] bg-[var(--campaign-chip)] text-[var(--campaign-fg-muted)]'>
            {t('Outside the reward slots')}
          </Badge>
        )}
      </div>

      <dl className='mt-4 space-y-1.5 text-sm'>
        {[
          { label: t('Solve rewards'), value: me.solve_yuan },
          { label: t('Share reward'), value: me.share_yuan },
          { label: t('Ranking reward'), value: me.rank_yuan },
        ].map((row) => (
          <div key={row.label} className='flex justify-between gap-2'>
            <dt className='text-[var(--campaign-fg-muted)]'>{row.label}</dt>
            <dd className='font-mono tabular-nums'>
              {formatYuan(row.value, locale)}
            </dd>
          </div>
        ))}
        <div className='flex justify-between gap-2 border-t border-[var(--campaign-line)] pt-1.5 font-medium'>
          <dt>{t('Total received')}</dt>
          <dd className='font-mono text-[var(--campaign-fg-accent)] tabular-nums'>
            {formatYuan(me.total_yuan, locale)}
          </dd>
        </div>
      </dl>

      <div className='mt-4 space-y-2'>
        <Button
          className='w-full bg-emerald-400 text-emerald-950 hover:bg-emerald-300 disabled:opacity-50'
          disabled={!me.share_ready || props.sharing}
          onClick={props.onShare}
        >
          <Download aria-hidden='true' />
          {props.sharing ? t('Preparing...') : t('Download result card')}
        </Button>
        <p className='text-[0.7rem] leading-4 text-[var(--campaign-fg-faint)]'>
          {shareHint(status, t)}
        </p>
      </div>

      {me.guest ? (
        <p className='mt-4 rounded-lg border border-[var(--campaign-line)] bg-[var(--campaign-chip)] p-3 text-xs leading-5 text-[var(--campaign-fg)]'>
          {t(
            'You are playing as a visitor. Sign in to link this progress and claim the rewards.'
          )}{' '}
          <Link
            to='/sign-in'
            search={{ redirect: EVENT_PATH }}
            className='underline underline-offset-2'
          >
            {t('Sign in')}
          </Link>
        </p>
      ) : null}

      {!me.guest && me.solved_count === 0 ? (
        <p className='mt-4 text-[0.7rem] leading-4 text-[var(--campaign-fg-faint)]'>
          {t(
            'Your first standard puzzle claims a reward slot, if any are left. Bonus puzzles do not claim slots.'
          )}
        </p>
      ) : null}
    </section>
  )
}

function shareHint(
  status: CampaignStatus,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (!status.me.share_ready) {
    return t('Solve the first two challenges to unlock the result card.')
  }
  if (status.me.share_claimed) {
    return t('Share reward collected. The card is still yours to download.')
  }
  if (!status.me.eligible) {
    return t('The result card is free; the share reward needs a reward slot.')
  }
  return t(
    'Your first share also pays the one-off share reward. It is not added to your score.'
  )
}
