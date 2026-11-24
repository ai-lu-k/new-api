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
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { CouponGrantForm } from '../grant-form'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('previews the audience and total before granting the same idempotent request', async () => {
  const user = userEvent.setup()
  const post = vi.spyOn(api, 'post').mockImplementation(async (url) => {
    if (url === '/api/admin/vouchers/preview') {
      return {
        data: {
          success: true,
          data: {
            recipients: 2,
            vouchers: 2,
            face_value: 2_500_000,
            total_face_value: 5_000_000,
            face_value_yuan: 5,
            total_yuan: 10,
            expires_at: 1_800_000_000,
            audience_digest: 'snapshot',
          },
        },
      }
    }
    return {
      data: {
        success: true,
        data: { id: 4, recipient_count: 2, status: 'complete' },
      },
    }
  })
  render(<CouponGrantForm onCreated={() => {}} />)
  expect(screen.getByLabelText('Face value (yuan)')).toHaveValue(5)
  expect(screen.getByLabelText('Validity (days)')).toHaveValue(30)
  expect(screen.queryByLabelText('Multiplier')).not.toBeInTheDocument()

  await user.type(screen.getByLabelText('Reason'), 'fixture grant')
  await user.click(screen.getByRole('button', { name: 'Preview issuance' }))
  expect(await screen.findByText('2 users · 2 vouchers')).toBeVisible()
  expect(post).not.toHaveBeenCalledWith(
    '/api/admin/vouchers/grant',
    expect.anything(),
    expect.anything()
  )

  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Preview issuance' })
    ).toBeEnabled()
  )
  expect(post).toHaveBeenCalledWith(
    '/api/admin/vouchers/grant',
    expect.objectContaining({
      audience: 'all',
      user_ids: [],
      face_value_yuan: 5,
      validity_days: 30,
      audience_digest: 'snapshot',
      reason: 'fixture grant',
      request_id: expect.any(String),
    }),
    expect.anything()
  )
})

it('sends the chosen face value and validity instead of the defaults', async () => {
  const user = userEvent.setup()
  const post = vi.spyOn(api, 'post').mockImplementation(async (url) => {
    if (url === '/api/admin/vouchers/preview') {
      return {
        data: {
          success: true,
          data: {
            recipients: 1,
            vouchers: 1,
            face_value: 10_000_000,
            total_face_value: 10_000_000,
            face_value_yuan: 20,
            total_yuan: 20,
            expires_at: 1_800_000_000,
            audience_digest: 'snapshot',
          },
        },
      }
    }
    return {
      data: {
        success: true,
        data: { id: 4, recipient_count: 1, status: 'complete' },
      },
    }
  })
  render(<CouponGrantForm onCreated={() => {}} />)
  fireEvent.change(screen.getByLabelText('Face value (yuan)'), {
    target: { value: '20' },
  })
  fireEvent.change(screen.getByLabelText('Validity (days)'), {
    target: { value: '7' },
  })
  await user.type(screen.getByLabelText('Reason'), 'fixture')
  await user.click(screen.getByRole('button', { name: 'Preview issuance' }))
  await screen.findByText('1 users · 1 vouchers')
  await user.click(screen.getByRole('button', { name: 'Continue' }))

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/api/admin/vouchers/grant',
      expect.objectContaining({ face_value_yuan: 20, validity_days: 7 }),
      expect.anything()
    )
  )
})

it('reuses the same request ID when the confirmation is retried after a failure', async () => {
  const user = userEvent.setup()
  let failed = false
  const post = vi.spyOn(api, 'post').mockImplementation(async (url) => {
    if (url === '/api/admin/vouchers/preview') {
      return {
        data: {
          success: true,
          data: {
            recipients: 1,
            vouchers: 1,
            face_value: 2_500_000,
            total_face_value: 2_500_000,
            face_value_yuan: 5,
            total_yuan: 5,
            expires_at: 1_800_000_000,
            audience_digest: 'snapshot',
          },
        },
      }
    }
    if (!failed) {
      failed = true
      throw new Error('Transport failed')
    }
    return {
      data: {
        success: true,
        data: { id: 4, recipient_count: 1, status: 'complete' },
      },
    }
  })
  render(<CouponGrantForm onCreated={() => {}} />)
  await user.type(screen.getByLabelText('Reason'), 'retry fixture')
  await user.click(screen.getByRole('button', { name: 'Preview issuance' }))
  await screen.findByText('1 users · 1 vouchers')

  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
  )
  await user.click(screen.getByRole('button', { name: 'Continue' }))

  const requests = post.mock.calls.filter(
    ([url]) => url === '/api/admin/vouchers/grant'
  )
  expect(requests).toHaveLength(2)
  expect(requests[0][1]).toEqual(requests[1][1])
})

it.each(['0', '1.5', '1001'])(
  'blocks an invalid face value of %s before preview',
  async (value) => {
    const user = userEvent.setup()
    const post = vi.spyOn(api, 'post')
    render(<CouponGrantForm onCreated={() => {}} />)
    fireEvent.change(screen.getByLabelText('Face value (yuan)'), {
      target: { value },
    })
    await user.type(screen.getByLabelText('Reason'), 'fixture')
    const form = screen
      .getByRole('button', { name: 'Preview issuance' })
      .closest('form')
    if (!form) throw new Error('Issuance form missing')
    fireEvent.submit(form)

    expect(
      await screen.findByText('Face value must be between 1 and 1000 yuan')
    ).toBeVisible()
    expect(post).not.toHaveBeenCalled()
  }
)

it.each(['0', '1.5', '366'])(
  'blocks an invalid validity of %s days before preview',
  async (value) => {
    const user = userEvent.setup()
    const post = vi.spyOn(api, 'post')
    render(<CouponGrantForm onCreated={() => {}} />)
    fireEvent.change(screen.getByLabelText('Validity (days)'), {
      target: { value },
    })
    await user.type(screen.getByLabelText('Reason'), 'fixture')
    const form = screen
      .getByRole('button', { name: 'Preview issuance' })
      .closest('form')
    if (!form) throw new Error('Issuance form missing')
    fireEvent.submit(form)

    expect(
      await screen.findByText('Validity must be between 1 and 365 days')
    ).toBeVisible()
    expect(post).not.toHaveBeenCalled()
  }
)
