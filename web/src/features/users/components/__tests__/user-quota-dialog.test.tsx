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

import { UserQuotaDialog } from '../user-quota-dialog'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderDialog() {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, message: '' } })
  render(
    <UserQuotaDialog
      open
      onOpenChange={() => {}}
      userId={7}
      currentQuota={0}
      onSuccess={() => {}}
    />
  )
  return post
}

it('does not add quota until a reason is chosen', async () => {
  const post = renderDialog()
  const user = userEvent.setup()

  await user.type(screen.getByRole('spinbutton'), '10')
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  expect(post).not.toHaveBeenCalled()

  await user.click(screen.getByRole('radio', { name: 'Gift' }))
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  expect(post).toHaveBeenCalledTimes(1)
  const body = post.mock.calls[0][1] as Record<string, unknown>
  expect(body).toMatchObject({ id: 7, mode: 'add', reason: 'gift' })
  expect(body).not.toHaveProperty('paid_amount')
})

it('sends the amount received for a paid addition, the quota value by default', async () => {
  const post = renderDialog()
  const user = userEvent.setup()

  await user.type(screen.getByRole('spinbutton'), '10')
  await user.click(screen.getByRole('radio', { name: 'Paid offline' }))
  await user.type(screen.getByLabelText('Note (optional)'), 'bank transfer')
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  expect(post.mock.calls[0][1]).toMatchObject({
    reason: 'offline_payment',
    reason_note: 'bank transfer',
    paid_amount: 10,
  })

  cleanup()
  const second = renderDialog()
  await user.type(screen.getByRole('spinbutton'), '10')
  await user.click(screen.getByRole('radio', { name: 'Paid offline' }))
  await user.type(screen.getByLabelText('Amount received (CNY)'), '8.5')
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  expect(second.mock.calls.at(-1)?.[1]).toMatchObject({ paid_amount: 8.5 })
})

it('asks for a note when the reason is Other, and no reason when subtracting', async () => {
  const post = renderDialog()
  const user = userEvent.setup()

  await user.type(screen.getByRole('spinbutton'), '10')
  await user.click(screen.getByRole('radio', { name: 'Other' }))
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  expect(post).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: 'Subtract' }))
  expect(screen.queryByRole('radiogroup')).toBeNull()
  await user.type(screen.getByRole('spinbutton'), '4')
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  const body = post.mock.calls[0][1] as Record<string, unknown>
  expect(body).toMatchObject({ mode: 'subtract' })
  expect(body).not.toHaveProperty('reason')
})
