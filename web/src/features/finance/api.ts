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
  FinanceDaily,
  FinanceMonth,
  FinanceOperations,
  FinanceReserves,
  FinanceTotals,
  FinanceWalletUser,
  UpstreamAccount,
  UpstreamAccountInput,
  UpstreamBooking,
  UpstreamTopUp,
} from './types'

/** The last months of top-ups, gifts and expenses, newest first. Root only. */
export async function getFinanceSummary(months = 12): Promise<{
  success: boolean
  message?: string
  data?: {
    months: FinanceMonth[]
    /** Everything since the site began, however far back. */
    total?: FinanceTotals
    /** How many accounts, test accounts for one, are left out. */
    excluded_users?: number
  }
}> {
  const res = await api.get('/api/finance/summary', { params: { months } })
  return res.data
}

/** Money in and out for each day of the range, plus the undated expenses. */
export async function getFinanceDaily(params: {
  start_timestamp: number
  end_timestamp: number
}): Promise<{
  success: boolean
  message?: string
  data?: FinanceDaily
}> {
  const res = await api.get('/api/finance/daily', { params })
  return res.data
}

/** The operations overview: wallet split, period consumption and Token Plan. */
export async function getFinanceOperations(): Promise<{
  success: boolean
  message?: string
  data?: FinanceOperations
}> {
  const res = await api.get('/api/finance/operations')
  return res.data
}

/** The cumulative balance against the two three-day reserve targets. */
export async function getFinanceReserves(): Promise<{
  success: boolean
  message?: string
  data?: FinanceReserves
}> {
  const res = await api.get('/api/finance/reserves')
  return res.data
}

export async function getFinanceUsers(params: {
  offset: number
  limit: number
  search: string
}): Promise<{
  success: boolean
  message?: string
  data?: { items: FinanceWalletUser[]; total: number }
}> {
  const res = await api.get('/api/finance/users', { params })
  return res.data
}

export async function listUpstreamAccounts(): Promise<{
  success: boolean
  message?: string
  data?: { items: UpstreamAccount[] }
}> {
  const res = await api.get('/api/finance/upstream_accounts')
  return res.data
}

export async function createUpstreamAccount(
  body: UpstreamAccountInput
): Promise<{ success: boolean; message?: string; data?: UpstreamAccount }> {
  const res = await api.post('/api/finance/upstream_accounts', body)
  return res.data
}

export async function updateUpstreamAccount(
  id: number,
  body: UpstreamAccountInput
): Promise<{ success: boolean; message?: string; data?: UpstreamAccount }> {
  const res = await api.put(`/api/finance/upstream_accounts/${id}`, body)
  return res.data
}

export async function deleteUpstreamAccount(
  id: number
): Promise<{ success: boolean; message?: string }> {
  const res = await api.delete(`/api/finance/upstream_accounts/${id}`)
  return res.data
}

export async function refreshUpstreamAccount(
  id: number
): Promise<{ success: boolean; message?: string; data?: UpstreamAccount }> {
  const res = await api.post(`/api/finance/upstream_accounts/${id}/refresh`)
  return res.data
}

export async function listUpstreamTopUps(id: number): Promise<{
  success: boolean
  message?: string
  data?: { items: UpstreamTopUp[] }
}> {
  const res = await api.get(`/api/finance/upstream_accounts/${id}/topups`)
  return res.data
}

export async function listUpstreamBookings(): Promise<{
  success: boolean
  message?: string
  data?: { items: UpstreamBooking[] }
}> {
  const res = await api.get('/api/finance/upstream_bookings')
  return res.data
}
