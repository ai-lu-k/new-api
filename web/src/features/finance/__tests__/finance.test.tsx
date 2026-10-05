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
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { Finance } from '..'
import { monthBalance, totalGift, totalTopUp } from '../lib'

vi.mock('@visactor/react-vchart', () => ({
  VChart: (props: { spec: { data: { values: unknown[] }[] } }) => (
    <div data-testid='chart' data-points={props.spec.data[0].values.length} />
  ),
}))

const MONTHS = [
  {
    month: '2026-10',
    online_topup: 300,
    manual_topup: 50,
    gift_manual: 20,
    gift_checkin: 5.5,
    gift_redemption: 10,
    expenses: 410,
  },
  {
    month: '2026-09',
    online_topup: 120,
    manual_topup: 0,
    gift_manual: 0,
    gift_checkin: 3,
    gift_redemption: 0,
    expenses: 100,
  },
]

beforeEach(() => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url !== '/api/finance/summary') {
      throw new Error(`Unexpected request: ${url}`)
    }
    return {
      data: {
        success: true,
        data: {
          months: MONTHS,
          excluded_users: 2,
          total: {
            online_topup: 900,
            manual_topup: 100,
            gift_manual: 0,
            gift_checkin: 0,
            gift_redemption: 0,
            expenses: 400,
          },
        },
      },
    }
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('adds top-ups and gifts up and leaves gifts out of the net', () => {
  expect(totalTopUp(MONTHS[0])).toBe(350)
  expect(totalGift(MONTHS[0])).toBe(35.5)
  expect(monthBalance(MONTHS[0])).toBe(-60)
  expect(monthBalance(MONTHS[1])).toBe(20)
})

it('shows the summary for a month, the year and all time, the chart and one row per month', async () => {
  const user = userEvent.setup()
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Finance />
    </QueryClientProvider>
  )

  const summary = await screen.findByRole('region', { name: 'Summary' })
  expect(within(summary).getByText('October 2026')).toBeTruthy()
  expect(within(summary).getByText(/350\.00/)).toBeTruthy()
  expect(within(summary).getByText(/-.*60\.00/)).toBeTruthy()
  expect(within(summary).getByText(/35\.50/)).toBeTruthy()

  // The year so far: both months added up.
  await user.click(within(summary).getByRole('tab', { name: 'Current year' }))
  expect(within(summary).getByText('2026')).toBeTruthy()
  expect(within(summary).getByText(/470\.00/)).toBeTruthy()
  expect(within(summary).getByText(/510\.00/)).toBeTruthy()

  // Everything since the site began comes from the server's total.
  await user.click(within(summary).getByRole('tab', { name: 'All time' }))
  expect(within(summary).getByText(/1,000\.00/)).toBeTruthy()
  expect(within(summary).getByText(/600\.00/)).toBeTruthy()
  expect(
    screen.getByRole('region', {
      name: 'Top-ups, expenses and gifts by month',
    })
  ).toBeTruthy()
  expect(screen.getAllByRole('row')).toHaveLength(3)
  expect(screen.getByText(/leave out 2 accounts/)).toBeTruthy()
})
