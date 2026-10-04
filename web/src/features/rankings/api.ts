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
import { api } from '@/lib/api'

import type {
  ExpenseLedgerData,
  ExpenseMonth,
  PrepaidExpense,
  RankingPeriod,
  RankingsSnapshot,
} from './types'

type RankingsResponse = {
  success: boolean
  message?: string
  data: RankingsSnapshot
}

export async function getRankings(
  period: RankingPeriod
): Promise<RankingsResponse> {
  const res = await api.get('/api/rankings', { params: { period } })
  return res.data
}

type ExpenseLedgerResponse = {
  success: boolean
  message?: string
  data?: ExpenseLedgerData
}

/** The site's expenses, newest month first, with the lists the editor uses. */
export async function getExpenseLedger(): Promise<ExpenseLedgerResponse> {
  const res = await api.get('/api/expense_ledger')
  return res.data
}

/** Replace the months entered by hand. Only the root user may do this. */
export async function saveExpenseLedger(months: ExpenseMonth[]): Promise<{
  success: boolean
  message?: string
}> {
  const res = await api.put('/api/option/', {
    key: 'expense_ledger.months',
    value: JSON.stringify(months),
  })
  return res.data
}

/** Replace the prepaid expenses. Only the root user may do this. */
export async function savePrepaidExpenses(prepaid: PrepaidExpense[]): Promise<{
  success: boolean
  message?: string
}> {
  const res = await api.put('/api/option/', {
    key: 'expense_ledger.prepaid',
    value: JSON.stringify(prepaid),
  })
  return res.data
}
