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
import { useMemo } from 'react'

import { getExpenseLedger } from '@/features/rankings/api'
import {
  EXPENSE_LEDGER_QUERY_KEY,
  expenseMonthTotal,
} from '@/features/rankings/lib/expenses'
import { requireServerSuccess } from '@/lib/server-error-message'

export type CostMonth = {
  /** The month as `2026-11`. */
  month: string
  /** Everything entered for it, prepaid shares included. */
  total: number
}

export type CostLines = {
  /** Month the figures belong to, `2026-11`; null while nothing is entered. */
  month: string | null
  /** Everything entered for the month, prepaid shares included. */
  total: number | null
  /** The months on record, oldest first, at most one year of them. */
  series: CostMonth[]
}

/** How many months of the ledger the home page plots. */
const SERIES_MONTHS = 6

/**
 * What the site spent, month by month, read from the same public ledger the
 * rankings page shows (and from the same cache entry). The newest month on
 * record is the one the headline figure belongs to.
 */
export function useCostLines(): { lines: CostLines; readAt: number } {
  const query = useQuery({
    queryKey: [...EXPENSE_LEDGER_QUERY_KEY, 'public'],
    queryFn: async () => requireServerSuccess(await getExpenseLedger()),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { errorToast: false },
  })

  const lines = useMemo<CostLines>(() => {
    const months = query.data?.data?.months ?? []
    const series = months
      .map((month) => ({ month: month.month, total: expenseMonthTotal(month) }))
      .filter((point) => point.total > 0)
      .slice(0, SERIES_MONTHS)
      .reverse()
    const latest = series.at(-1)
    return {
      month: latest?.month ?? null,
      total: latest?.total ?? null,
      series,
    }
  }, [query.data])

  return { lines, readAt: query.dataUpdatedAt }
}
