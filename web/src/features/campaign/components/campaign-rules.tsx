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

import { toIntlLocale } from '@/i18n/languages'

import { formatYuan, formatShanghai } from '../lib/format-event'
import type { CampaignStatus } from '../types'

export function CampaignRules(props: { status: CampaignStatus }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const status = props.status
  const standard = status.challenges.filter((challenge) => !challenge.bonus)
  const bonuses = status.challenges.filter((challenge) => challenge.bonus)

  const lines = [
    t('Event window: {{start}} to {{end}} (UTC+8).', {
      start: formatShanghai(status.starts_at),
      end: formatShanghai(status.ends_at),
    }),
    t(
      '{{count}} standard puzzles worth {{points}} points. 100 points redeem for {{amount}} of gifted balance.',
      {
        count: standard.length,
        points: standard.reduce((sum, challenge) => sum + challenge.points, 0),
        amount: formatYuan(1, locale),
      }
    ),
    ...(bonuses.length > 0
      ? [
          t(
            '{{count}} bonus puzzles add {{points}} ranking points without solve rewards. Bonus points affect the final ranking prizes.',
            {
              count: bonuses.length,
              points: bonuses.reduce(
                (sum, challenge) => sum + challenge.points,
                0
              ),
            }
          ),
        ]
      : []),
    t(
      'The first {{slots}} accounts that settle a solve reward claim the reward slots.',
      { slots: status.reward_slots }
    ),
    t(
      'A result card unlocks after the first two challenges; the first share pays {{amount}} once and does not add score.',
      { amount: formatYuan(status.share_yuan, locale) }
    ),
    t(
      'Among reward-slot holders, the top three at the end earn {{first}}, {{second}} and {{third}}.',
      {
        first: formatYuan(status.ranking_yuan[0] ?? 0, locale),
        second: formatYuan(status.ranking_yuan[1] ?? 0, locale),
        third: formatYuan(status.ranking_yuan[2] ?? 0, locale),
      }
    ),
    t(
      'Visitors can solve and keep score; signing in links the progress and pays the rewards that were still open. Guest claims close on {{deadline}} (UTC+8).',
      { deadline: formatShanghai(status.claim_deadline) }
    ),
  ]

  return (
    <section
      aria-labelledby='campaign-rules-heading'
      className='rounded-xl border border-[var(--campaign-line)] bg-[var(--campaign-surface)] p-5'
    >
      <h2
        id='campaign-rules-heading'
        className='font-mono text-sm tracking-widest text-[var(--campaign-fg-accent)] uppercase'
      >
        {t('Rules')}
      </h2>
      <ul className='mt-3 space-y-2 text-sm leading-6 text-[var(--campaign-fg-muted)]'>
        {lines.map((line) => (
          <li key={line} className='flex gap-2'>
            <span
              aria-hidden='true'
              className='font-mono text-[var(--campaign-fg-accent)]'
            >
              &gt;
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p className='mt-4 text-[0.7rem] leading-4 text-[var(--campaign-fg-faint)]'>
        {t(
          'All times are Asia/Shanghai. Scores and rewards are written once and never clawed back; the ranking prizes are settled by an administrator after the event.'
        )}
      </p>
    </section>
  )
}
