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
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import {
  PlanUsageOverview,
  PlanUsageTrendPanel,
  PlanUsageUsers,
  type PlanTrendUser,
} from '..'
import type { PlanUserUsage } from '../api'

const user: PlanUserUsage = {
  user_id: 42,
  username: 'plan-user',
  display_name: 'A long display name for the plan user',
  status: 1,
  activated: true,
  wallet_fallback: true,
  level: 2,
  base_quota: 500000,
  multiplier: 3,
  total_quota: 1500000,
  used_quota: 500000,
  reserved_quota: 250000,
  remaining_quota: 1000000,
  wallet_used_quota: 250000,
  week_start: 1791820800,
  resets_at: 1792425600,
  personal_cycle: true,
  coupon_cycle: true,
}
const clients: QueryClient[] = []
afterEach(async () => {
  cleanup()
  clients.forEach((client) => client.clear())
  clients.length = 0
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  await i18n.changeLanguage('en')
})

// The panels keep their own contracts; the page that arranges them is covered
// by the administrator page tests.
function StatisticsSections() {
  const [user, setUser] = useState<PlanTrendUser | null>(null)
  return (
    <>
      <PlanUsageOverview identity='admin:session' />
      <PlanUsageUsers
        identity='admin:session'
        onSelectUser={setUser}
        onGrantCoupons={() => {}}
      />
      <PlanUsageTrendPanel
        identity='admin:session'
        user={user}
        onClearUser={() => setUser(null)}
      />
    </>
  )
}

function renderStatistics() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  return render(
    <QueryClientProvider client={client}>
      <StatisticsSections />
    </QueryClientProvider>
  )
}

function mockStatistics(options: { empty?: boolean; fail?: boolean } = {}) {
  return vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
    if (options.fail) {
      return { data: { success: false, message: 'Statistics unavailable' } }
    }
    if (url.endsWith('/overview')) {
      return {
        data: {
          success: true,
          data: {
            users: 2,
            activated_users: 1,
            total_quota: 1500000,
            used_quota: 500000,
            reserved_quota: 250000,
            remaining_quota: 1000000,
            wallet_used_quota: 250000,
            as_of: 1792022400,
          },
        },
      }
    }
    if (url.endsWith('/users')) {
      const page = (config?.params as { page?: number })?.page ?? 1
      const search = (config?.params as { search?: string })?.search ?? ''
      return {
        data: {
          success: true,
          data: {
            items:
              options.empty || search === 'missing'
                ? []
                : [
                    {
                      ...user,
                      username: page === 1 ? 'plan-user' : 'second-user',
                    },
                  ],
            total: options.empty || search === 'missing' ? 0 : 21,
          },
        },
      }
    }
    if (url.endsWith('/trend')) {
      return {
        data: {
          success: true,
          data: {
            days: options.empty
              ? []
              : [
                  {
                    date: '2026-10-13',
                    requests: 0,
                    free_used: null,
                    wallet_used: null,
                  },
                  {
                    date: '2026-10-14',
                    requests: 1,
                    free_used: 500000,
                    wallet_used: 250000,
                  },
                ],
            total: { requests: 1, free_used: 500000, wallet_used: 250000 },
            undated: { requests: 2, free_used: 1000000, wallet_used: 500000 },
          },
        },
      }
    }
    throw new Error(`Unexpected URL: ${url}`)
  })
}

it('shows current cycles separately from daily totals and labels missing historical dates', async () => {
  const get = mockStatistics()
  const post = vi.spyOn(api, 'post')
  renderStatistics()
  const overview = await screen.findByRole('region', {
    name: 'Current cycle overview',
  })
  expect(await within(overview).findByText('Free plan usage')).toBeVisible()
  // Four figures on one hairline row: two columns on phones, four on desktop,
  // instead of four tall icon cards.
  expect(overview.querySelector('[data-slot=stat-row]')).not.toBeNull()
  expect(
    within(overview)
      .getByText('Activated plans')
      .closest('[data-slot=stat-row]')
  ).not.toBeNull()
  const users = await screen.findByRole('region', { name: 'User details' })
  expect(await within(users).findByText('plan-user')).toBeVisible()
  expect(
    within(users).queryByRole('columnheader', { name: 'Level' })
  ).not.toBeInTheDocument()
  expect(within(users).getByText('Personal seven-day cycle')).toBeVisible()
  expect(within(users).getByText('Pending reservations')).toBeVisible()
  const daily = await screen.findByRole('table', {
    name: 'Daily usage details',
  })
  // A day inside the range without a settlement is not ranked as a row: it used
  // to repeat the missing-date note per column and push the dated days below
  // the fold. Only days with figures are listed, and the note appears above.
  expect(within(daily).getByRole('row', { name: /2026-10-14/ })).toBeVisible()
  expect(
    within(daily).queryByRole('row', { name: /2026-10-13/ })
  ).not.toBeInTheDocument()
  expect(
    within(daily).queryByText('No dated settlements')
  ).not.toBeInTheDocument()
  expect(screen.getByRole('note')).toHaveTextContent(
    'Undated historical settlements'
  )
  expect(
    get.mock.calls.every(([url]) =>
      url.startsWith('/api/token-plan/statistics/')
    )
  ).toBe(true)
  expect(post).not.toHaveBeenCalled()
})

it('keeps the four overview figures on one baseline when a caption wraps on a phone', async () => {
  mockStatistics()
  renderStatistics()
  const overview = await screen.findByRole('region', {
    name: 'Current cycle overview',
  })
  const cells = overview.querySelectorAll<HTMLElement>(
    '[data-slot=stat-row] > div'
  )
  expect(cells).toHaveLength(4)
  for (const cell of cells) {
    // Cells stretch to the tallest caption in their row, so the figure is
    // pinned to the bottom instead of following the caption's line count.
    expect(cell).toHaveClass('flex', 'flex-col', 'justify-between')
    expect(cell.lastElementChild?.tagName).toBe('DD')
  }
})

it('paginates on the server, resets pagination when searching, and switches between user and global trends', async () => {
  const get = mockStatistics()
  const actor = userEvent.setup()
  renderStatistics()
  expect(await screen.findByText('plan-user')).toBeVisible()
  await actor.click(screen.getByRole('button', { name: 'Go to next page' }))
  expect(await screen.findByText('second-user')).toBeVisible()
  await actor.click(screen.getByRole('button', { name: 'View trend' }))
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith(
      '/api/token-plan/statistics/trend',
      expect.objectContaining({
        params: expect.objectContaining({ user_id: 42 }),
      })
    )
  )
  await actor.click(screen.getByRole('button', { name: 'All users' }))
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'All users' })
    ).not.toBeInTheDocument()
  )
  await actor.type(
    screen.getByPlaceholderText('Search by user ID or username'),
    'missing'
  )
  expect(await screen.findByText('No users found')).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Go to previous page' })
  ).toBeDisabled()
  expect(get).toHaveBeenCalledWith(
    '/api/token-plan/statistics/users',
    expect.objectContaining({
      params: { search: 'missing', min_level: 0, page: 1, size: 20 },
    })
  )
})

it('asks for every account instead of a level-filtered page while levels are offline', async () => {
  const get = mockStatistics()
  renderStatistics()

  expect(await screen.findByText('plan-user')).toBeVisible()
  expect(
    screen.queryByRole('checkbox', { name: 'Hide LV0 (unused) accounts' })
  ).not.toBeInTheDocument()
  expect(get).toHaveBeenCalledWith(
    '/api/token-plan/statistics/users',
    expect.objectContaining({
      params: expect.objectContaining({ min_level: 0, page: 1 }),
    })
  )
})

it('shows retry controls on business errors without presenting zero usage', async () => {
  const get = mockStatistics({ fail: true })
  renderStatistics()
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(3)
  )
  expect(
    screen.queryByRole('table', { name: 'Daily usage details' })
  ).not.toBeInTheDocument()
  get.mockImplementation(async () => {
    throw new Error('network unavailable')
  })
  fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0])
  await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(3))
  expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(3)
})

it('shows empty states and disables pagination when there are no matching users or dated settlements', async () => {
  mockStatistics({ empty: true })
  renderStatistics()
  expect(await screen.findByText('No users found')).toBeVisible()
  expect(await screen.findByText('No dated settlements')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Go to previous page' })
  ).toBeDisabled()
})

it('uses Shanghai dates when the browser is on the previous day and prevents applying an incomplete range', async () => {
  vi.stubEnv('TZ', 'America/Los_Angeles')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T16:30:00Z'))
  mockStatistics()
  const actor = userEvent.setup()
  renderStatistics()
  await screen.findByText('plan-user')
  const end = screen.getByRole('group', { name: 'End date' })
  expect(
    within(end).getByRole('button', { name: 'End date' })
  ).toHaveTextContent('2026-10-16')
  await actor.click(within(end).getByRole('button'))
  const selected = screen.getByRole('gridcell', { selected: true })
  expect(within(selected).getByRole('button')).toBeEnabled()
  await actor.click(within(selected).getByRole('button'))
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Select a valid range of up to 93 days.'
  )
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
})

it('shows a loading state while statistics are pending and replaces it with recorded data', async () => {
  const get = mockStatistics()
  const respond = get.getMockImplementation()
  if (!respond) throw new Error('Missing network fixture')
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  get.mockImplementation(async (url, config) => {
    await gate
    return respond(url, config)
  })
  renderStatistics()
  expect(screen.getByText('Loading...')).toBeVisible()
  expect(screen.queryByText('plan-user')).not.toBeInTheDocument()
  release()
  expect(await screen.findByText('plan-user')).toBeVisible()
  expect(
    await screen.findByRole('table', { name: 'Daily usage details' })
  ).toBeVisible()
})

it.each(['zhCN', 'zhTW'])(
  'uses localized calendar months after switching the interface to %s',
  async (language) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-15T16:30:00Z'))
    mockStatistics()
    const actor = userEvent.setup()
    renderStatistics()
    await screen.findByText('plan-user')
    await act(async () => {
      await i18n.changeLanguage(language)
    })
    await actor.click(
      within(screen.getByRole('group', { name: 'End date' })).getByRole(
        'button'
      )
    )
    expect(screen.getByRole('option', { name: '10月' })).toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: 'Oct' })
    ).not.toBeInTheDocument()
  }
)
