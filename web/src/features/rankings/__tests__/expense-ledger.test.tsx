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
import { useAuthStore } from '@/stores/auth-store'

import { ExpenseLedger } from '../components/expense-ledger'
import { formatExpenseAmount, formatExpenseMonth } from '../lib'

vi.mock('@visactor/react-vchart', () => ({
  VChart: (props: { spec: { data: { values: unknown[] }[] } }) => (
    <div data-testid='chart' data-points={props.spec.data[0].values.length} />
  ),
}))

const MONTHS = [
  {
    month: '2026-10',
    items: [
      { name: 'Upstream model fees', amount: 1200.5, note: 'Invoice 12' },
      { name: 'Server', amount: 300 },
    ],
  },
  { month: '2026-09', items: [{ name: 'Server', amount: 280 }] },
]

beforeEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url !== '/api/expense_ledger') {
      throw new Error(`Unexpected request: ${url}`)
    }
    return { data: { success: true, data: { months: MONTHS } } }
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderLedger(editable = false) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ExpenseLedger editable={editable} />
    </QueryClientProvider>
  )
}

it('lists each month with its lines and total, read-only on the public page', async () => {
  // Even the root user edits on the admin page, not here.
  useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role: 100 })
  renderLedger()

  const october = await screen.findByRole('region', { name: /October 2026/ })
  expect(within(october).getByText('Upstream model fees')).toBeTruthy()
  expect(within(october).getByText('Invoice 12')).toBeTruthy()
  expect(within(october).getByText(/1,500\.50/)).toBeTruthy()
  expect(screen.getByRole('region', { name: /September 2026/ })).toBeTruthy()
  expect(
    screen.getByRole('region', { name: 'Expenses by month' })
  ).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Add month' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Edit expenses' })).toBeNull()
})

it('edits a month on the admin page and publishes the whole list', async () => {
  const put = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true, message: '' } })
  const user = userEvent.setup()
  renderLedger(true)

  const edit = await screen.findAllByRole('button', { name: 'Edit expenses' })
  await user.click(edit[1])
  const dialog = await screen.findByRole('dialog')
  const amount = within(dialog).getByRole('spinbutton', { name: 'Amount' })
  await user.clear(amount)
  await user.type(amount, '310')
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))

  expect(put).toHaveBeenCalledTimes(1)
  const [url, body] = put.mock.calls[0] as [string, { key: string; value: string }]
  expect(url).toBe('/api/option/')
  expect(body.key).toBe('expense_ledger.months')
  expect(JSON.parse(body.value)).toEqual([
    MONTHS[0],
    { month: '2026-09', items: [{ name: 'Server', amount: 310 }] },
  ])
})

it('refuses a line without a name', async () => {
  const put = vi.spyOn(api, 'put')
  const user = userEvent.setup()
  renderLedger(true)

  await user.click(await screen.findByRole('button', { name: 'Add month' }))
  const dialog = await screen.findByRole('dialog')
  await user.type(within(dialog).getByRole('spinbutton', { name: 'Amount' }), '5')
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))

  expect(put).not.toHaveBeenCalled()
})

it('formats for the interface language codes, which are not Intl tags', () => {
  expect(formatExpenseMonth('2026-10', 'zhCN')).toBe('2026年10月')
  expect(formatExpenseMonth('2026-10', 'zhTW')).toBe('2026年10月')
  expect(formatExpenseAmount(1210, 'zhCN')).toBe('¥1,210.00')
  expect(formatExpenseMonth('2026-10', 'not a tag')).toContain('2026')
})
