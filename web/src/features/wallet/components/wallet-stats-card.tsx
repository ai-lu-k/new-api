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

import { StatRow, type StatRowItem } from '@/components/stat-row'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatQuota } from '@/lib/format'

import type { UserWalletData } from '../types'

interface WalletStatsCardProps {
  user: UserWalletData | null
  loading?: boolean
}

/** The figures that open the top-up page: balance, usage, requests. */
export function WalletStatsCard(props: WalletStatsCardProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  const balance = formatQuota(props.user?.quota ?? 0)
  const usage = formatQuota(props.user?.used_quota ?? 0)
  const requests = formatNumber(props.user?.request_count ?? 0, locale)

  const items: StatRowItem[] = [
    {
      key: 'balance',
      label: t('Current Balance'),
      value: balance,
      valueText: balance,
      loading: props.loading,
    },
    {
      key: 'usage',
      label: t('Total Usage'),
      value: usage,
      valueText: usage,
      loading: props.loading,
    },
    {
      key: 'requests',
      label: t('API Requests'),
      value: requests,
      valueText: requests,
      loading: props.loading,
    },
  ]

  return (
    <StatRow
      columns={3}
      size='analytics'
      items={items}
      // Phones keep two columns: three 30px figures in one row wrap the digits.
      className='pb-1 max-sm:grid-cols-2 max-sm:divide-x-0 max-sm:[&>div]:ps-0!'
      itemClassName='py-1'
    />
  )
}
