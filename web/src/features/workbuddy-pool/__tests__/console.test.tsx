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
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { WorkBuddyPool } from '..'
import type { WorkBuddyAccount } from '../types'

vi.mock('@visactor/react-vchart', () => ({
  VChart: () => <div data-testid='chart' />,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { to: string; children: React.ReactNode }) => (
    <a href={props.to}>{props.children}</a>
  ),
}))

function makeAccount(
  overrides: Partial<WorkBuddyAccount> = {}
): WorkBuddyAccount {
  return {
    uid: 'acct-ready',
    nickname: '173****5437',
    domain: 'www.codebuddy.cn',
    realm: 'cn',
    platform: 'CLI',
    product: 'workbuddy',
    enterpriseId: '',
    enabled: true,
    tasksEnabled: true,
    weight: 1,
    note: '',
    disabledModels: [],
    source: 'oauth',
    apiKey: false,
    credentialMask: '',
    proxySlot: '',
    proxy: '',
    expiresAt: 1794390214,
    expiresIn: '13 days',
    tokenExpired: false,
    needRelogin: false,
    hasRefreshToken: true,
    lastError: '',
    lastErrorDetail: null,
    inCooldown: false,
    cooldownFor: null,
    restrictedFor: null,
    modelCooldowns: [],
    softStreak: 0,
    unscopedStreak: 0,
    breakerFor: null,
    degradeFor: null,
    fails: 0,
    failWindow: 600,
    lastFailFor: null,
    addedAt: 1791971021,
    file: 'acct-ready.json',
    credits: {
      remain: 2862.64,
      used: 1653.36,
      size: 4516,
      remain_percent: '63.4%',
      used_percent: '36.6%',
      is_paid_user: false,
      checkin: {
        today_checked_in: true,
        streak_days: 16,
        daily_credit: 100,
        today_credit: 100,
        active: true,
      },
      earliest_expiring: {
        name: 'Starter pack',
        package_code: 'pkg',
        remain: 373.09,
        cycle_end_time: '2026-11-14 17:43:42',
        days_left: 16.3,
      },
    },
    ...overrides,
  }
}

let accounts: WorkBuddyAccount[] = []

beforeEach(() => {
  accounts = [makeAccount()]
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/workbuddy/status') {
      return {
        data: {
          success: true,
          data: {
            enabled: true,
            configured: true,
            base_url: '',
            reachable: true,
          },
        },
      }
    }
    if (url === '/api/workbuddy/call/accounts') {
      return { data: { success: true, data: { accounts } } }
    }
    throw new Error(`Unexpected request: ${url}`)
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderConsole() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WorkBuddyPool tab='accounts' />
    </QueryClientProvider>
  )
}

/**
 * The pool summary answers two different questions at once: what every account
 * holds, and what the gateway may actually route to right now. A blocked
 * account has to leave the second number alone without vanishing from the list.
 */
it('counts only routable accounts as available credit', async () => {
  accounts = [
    makeAccount(),
    makeAccount({
      uid: 'acct-blocked',
      nickname: '158****1287',
      reserveBlocked: true,
      credits: {
        remain: 1000,
        used: 0,
        size: 1000,
        remain_percent: '100%',
        used_percent: '0%',
        is_paid_user: false,
      },
    }),
  ]
  renderConsole()

  const rows = await screen.findAllByText(/173\*\*\*\*5437|158\*\*\*\*1287/)
  expect(rows.length).toBe(2)
  // 2862.64 is routable, the blocked 1000 is not, while the total keeps both.
  expect((await screen.findAllByText(/2,862\.64/)).length).toBeGreaterThan(0)
  expect(await screen.findByText(/of 3,862\.64 in total/)).toBeVisible()
})

/**
 * An empty pool must say so instead of rendering an empty card, because the
 * operator's next step is to import or sign in.
 */
it('explains an empty pool instead of showing a blank list', async () => {
  accounts = []
  renderConsole()

  expect(await screen.findByText('No WorkBuddy accounts yet')).toBeVisible()
})

/**
 * A failing gateway call has to surface as an error state, not as an empty pool,
 * so a broken connection is not mistaken for a pool that lost its accounts.
 */
it('shows an error state when the gateway refuses the account list', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/workbuddy/status') {
      return {
        data: {
          success: true,
          data: {
            enabled: true,
            configured: true,
            base_url: '',
            reachable: true,
          },
        },
      }
    }
    return {
      data: { success: false, message: 'panel password required' },
    }
  })
  renderConsole()

  expect(await screen.findByText(/panel password required/i)).toBeVisible()
})

/**
 * Every row carries the credit figure and the upstream sign-in state, because
 * those two numbers decide whether traffic keeps flowing to that account.
 */
it('shows each account with its remaining credit and login state', async () => {
  renderConsole()

  expect(await screen.findByText('173****5437')).toBeVisible()
  expect(await screen.findByText(/Expires in 13d/)).toBeVisible()
  expect((await screen.findAllByText(/2,862\.64/)).length).toBeGreaterThan(0)
})

/**
 * Check-in belongs to the gateway schedule, so the console must not offer a
 * manual button that could double-sign a pool the scheduler already handled.
 */
it('does not offer a manual check-in on any account row', async () => {
  renderConsole()

  await screen.findByText('173****5437')
  expect(screen.queryByRole('button', { name: /check in/i })).toBeNull()
})

/**
 * A dead upstream credential is the one case the operator has to act on, so the
 * row carries the re-sign-in action; a healthy row must not.
 */
it('offers re-sign-in only for accounts whose credential died', async () => {
  accounts = [
    makeAccount(),
    makeAccount({
      uid: 'acct-expired',
      nickname: '195****9570',
      tokenExpired: true,
      expiresIn: 'expired',
    }),
  ]
  renderConsole()

  await screen.findByText('195****9570')
  const buttons = screen.getAllByRole('button', { name: 'Sign in again' })
  expect(buttons).toHaveLength(1)
})
