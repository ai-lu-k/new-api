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

import { Card } from '@/components/ui/card'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { AccountSummary } from './lib'

type AccountsSummaryProps = {
  summary: AccountSummary
}

/**
 * The pool at a glance. "Available" uses the hub's routing rule — enabled and
 * inside every guard rail — while "total" counts every account, disabled ones
 * included, so the two numbers answer different questions.
 */
export function AccountsSummary(props: AccountsSummaryProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const summary = props.summary

  const stats = [
    {
      key: 'accounts',
      label: t('Accounts'),
      value: formatNumber(summary.total, locale),
      note: t('{{count}} enabled', { count: summary.enabled }),
      tone: 'plain',
    },
    {
      key: 'ready',
      label: t('Ready'),
      value: formatNumber(summary.ready, locale),
      note: t('{{count}} blocked', {
        count: Math.max(0, summary.enabled - summary.ready),
      }),
      tone: 'positive',
    },
    {
      key: 'credits',
      label: t('Available credits'),
      value: formatNumber(summary.creditsAvailable, locale),
      note: t('of {{total}} in total', {
        total: formatNumber(summary.creditsTotal, locale),
      }),
      tone: 'positive',
    },
    {
      key: 'cooldown',
      label: t('Cooling down'),
      value: formatNumber(summary.cooldown, locale),
      note: '',
      tone: summary.cooldown > 0 ? 'warning' : 'plain',
    },
    {
      key: 'relogin',
      label: t('Need re-login'),
      value: formatNumber(summary.needRelogin, locale),
      note: '',
      tone: summary.needRelogin > 0 ? 'danger' : 'plain',
    },
    {
      key: 'expired',
      label: t('Token expired'),
      value: formatNumber(summary.tokenExpired, locale),
      note: '',
      tone: summary.tokenExpired > 0 ? 'danger' : 'plain',
    },
  ] as const

  return (
    <Card
      data-card-hover='false'
      className='grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6'
    >
      {stats.map((stat) => (
        <div key={stat.key} className='min-w-0'>
          <p className='text-muted-foreground truncate text-xs'>{stat.label}</p>
          <p
            className={cn(
              'mt-1 text-lg font-semibold tabular-nums',
              stat.tone === 'danger' && 'text-destructive',
              stat.tone === 'warning' && 'text-warning'
            )}
          >
            {stat.value}
          </p>
          {stat.note !== '' && (
            <p className='text-muted-foreground truncate text-xs'>
              {stat.note}
            </p>
          )}
        </div>
      ))}
    </Card>
  )
}
