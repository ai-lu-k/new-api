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

import { cn } from '@/lib/utils'

import type { RankingPeriod, RankingsView } from '../types'

const PERIODS: { id: RankingPeriod; labelKey: string }[] = [
  { id: 'today', labelKey: 'Today' },
  { id: 'week', labelKey: 'Week' },
  { id: 'month', labelKey: 'Month' },
  { id: 'year', labelKey: 'Year' },
]

const VIEWS: { id: RankingsView; labelKey: string }[] = [
  { id: 'models', labelKey: 'Model rankings' },
  { id: 'expenses', labelKey: 'Expenses' },
  { id: 'about', labelKey: 'About' },
]

const HEADINGS: Record<RankingsView, { title: string; description: string }> =
  {
    models: {
      title: 'Rankings',
      description:
        'Discover the most-used models and rising vendors on the platform, updated from live usage data.',
    },
    expenses: {
      title: 'Expenses',
      description:
        'What running this site costs each month, published item by item.',
    },
    about: { title: 'About', description: '' },
  }

type RankingsHeroProps = {
  /** The sections to offer; one that is switched off is left out. */
  views: RankingsView[]
  view: RankingsView
  onViewChange: (view: RankingsView) => void
  period: RankingPeriod
  onPeriodChange: (period: RankingPeriod) => void
}

/**
 * Hero strip for the rankings page. Intentionally minimal — the switch
 * between the model rankings, the site's expenses and the About content, a
 * title with its subtitle, and the period tabs of the rankings.
 */
export function RankingsHero(props: RankingsHeroProps) {
  const { t } = useTranslation()

  return (
    <section className='space-y-5'>
      <div
        role='tablist'
        aria-label={t('Section')}
        className='bg-muted inline-flex rounded-lg p-1'
      >
        {VIEWS.filter((v) => props.views.includes(v.id)).map((v) => {
          const isActive = props.view === v.id
          return (
            <button
              key={v.id}
              role='tab'
              type='button'
              aria-selected={isActive}
              onClick={() => props.onViewChange(v.id)}
              className={cn(
                'focus-visible:ring-ring/40 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t(v.labelKey)}
            </button>
          )
        })}
      </div>

      <div className='space-y-2'>
        <h1 className='text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.15] font-bold tracking-tight'>
          {t(HEADINGS[props.view].title)}
        </h1>
        {HEADINGS[props.view].description && (
          <p className='text-muted-foreground/80 max-w-2xl text-sm'>
            {t(HEADINGS[props.view].description)}
          </p>
        )}
      </div>

      {props.view === 'models' && (
        // Underline tabs for period — clean and unobtrusive.
        <div
          role='tablist'
          aria-label={t('Period')}
          className='border-border/60 flex items-center border-b'
        >
          {PERIODS.map((p) => {
            const isActive = props.period === p.id
            return (
              <button
                key={p.id}
                role='tab'
                type='button'
                aria-selected={isActive}
                onClick={() => props.onPeriodChange(p.id)}
                className={cn(
                  'focus-visible:ring-ring/40 relative -mb-px rounded-sm px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t(p.labelKey)}
                <span
                  aria-hidden
                  className={cn(
                    'bg-foreground absolute inset-x-3 -bottom-px h-[2px] rounded-full transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-0'
                  )}
                />
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
