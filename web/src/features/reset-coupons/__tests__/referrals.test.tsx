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
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import type { AdminReferralReward } from '../api'
import { ResetCouponsPanel } from '../index'
import { ReferralRewards } from '../referrals'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function referralReward(
  overrides: Partial<AdminReferralReward> = {}
): AdminReferralReward {
  return {
    id: 11,
    inviter_id: 2,
    invitee_id: 3,
    inviter: 'alice',
    invitee: 'bob',
    status: 'pending',
    pending_reason: '',
    note: '',
    inviter_ordinal: 2,
    inviter_reward_yuan: 5,
    invitee_reward_yuan: 3,
    created_at: 1791972000,
    issued_at: 0,
    invitee_voucher_status: 'unopened',
    inviter_voucher_status: '',
    invitee_voucher_expires_at: 1792576800,
    inviter_voucher_expires_at: 0,
    ...overrides,
  }
}

function renderWithinClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>
  )
}

function renderRewards() {
  return renderWithinClient(<ReferralRewards />)
}

it('renders the referral rows returned by the server with their yuan rewards and voucher states', async () => {
  vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: { success: true, data: { items: [referralReward()], total: 1 } },
  }))

  renderRewards()

  const table = await screen.findByRole('table')
  expect(within(table).getByText('alice')).toBeVisible()
  expect(within(table).getByText('bob')).toBeVisible()
  expect(within(table).getByText('#11')).toBeVisible()
  expect(within(table).getByText('Pending')).toBeVisible()
  expect(within(table).getByText('¥5')).toBeVisible()
  expect(within(table).getByText('¥3')).toBeVisible()
  expect(within(table).getByText('Unopened')).toBeVisible()
})

it('labels every voucher state an administrator can see', async () => {
  vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: {
      success: true,
      data: {
        items: [
          referralReward({
            id: 21,
            inviter_voucher_status: 'unopened',
            invitee_voucher_status: '',
          }),
          referralReward({
            id: 22,
            inviter_voucher_status: 'opened',
            invitee_voucher_status: '',
          }),
          referralReward({
            id: 23,
            inviter_voucher_status: 'expired',
            invitee_voucher_status: '',
          }),
          referralReward({
            id: 24,
            inviter_voucher_status: 'legacy',
            invitee_voucher_status: '',
          }),
        ],
        total: 4,
      },
    },
  }))

  renderRewards()

  const table = await screen.findByRole('table')
  for (const label of ['Unopened', 'Opened', 'Expired', 'Legacy coupon']) {
    expect(within(table).getByText(label)).toBeVisible()
  }
})

it('reissues a pending reward through the confirmation dialog and refreshes the list', async () => {
  const user = userEvent.setup()
  const get = vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: { success: true, data: { items: [referralReward()], total: 1 } },
  }))
  const post = vi.spyOn(api, 'post').mockImplementation(async () => ({
    data: {
      success: true,
      data: referralReward({ status: 'issued', issued_at: 1791975600 }),
    },
  }))

  renderRewards()
  await user.click(await screen.findByRole('button', { name: 'Reissue' }))

  expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible()
  expect(post).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: 'Continue' }))

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/api/reset-coupons/referrals/11/reissue',
      undefined,
      expect.anything()
    )
  )
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
})

it('does not reissue a reward whose invitee email is unverified', async () => {
  const user = userEvent.setup()
  vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: {
      success: true,
      data: {
        items: [referralReward({ pending_reason: 'email_unverified' })],
        total: 1,
      },
    },
  }))
  const post = vi.spyOn(api, 'post')

  renderRewards()

  const reissue = await screen.findByRole('button', { name: 'Reissue' })
  expect(reissue).toBeDisabled()
  expect(
    screen.getByText(
      'The invitee email is not verified, so this reward cannot be reissued.'
    )
  ).toBeVisible()

  await user.click(reissue)

  expect(
    screen.queryByRole('button', { name: 'Continue' })
  ).not.toBeInTheDocument()
  expect(post).not.toHaveBeenCalled()
})

it('keeps the reissue action available when the inviter is disabled', async () => {
  const user = userEvent.setup()
  vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: {
      success: true,
      data: {
        items: [referralReward({ note: 'inviter_disabled' })],
        total: 1,
      },
    },
  }))
  const post = vi.spyOn(api, 'post').mockImplementation(async () => ({
    data: { success: true, data: referralReward({ status: 'issued' }) },
  }))

  renderRewards()

  const reissue = await screen.findByRole('button', { name: 'Reissue' })
  expect(reissue).toBeEnabled()
  expect(
    screen.getByText(
      'The inviter is disabled, so only the invitee voucher was issued.'
    )
  ).toBeVisible()

  await user.click(reissue)
  await user.click(screen.getByRole('button', { name: 'Continue' }))

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/api/reset-coupons/referrals/11/reissue',
      undefined,
      expect.anything()
    )
  )
})

it('hides the reissue action for an already issued reward', async () => {
  vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: {
      success: true,
      data: {
        items: [
          referralReward({
            status: 'issued',
            issued_at: 1791975600,
            inviter_reward_yuan: 5,
          }),
        ],
        total: 1,
      },
    },
  }))

  renderRewards()

  expect(
    within(await screen.findByRole('table')).getByText('Issued')
  ).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Reissue' })
  ).not.toBeInTheDocument()
})

it('mounts the referral rewards tab from the reset coupons page on demand', async () => {
  const user = userEvent.setup()
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/admin/vouchers/batches') {
      return { data: { success: true, data: { items: [], total: 0 } } }
    }
    return {
      data: { success: true, data: { items: [referralReward()], total: 1 } },
    }
  })

  renderWithinClient(
    <ResetCouponsPanel recipient={null} onClearRecipient={() => {}} />
  )

  expect(screen.getByRole('tab', { name: 'Voucher batches' })).toBeVisible()
  expect(screen.getByRole('tab', { name: 'Referral rewards' })).toBeVisible()
  expect(get).not.toHaveBeenCalledWith(
    '/api/reset-coupons/referrals',
    expect.anything()
  )

  await user.click(screen.getByRole('tab', { name: 'Referral rewards' }))

  expect(await screen.findByText('alice')).toBeVisible()
  expect(get).toHaveBeenCalledWith(
    '/api/reset-coupons/referrals',
    expect.objectContaining({
      params: { page: 1, size: 20, status: '' },
    })
  )
})

it('shows registration verification reasons and issuance results in the administrator tab', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (path) => ({
    data: {
      success: true,
      data:
        path === '/api/reset-coupons/registration-rewards'
          ? {
              items: [
                {
                  user_id: 12,
                  inviter_id: 2,
                  reason: 'ip_velocity;device_reuse',
                  created_at: 1791972000,
                  verified_at: 1791972100,
                  issued_at: 0,
                },
              ],
              total: 1,
            }
          : { items: [], total: 0 },
    },
  }))
  const user = userEvent.setup()
  renderWithinClient(
    <ResetCouponsPanel recipient={null} onClearRecipient={() => {}} />
  )
  await user.click(
    screen.getByRole('tab', { name: 'Registration verification' })
  )
  expect(
    await screen.findByText('Repeated registrations from this IP')
  ).toBeVisible()
  expect(
    screen.getByText('Repeated registrations from this browser')
  ).toBeVisible()
  expect(screen.getByText('Pending')).toBeVisible()
})
