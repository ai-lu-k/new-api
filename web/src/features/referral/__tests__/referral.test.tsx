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
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { ReferralBanner } from '../components/referral-banner'
import { Referral } from '../index'
import type { ReferralOverview } from '../types'

vi.mock('@tanstack/react-router', async () => {
  const React = await import('react')
  return {
    Link: (props: { children?: ReactNode }) =>
      React.createElement('a', { href: '/referral' }, props.children),
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function overview(overrides: Partial<ReferralOverview> = {}): ReferralOverview {
  return {
    aff_code: 'AB12',
    invites: 2,
    rewarded: 2,
    pending: 0,
    invitee_reward_yuan: 3,
    next_reward_yuan: 5,
    available_vouchers: 2,
    ladder: [
      { ordinal: 1, reward_yuan: 1, reached: true, current: false },
      { ordinal: 2, reward_yuan: 3, reached: true, current: true },
      { ordinal: 3, reward_yuan: 5, reached: false, current: false },
      { ordinal: 4, reward_yuan: 1, reached: false, current: false },
    ],
    rewards: [
      {
        id: 7,
        invitee: 'i***e',
        status: 'issued',
        pending_reason: '',
        created_at: 1791972000,
        issued_at: 1791972100,
        inviter_ordinal: 2,
        inviter_reward_yuan: 5,
        voucher_status: 'unopened',
        voucher_expires_at: 1794564000,
      },
    ],
    ...overrides,
  }
}

function renderPage(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>
  )
}

it('renders the referral ladder in yuan, the invite code and the masked reward records', async () => {
  vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: { success: true, data: overview() },
  }))

  renderPage(<Referral />)

  expect(await screen.findByText('Reward ladder')).toBeVisible()
  expect(screen.getByText(/Total invites: 2/)).toBeVisible()
  expect(screen.getByText(/Ladder progress: 2\/4/)).toBeVisible()
  expect(screen.getByText('AB12')).toBeVisible()
  expect(screen.getByText('Invite #1')).toBeVisible()
  expect(screen.getByText('4th invite and later')).toBeVisible()
  expect(screen.getByText(/¥1 \/ ¥3 \/ ¥5/)).toBeVisible()
  expect(screen.getAllByText('¥1')).toHaveLength(2)
  expect(screen.getByText(/Your next friend reward is ¥5\./)).toBeVisible()
  expect(
    screen.getByText(/The invitee also receives a ¥3 voucher\./)
  ).toBeVisible()
  expect(screen.queryByText(/×\d/)).toBeNull()
  expect(screen.getByText('i***e')).toBeVisible()
  expect(screen.getByText('Your voucher')).toBeVisible()
  expect(screen.getByText('Voucher status')).toBeVisible()
  expect(screen.getByText('Issued')).toBeVisible()
  expect(screen.getByText('Unopened')).toBeVisible()
})

it('omits the ladder progress instead of showing 0/0 when no ladder is configured', async () => {
  vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: { success: true, data: overview({ ladder: [] }) },
  }))

  renderPage(<Referral />)

  expect(await screen.findByText('Reward ladder')).toBeVisible()
  expect(screen.queryByText(/Ladder progress/)).toBeNull()
})

it('dismisses the campaign banner on the account so it stays closed', async () => {
  const user = userEvent.setup()
  const post = vi
    .spyOn(api, 'post')
    .mockImplementation(async () => ({ data: { success: true } }))
  const previous = useAuthStore.getState().auth
  useAuthStore.setState({
    auth: {
      ...previous,
      user: {
        id: 1,
        username: 'referrer',
        role: 1,
        referral_banner: 'referral-ladder-1',
      },
    },
  })

  renderPage(<ReferralBanner />)
  expect(await screen.findByText(/the first three friends bring/)).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Close' }))

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/user/referral/banner', {})
  )
  await waitFor(() =>
    expect(useAuthStore.getState().auth.user?.referral_banner).toBe('')
  )
  expect(screen.queryByRole('status')).toBeNull()

  useAuthStore.setState({ auth: previous })
})

it('shows the waiting-for-verification state for a pending reward', async () => {
  vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: {
      success: true,
      data: overview({
        rewarded: 1,
        pending: 1,
        rewards: [
          {
            id: 8,
            invitee: 'p***g',
            status: 'pending',
            pending_reason: 'email_unverified',
            created_at: 1791972000,
            issued_at: 0,
            inviter_ordinal: 0,
            inviter_reward_yuan: 0,
            voucher_status: '',
            voucher_expires_at: 0,
          },
        ],
      }),
    },
  }))

  renderPage(<Referral />)

  expect(
    await screen.findByText('Waiting for email verification')
  ).toBeVisible()
  expect(screen.getByText(/Waiting for verification: 1/)).toBeVisible()
})
