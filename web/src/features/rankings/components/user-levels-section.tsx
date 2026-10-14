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

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { UsageLevelBadge } from '@/features/usage-level/components/usage-level-badge'
import { useStatus } from '@/hooks/use-status'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import type {
  RankedUser,
  UserLevelLadderRow,
  UserLevelRankings,
} from '../types'

type UserLevelsSectionProps = {
  data: UserLevelRankings
}

/**
 * The public user level board: the ladder everyone climbs, the accounts that
 * climbed it furthest, and the reader's own place. Account names arrive from
 * the server already masked, so this section never holds a whole one.
 */
export function UserLevelsSection(props: UserLevelsSectionProps) {
  const { t } = useTranslation()
  // Subscribing to status keeps the money formatting reactive: the currency
  // configuration lands in the system-config store with /api/status, and the
  // amounts below are formatted from it.
  useStatus()

  const data = props.data

  if (data.total_users === 0) {
    return (
      <div className='bg-card rounded-xl border border-dashed px-6 py-12 text-center'>
        <h2 className='text-foreground text-base font-semibold'>
          {t('No levels to show yet')}
        </h2>
        <p className='text-muted-foreground mx-auto mt-2 max-w-md text-sm'>
          {t('Levels appear once accounts start consuming.')}
        </p>
      </div>
    )
  }

  const meIsListed = data.users.some((row) => row.is_me)

  return (
    <div className='space-y-6'>
      {data.me && !meIsListed && (
        <MyPlace row={data.me} total={data.total_users} />
      )}
      <Ladder rows={data.levels} />
      <Board rows={data.users} />
    </div>
  )
}

/**
 * The seven rungs, worded exactly as the profile page's level card words them:
 * LV0 shows its amount, LV1 is named, and the rest show their threshold.
 */
function Ladder(props: { rows: UserLevelLadderRow[] }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  return (
    <section className='bg-card overflow-hidden rounded-lg border'>
      <header className='border-b px-4 py-3'>
        <h3 className='text-foreground text-sm font-semibold'>
          {t('Level thresholds')}
        </h3>
        <p className='text-muted-foreground/80 mt-0.5 text-xs'>
          {t('Grow with your total consumption, including gifted balance.')}
        </p>
      </header>

      {/* Always seven columns so the row is exactly full: a wrapped grid
          leaves an empty cell showing the separator colour. Narrow screens
          scroll instead of wrapping. */}
      <div className='overflow-x-auto'>
        <div className='bg-border grid min-w-[42rem] grid-cols-7 gap-px'>
          {props.rows.map((row) => (
            <div key={row.level} className='bg-card px-3 py-3'>
              <UsageLevelBadge level={row.level} />
              <p className='text-muted-foreground/80 mt-2 text-[11px] leading-tight tabular-nums'>
                {row.level === 1
                  ? t('First consumption')
                  : formatQuotaWithCurrency(row.min_quota, { locale })}
              </p>
              <p className='text-foreground mt-2 text-sm font-semibold tabular-nums'>
                {formatNumber(row.users, locale)}
                <span className='text-muted-foreground/80 ml-1 text-[11px] font-normal'>
                  {t('accounts')}
                </span>
              </p>
            </div>
          ))}
        </div>
      </div>

      <p className='text-muted-foreground/80 border-t px-4 py-3 text-xs'>
        {t(
          'Top-ups alone do not increase your level. Refunds reduce cumulative consumption.'
        )}
      </p>
    </section>
  )
}

/** The published page of heaviest consumers. */
function Board(props: { rows: RankedUser[] }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  const columns: StaticDataTableColumn<RankedUser>[] = [
    {
      id: 'rank',
      header: t('Rank'),
      className: 'w-12 px-4 py-2',
      cellClassName: 'text-muted-foreground px-4 py-2 font-mono tabular-nums',
      cell: (row) => row.rank,
    },
    {
      id: 'account',
      header: t('Account'),
      className: 'px-2 py-2',
      cellClassName: 'px-2 py-2',
      cell: (row) => (
        <>
          <span className='font-medium'>{row.name}</span>
          {row.is_me && (
            <span className='bg-primary/10 text-primary ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium'>
              {t('You')}
            </span>
          )}
        </>
      ),
    },
    {
      id: 'level',
      header: t('Level'),
      className: 'px-2 py-2',
      cellClassName: 'px-2 py-2',
      cell: (row) => <UsageLevelBadge level={row.level} />,
    },
    {
      id: 'consumed',
      header: t('Consumed'),
      className: 'px-4 py-2 text-right',
      cellClassName: 'px-4 py-2 text-right font-mono tabular-nums',
      cell: (row) => formatQuotaWithCurrency(row.used_quota, { locale }),
    },
    {
      id: 'requests',
      header: t('Requests'),
      className: 'hidden px-4 py-2 text-right sm:table-cell',
      cellClassName:
        'text-muted-foreground hidden px-4 py-2 text-right font-mono tabular-nums sm:table-cell',
      cell: (row) => formatNumber(row.request_count, locale),
    },
  ]

  return (
    <section className='bg-card overflow-hidden rounded-lg border'>
      <header className='border-b px-4 py-3'>
        <h3 className='text-foreground text-sm font-semibold'>
          {t('Top consumers')}
        </h3>
        <p className='text-muted-foreground/80 mt-0.5 text-xs'>
          {t('Account names are partly hidden on this public page.')}
        </p>
      </header>

      <StaticDataTable
        tableClassName='w-full text-sm'
        columns={columns}
        data={props.rows}
        getRowKey={(row) => row.rank}
        getRowClassName={(row) =>
          cn('border-b last:border-0', row.is_me && 'bg-primary/5')
        }
        headerRowClassName='text-muted-foreground/80 text-left text-[11px] tracking-wide uppercase'
      />
    </section>
  )
}

/** The reader's own line, when they rank below the published page. */
function MyPlace(props: { row: RankedUser; total: number }) {
  const { t } = useTranslation()

  return (
    <section className='bg-primary/5 border-primary/20 rounded-lg border px-4 py-3'>
      <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
        <UsageLevelBadge level={props.row.level} showTitle />
        <span className='text-foreground text-sm font-medium'>
          {t('Your place: #{{rank}} of {{total}}', {
            rank: props.row.rank,
            total: props.total,
          })}
        </span>
        <span className='text-muted-foreground ml-auto font-mono text-sm tabular-nums'>
          {formatQuotaWithCurrency(props.row.used_quota)}
        </span>
      </div>
    </section>
  )
}
