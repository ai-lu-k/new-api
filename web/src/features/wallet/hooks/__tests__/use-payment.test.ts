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
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { PAYMENT_TYPES } from '../../constants'
import { requestPaymentQuote, usePayment } from '../use-payment'

afterEach(() => vi.restoreAllMocks())

describe('payment amount routing', () => {
  test('uses the dedicated Waffo amount calculator', async () => {
    const calls: string[] = []
    const amount = await requestPaymentQuote(120, PAYMENT_TYPES.WAFFO, {
      regular: async () => {
        calls.push('regular')
        return { success: true, data: '1' }
      },
      stripe: async () => {
        calls.push('stripe')
        return { success: true, data: '2' }
      },
      waffo: async (request) => {
        calls.push(`waffo:${request.amount}`)
        return { success: true, data: '18.75' }
      },
      waffoPancake: async () => {
        calls.push('pancake')
        return { success: true, data: '4' }
      },
    })

    expect(amount.amount).toBe(18.75)
    expect(calls).toEqual(['waffo:120'])
  })
})

test('ignores an older quote after the reader chooses a new top-up amount', async () => {
  let resolveOldQuote: ((value: unknown) => void) | undefined
  const oldQuote = new Promise<unknown>((resolve) => {
    resolveOldQuote = resolve
  })
  vi.spyOn(api, 'post')
    .mockImplementationOnce(() => oldQuote as ReturnType<typeof api.post>)
    .mockResolvedValueOnce({
      data: {
        success: true,
        data: '50.00',
        payment_currency: 'CNY',
        campaign_bonus_quota: 1250000,
      },
    })
  const hook = renderHook(() => usePayment())
  let pending: Promise<number> | undefined
  act(() => {
    pending = hook.result.current.calculatePaymentAmount(100, 'alipay')
  })
  await act(async () => {
    await hook.result.current.calculatePaymentAmount(50, 'alipay')
  })
  await act(async () => {
    if (!resolveOldQuote) throw new Error('The first quote was not requested')
    resolveOldQuote({
      data: {
        success: true,
        data: '100.00',
        payment_currency: 'CNY',
        campaign_bonus_quota: 7500000,
      },
    })
    await pending
  })
  expect(hook.result.current.amount).toBe(50)
  expect(hook.result.current.campaignBonusQuota).toBe(1250000)
  expect(hook.result.current.calculating).toBe(false)
})

test.each(['USD', undefined])(
  'does not advertise a CNY gift for payment currency %s',
  async (currency) => {
    vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        success: true,
        data: '100.00',
        payment_currency: currency,
        campaign_bonus_quota: 7500000,
      },
    })
    const hook = renderHook(() => usePayment())
    await act(async () => {
      await hook.result.current.calculatePaymentAmount(100, 'alipay')
    })
    expect(hook.result.current.campaignBonusQuota).toBeUndefined()
  }
)
