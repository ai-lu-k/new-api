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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import type { Voucher } from '../../api'

import {
  CouponArrivalDialog,
  VOUCHER_OPEN_EVENT,
} from '../coupon-arrival-dialog'

// 500000 quota is one unit of display currency, so these vouchers read as ¥3
// and ¥5 under the CNY configuration set up below.
const THREE_YUAN = 1_500_000
const FIVE_YUAN = 2_500_000

const vouchers: Pick<Voucher, 'id' | 'face_value' | 'expires_at' | 'reason'>[] = [
  { id: 11, face_value: THREE_YUAN, expires_at: 1_800_000_000 },
  { id: 12, face_value: FIVE_YUAN, expires_at: 1_800_000_000 },
]

const clients: QueryClient[] = []
let balance = 0

function mockAccount(items = vouchers) {
  balance = 10 * THREE_YUAN
  useAuthStore.setState({
    ...useAuthStore.getState(),
    auth: {
      ...useAuthStore.getState().auth,
      user: { id: 1, username: 'fixture', role: 1, quota: balance },
    },
  })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { items } },
  })
  vi.spyOn(api, 'post').mockImplementation(async (url, body) => {
    if (url === '/api/user/vouchers/open') {
      const ids =
        (body as { voucher_ids?: number[] } | undefined)?.voucher_ids ?? []
      const opened = items.filter((voucher) => ids.includes(voucher.id))
      const quota = opened.reduce((sum, voucher) => sum + voucher.face_value, 0)
      balance += quota
      return {
        data: {
          success: true,
          data: {
            opened: opened.map((voucher) => voucher.id),
            skipped: ids.filter((id) => !opened.some((v) => v.id === id)),
            opened_quota: quota,
            balance,
          },
        },
      }
    }
    return { data: { success: true, data: { acknowledged: items.length } } }
  })
}

// Every mount is a fresh visit: only the account remembers what it has seen.
function visit() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  return render(
    <QueryClientProvider client={client}>
      <CouponArrivalDialog />
    </QueryClientProvider>
  )
}

function setup(items = vouchers) {
  mockAccount(items)
  return visit()
}

function openCalls() {
  return vi
    .mocked(api.post)
    .mock.calls.filter(([url]) => url === '/api/user/vouchers/open')
}

function acknowledgeCalls() {
  return vi
    .mocked(api.post)
    .mock.calls.filter(([url]) => url === '/api/user/vouchers/acknowledge')
}

beforeEach(() => {
  useSystemConfigStore.getState().setConfig({
    currency: {
      ...useSystemConfigStore.getState().config.currency,
      quotaDisplayType: 'CNY',
      usdExchangeRate: 1,
    },
  })
})

afterEach(() => {
  cleanup()
  for (const client of clients) client.clear()
  clients.length = 0
  vi.restoreAllMocks()
})

it('lists what arrived and what it is worth', async () => {
  setup()

  expect(await screen.findByText('You received vouchers')).toBeVisible()
  expect(screen.getAllByText('¥3.00').length).toBeGreaterThan(0)
  expect(screen.getAllByText('¥5.00').length).toBeGreaterThan(0)
  // Two vouchers, so the total is worth a line of its own.
  expect(screen.getByText('¥8.00')).toBeVisible()
})

it('says why each voucher arrived, and names it when no reason was given', async () => {
  setup([{ ...vouchers[0], reason: 'Double 11 reward' }, vouchers[1]])

  expect(await screen.findByText('Double 11 reward')).toBeVisible()
  // The second voucher came from a path with no grant behind it.
  expect(screen.getAllByText('Voucher')).toHaveLength(1)
})

it('credits the balance when the notice is closed by its own button', async () => {
  setup()
  const button = await screen.findByRole('button', { name: 'Receive' })

  fireEvent.click(button)

  await waitFor(() => expect(openCalls()).toHaveLength(1))
  expect(openCalls()[0][1]).toEqual({ voucher_ids: [11, 12] })
  await waitFor(() => expect(acknowledgeCalls()).toHaveLength(1))
  await waitFor(() =>
    expect(useAuthStore.getState().auth.user?.quota).toBe(balance)
  )
})

it('credits the balance when the notice is dismissed instead', async () => {
  setup()
  await screen.findByText('You received vouchers')

  await userEvent.keyboard('{Escape}')

  await waitFor(() => expect(openCalls()).toHaveLength(1))
  expect(openCalls()[0][1]).toEqual({ voucher_ids: [11, 12] })
})

it('keeps the vouchers pending when the server refused the credit', async () => {
  setup()
  vi.mocked(api.post).mockImplementation(async (url) => {
    if (url === '/api/user/vouchers/open') throw new Error('gateway down')
    return { data: { success: true, data: { acknowledged: 0 } } }
  })

  fireEvent.click(await screen.findByRole('button', { name: 'Receive' }))

  // The notice stays on screen, so the money it promises is still claimed.
  await waitFor(() =>
    expect(screen.getByText('You received vouchers')).toBeVisible()
  )
  expect(useAuthStore.getState().auth.user?.quota).toBe(10 * THREE_YUAN)
})

it('comes back when the card behind it asks for the vouchers again', async () => {
  setup(vouchers)
  fireEvent.click(await screen.findByRole('button', { name: 'Receive' }))
  await waitFor(() => expect(openCalls()).toHaveLength(1))

  // The notice is gone; the count under the card asks for it back.
  fireEvent(window, new Event(VOUCHER_OPEN_EVENT))
  fireEvent.click(await screen.findByRole('button', { name: 'Receive' }))

  await waitFor(() => expect(openCalls()).toHaveLength(2))
})
