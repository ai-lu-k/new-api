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
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { BillingHistoryDialog } from '../dialogs/billing-history-dialog'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
})

it.each([1, 3])(
  'exposes a copyable voucher only while it is usable (status %i)',
  async (status) => {
    useAuthStore.getState().auth.setUser({ id: 7, username: 'reader', role: 1 })
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        success: true,
        data: {
          total: 1,
          items: [
            {
              id: 1,
              user_id: 7,
              trade_no: 'online-payment',
              amount: 10,
              money: 100,
              payment_method: 'alipay',
              status: 'success',
              create_time: 1794240000,
              bonus_redemption: {
                id: 11,
                key: 'campaign-voucher-code',
                quota: 750000,
                status,
                expired_time: 0,
              },
            },
          ],
        },
      },
    })
    const user = userEvent.setup()
    render(<BillingHistoryDialog open onOpenChange={() => undefined} />)
    expect(await screen.findByText(/Double 11 voucher/)).toBeVisible()
    if (status === 3) {
      expect(screen.getByText('Voucher used or unavailable')).toBeVisible()
      expect(
        screen.queryByRole('button', { name: 'Copy voucher code' })
      ).not.toBeInTheDocument()
      return
    }
    await user.click(screen.getByRole('button', { name: 'Copy voucher code' }))
    expect(await navigator.clipboard.readText()).toBe('campaign-voucher-code')
  }
)
