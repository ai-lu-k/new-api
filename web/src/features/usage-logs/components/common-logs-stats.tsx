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
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { StatRow, type StatRowItem } from '@/components/stat-row'
import { toIntlLocale } from '@/i18n/languages'
import { formatLogQuota, formatNumber } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getLogStats, getUserLogStats } from '../api'
import { DEFAULT_LOG_STATS } from '../constants'
import { buildApiParams } from '../lib/utils'
import { useLogsViewScope, useUsageLogsContext } from './usage-logs-provider'

const route = getRouteApi('/_authenticated/usage-logs/$section')

const MASKED_QUOTA = '••••'

export function CommonLogsStats() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const { isAdminView: isAdmin } = useLogsViewScope()
  const searchParams = route.useSearch()
  const { sensitiveVisible } = useUsageLogsContext()

  const { data: stats, isLoading } = useQuery({
    queryKey: ['usage-logs-stats', isAdmin, searchParams],
    queryFn: async () => {
      const params = buildApiParams({
        page: 1,
        pageSize: 1,
        searchParams,
        columnFilters: [],
        isAdmin,
      })

      const result = isAdmin
        ? requireServerSuccess(await getLogStats(params))
        : requireServerSuccess(await getUserLogStats(params))

      return result.success
        ? result.data || DEFAULT_LOG_STATS
        : DEFAULT_LOG_STATS
    },
    placeholderData: (previousData) => previousData,
  })

  const usageDisplay = sensitiveVisible
    ? formatLogQuota(stats?.quota ?? 0)
    : MASKED_QUOTA
  const rpmDisplay = formatNumber(stats?.rpm ?? 0, locale)
  const tpmDisplay = formatNumber(stats?.tpm ?? 0, locale)

  const items: StatRowItem[] = [
    {
      key: 'usage',
      label: t('Usage'),
      value: usageDisplay,
      valueText: usageDisplay,
      loading: isLoading,
    },
    {
      key: 'rpm',
      label: t('RPM'),
      value: rpmDisplay,
      valueText: rpmDisplay,
      loading: isLoading,
    },
    {
      key: 'tpm',
      label: t('TPM'),
      value: tpmDisplay,
      valueText: tpmDisplay,
      loading: isLoading,
    },
  ]

  return <StatRow columns={3} size='page' items={items} className='flex-1' />
}
