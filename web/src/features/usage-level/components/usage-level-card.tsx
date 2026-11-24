import { Link } from '@tanstack/react-router'
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
import { Award } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { TitledCard } from '@/components/ui/titled-card'
import { useStatus } from '@/hooks/use-status'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { useUsageLevel } from '../hooks/use-usage-level'
import { UsageLevelBadge } from './usage-level-badge'

export function UsageLevelCard(props: {
  compact?: boolean
  layout?: 'overview'
}) {
  const { t, i18n } = useTranslation()
  const user = useUsageLevel()
  const { status } = useStatus()
  const level = user?.usage_level
  if (!level) return null
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const thresholds = status?.usage_level_thresholds

  if (props.compact) {
    let milestone = t('Your first paid consumption unlocks LV1.')
    if (level.level > 0 && level.level < 6) {
      milestone = t('Consume {{amount}} more to reach LV{{level}}', {
        amount: formatQuotaWithCurrency(level.remaining_quota, {
          locale,
          digitsSmall: 6,
        }),
        level: level.level + 1,
      })
    }
    if (level.level === 6) {
      milestone =
        props.layout === 'overview'
          ? t('Highest level reached')
          : t('Thank you for your continued support.')
    }

    return (
      <Link
        to='/profile'
        className='focus-visible:ring-ring flex min-w-0 flex-col gap-1.5 rounded-md outline-none focus-visible:ring-2'
        aria-label={`${t('Usage level')} LV${level.level} · ${t('Level progress')} ${formatNumber(level.progress, locale)}%`}
      >
        <div
          role='group'
          aria-label={t('Usage level')}
          className={cn(
            'flex min-w-0 items-center gap-2',
            props.layout === 'overview' &&
              'grid h-[30px] grid-cols-[auto_minmax(0,1fr)] grid-rows-[18px_6px] gap-x-2 gap-y-1.5'
          )}
        >
          <UsageLevelBadge
            level={level.level}
            compact
            className={cn(
              'h-5 text-xs',
              props.layout === 'overview' &&
                'bg-accent text-primary h-[18px] justify-self-start border-0 px-1 text-[11px]'
            )}
          />
          {props.layout === 'overview' && (
            <span
              className='text-muted-foreground truncate text-[11px] leading-[18px]'
              title={milestone}
            >
              {milestone}
            </span>
          )}
          <Progress
            value={level.progress}
            aria-label={t('Level progress')}
            className={cn(
              'min-w-0 flex-1',
              props.layout === 'overview' &&
                'col-span-2 w-full [&_[data-slot=progress-track]]:h-1.5'
            )}
          />
          {props.layout !== 'overview' &&
            (level.level < 6 ? (
              <Badge
                variant='secondary'
                className='text-muted-foreground h-5 px-1.5 text-xs'
              >
                {`LV${level.level + 1}`}
              </Badge>
            ) : (
              <span className='text-muted-foreground shrink-0 text-xs'>
                {t('Highest level reached')}
              </span>
            ))}
        </div>
        {props.layout !== 'overview' && (
          <span
            className='text-muted-foreground truncate text-xs'
            title={milestone}
          >
            {milestone}
          </span>
        )}
      </Link>
    )
  }

  return (
    <TitledCard
      title={<h3>{t('Usage level')}</h3>}
      description={t(
        'Grow with your paid consumption. Gifted balance and check-ins do not count.'
      )}
      icon={<Award className='size-4' aria-hidden='true' />}
      iconTone='info'
      action={<UsageLevelBadge level={level.level} showTitle />}
      disableHoverEffect
    >
      <div className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-2 text-sm'>
          <span className='text-muted-foreground'>
            {t('Total paid consumption')}
          </span>
          <span className='font-semibold tabular-nums'>
            {formatQuotaWithCurrency(
              Math.max(0, user.level_quota ?? user.used_quota ?? 0),
              {
                locale,
                digitsSmall: 6,
              }
            )}
          </span>
        </div>
        <div className='space-y-2'>
          <div className='flex flex-wrap justify-between gap-2 text-sm'>
            <span>
              {level.level === 6
                ? t('Highest level reached')
                : t('Level progress')}
            </span>
            <span className='text-muted-foreground tabular-nums'>
              {formatNumber(level.progress, locale)}%
            </span>
          </div>
          <Progress value={level.progress} aria-label={t('Level progress')} />
          <p className='text-muted-foreground text-xs'>
            {level.level === 0 && t('Your first paid consumption unlocks LV1.')}
            {level.level > 0 &&
              level.level < 6 &&
              t('Consume {{amount}} more to reach LV{{level}}', {
                amount: formatQuotaWithCurrency(level.remaining_quota, {
                  locale,
                  digitsSmall: 6,
                }),
                level: level.level + 1,
              })}
            {level.level === 6 && t('Thank you for your continued support.')}
          </p>
        </div>
        {Array.isArray(thresholds) && thresholds.length === 7 && (
          <ol
            aria-label={t('Level thresholds')}
            className='grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7'
          >
            {[0, 1, 2, 3, 4, 5, 6].map((milestone) => (
              <li
                key={milestone}
                className='bg-muted/30 min-w-0 space-y-1 rounded-lg p-2 text-xs'
                aria-current={milestone === level.level ? 'step' : undefined}
              >
                <UsageLevelBadge level={milestone} />
                <p className='text-muted-foreground break-words tabular-nums'>
                  {milestone === 1
                    ? t('First paid consumption')
                    : formatQuotaWithCurrency(thresholds[milestone], {
                        locale,
                      })}
                </p>
              </li>
            ))}
          </ol>
        )}
        <p className='text-muted-foreground text-xs'>
          {t(
            'Top-ups and gifts do not increase your level. Refunds reduce cumulative consumption.'
          )}
        </p>
      </div>
    </TitledCard>
  )
}
