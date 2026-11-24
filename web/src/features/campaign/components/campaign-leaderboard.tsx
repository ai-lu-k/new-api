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

import { EmptyState } from '@/components/empty-state'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AuthUser } from '@/stores/auth-store'

import type { CampaignLeaderboardRow } from '../types'

const MEDAL_CLASS = [
  'border-amber-500/60 text-amber-700 dark:border-amber-300/60 dark:text-amber-200',
  'border-slate-400/60 text-slate-600 dark:border-slate-300/50 dark:text-slate-200',
  'border-orange-500/60 text-orange-700 dark:border-orange-400/50 dark:text-orange-300',
]

export function CampaignLeaderboard(props: {
  rows: CampaignLeaderboardRow[]
  currentUser?: Pick<AuthUser, 'id' | 'username' | 'display_name'>
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  return (
    <section aria-labelledby='campaign-board-list' className='min-w-0'>
      <h2
        id='campaign-board-list'
        className='mb-3 font-mono text-lg tracking-wide text-[var(--campaign-fg)]'
      >
        {t('Scoreboard')}
      </h2>
      {props.rows.length === 0 ? (
        <EmptyState
          title={t('Nobody has solved a puzzle yet')}
          description={t('Be the first name on the board.')}
        />
      ) : (
        <ol className='space-y-1.5'>
          {props.rows.map((row) => {
            const isCurrentUser = props.currentUser?.id === row.user_id
            let name = row.name
            if (isCurrentUser && props.currentUser) {
              name =
                props.currentUser.display_name?.trim() ||
                props.currentUser.username.trim() ||
                row.name
            }
            const place = row.final_rank > 0 ? row.final_rank : row.rank
            return (
              <li
                key={row.user_id}
                aria-current={isCurrentUser ? true : undefined}
                className={cn(
                  'grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[var(--campaign-line)] bg-[var(--campaign-surface)] px-3 py-2',
                  isCurrentUser &&
                    'border-[var(--campaign-line-strong)] bg-[var(--campaign-chip)] ring-1 ring-[var(--campaign-fg-accent)]'
                )}
              >
                <span
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full border font-mono text-xs',
                    place <= 3
                      ? MEDAL_CLASS[place - 1]
                      : 'border-[var(--campaign-line)] text-[var(--campaign-fg-muted)]'
                  )}
                >
                  {place}
                </span>
                <span className='min-w-0'>
                  <span className='block truncate text-sm text-[var(--campaign-fg-strong)]'>
                    {name}
                  </span>
                  <span className='mt-0.5 flex flex-wrap items-center gap-2 text-[0.65rem] text-[var(--campaign-fg-muted)]'>
                    {isCurrentUser ? (
                      <span className='rounded bg-[var(--campaign-fg-accent)] px-1 font-medium text-[var(--campaign-page)]'>
                        {t('You')}
                      </span>
                    ) : null}
                    <span>
                      {t('Solved {{count}} challenges', {
                        count: formatNumber(row.solved_count, locale),
                      })}
                    </span>
                    {row.eligible ? (
                      <span className='rounded border border-[var(--campaign-line-strong)] px-1 text-[var(--campaign-fg-accent)]'>
                        {t('Eligible')}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className='font-mono text-sm text-[var(--campaign-fg)] tabular-nums'>
                  {formatNumber(row.points, locale)}
                </span>
              </li>
            )
          })}
        </ol>
      )}
      <p className='mt-3 text-[0.7rem] leading-4 text-[var(--campaign-fg-faint)]'>
        {t(
          'The board shows every account. The Eligible tag marks the reward-slot holders who compete for the ranking prizes.'
        )}
      </p>
    </section>
  )
}
