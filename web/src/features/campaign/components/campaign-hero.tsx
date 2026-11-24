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

import { Badge } from '@/components/ui/badge'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { useCountdown } from '../hooks/use-countdown'
import { formatYuan, padNumber } from '../lib/format-event'
import type { CampaignStatus } from '../types'

const STATE_LABEL: Record<CampaignStatus['state'], string> = {
  disabled: 'Not open yet',
  scheduled: 'Starts in',
  active: 'Ends in',
  ended: 'Event ended',
}

const STATE_CLASS: Record<CampaignStatus['state'], string> = {
  disabled: 'border-[var(--campaign-line)] text-[var(--campaign-fg-muted)]',
  scheduled:
    'border-sky-600/40 bg-sky-500/10 text-sky-900 dark:border-sky-300/40 dark:bg-sky-300/10 dark:text-sky-100',
  active:
    'border-[var(--campaign-line-strong)] bg-[var(--campaign-chip)] text-[var(--campaign-fg)]',
  ended:
    'border-[var(--campaign-line)] bg-[var(--campaign-chip)] text-[var(--campaign-fg-muted)]',
}

function countdownTarget(status: CampaignStatus): number {
  if (status.state === 'scheduled') return status.starts_at
  if (status.state === 'active') return status.ends_at
  return 0
}

export function CampaignHero(props: { status: CampaignStatus }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const status = props.status
  const countdown = useCountdown(countdownTarget(status), status.server_time)
  const showTimer = status.state === 'scheduled' || status.state === 'active'

  const stats = [
    {
      label: t('Participants'),
      value: formatNumber(status.participants, locale),
    },
    {
      label: t('Answers solved'),
      value: formatNumber(status.solve_count, locale),
    },
    {
      label: t('Reward slots left'),
      value: formatNumber(status.slots_left, locale),
    },
    {
      label: t('Prize pool'),
      value: formatYuan(status.reward_pool_yuan, locale),
    },
  ]

  // Everything on this line comes from the backend, so a future campaign only
  // supplies data — the shell keeps no event-specific copy of its own.
  const heading = status.title || status.slug

  return (
    <section className='campaign-hero campaign-grid p-6 sm:p-10'>
      <div className='flex flex-wrap items-start justify-between gap-8'>
        <div className='min-w-0'>
          <p className='font-mono text-[0.7rem] tracking-[0.38em] text-[var(--campaign-fg-accent)] uppercase'>
            {t('Campaign')}
          </p>
          <h1 className='campaign-scanline mt-2 font-mono text-4xl leading-tight font-bold break-words text-[var(--campaign-fg-accent)] sm:text-6xl'>
            {heading}
          </h1>
        </div>

        <div className='flex flex-col items-start gap-3 sm:items-end'>
          <Badge className={cn('font-mono', STATE_CLASS[status.state])}>
            {t(STATE_LABEL[status.state])}
          </Badge>
          {showTimer ? (
            <div className='flex gap-2 font-mono' role='timer' aria-live='off'>
              {[
                { value: countdown.days, label: t('Days') },
                { value: countdown.hours, label: t('Hours') },
                { value: countdown.minutes, label: t('Minutes') },
                { value: countdown.seconds, label: t('Seconds') },
              ].map((part) => (
                <span
                  key={part.label}
                  className='flex min-w-14 flex-col items-center rounded-md border border-[var(--campaign-line)] bg-[var(--campaign-inset)] px-2 py-1.5'
                >
                  <span className='text-2xl font-bold text-[var(--campaign-fg)] tabular-nums'>
                    {padNumber(part.value)}
                  </span>
                  <span className='text-[0.6rem] tracking-widest text-[var(--campaign-fg-muted)] uppercase'>
                    {part.label}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
          <p className='font-mono text-xs text-[var(--campaign-fg-muted)]'>
            {status.total_points} pts · {status.reward_slots} slots ·{' '}
            {formatYuan(status.share_yuan, locale)} share
          </p>
        </div>
      </div>

      <dl className='mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4'>
        {stats.map((stat) => (
          <div key={stat.label} className='campaign-metric'>
            <dt className='text-[0.65rem] tracking-widest text-[var(--campaign-fg-muted)] uppercase'>
              {stat.label}
            </dt>
            <dd className='mt-1 font-mono text-lg font-semibold text-[var(--campaign-fg-strong)]'>
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
