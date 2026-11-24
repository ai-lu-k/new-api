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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'

import type { UsageSource } from '../../../types'
import { GiftCreditHint } from '../gift-credit-hint'

const SOURCE: UsageSource = {
  gift_used: 100_000_000,
  token_plan_used: 25_000_000,
  gift_plan_used: 125_000_000,
  gift_quota: 400_000_000,
  gift_remaining: 100_000_000,
  gift_known: true,
}

it('marks the gift share of the remaining credit and splits it on demand', async () => {
  render(<GiftCreditHint creditRemaining={500_000_000} usageSource={SOURCE} />)

  const label = screen.getByText('Gift credit $200.00')
  expect(label).toHaveClass('text-[13px]', 'text-muted-foreground', 'underline')
  await userEvent.click(
    screen.getByRole('button', { name: 'Gift credit $200.00' })
  )

  const details = await screen.findByRole('dialog', { name: 'Quota details' })
  expect(within(details).getByText('Credit remaining')).toBeVisible()
  expect(within(details).getByText('$1,000.00')).toBeVisible()
  expect(within(details).getByText('Gift credit')).toBeVisible()
  expect(within(details).getByText('$200.00')).toBeVisible()
  expect(within(details).getByText('Paid balance')).toBeVisible()
  expect(within(details).getByText('$800.00')).toBeVisible()
})

it('renders nothing when the gift share is a known zero', () => {
  const { container } = render(
    <GiftCreditHint
      creditRemaining={1}
      usageSource={{ ...SOURCE, gift_remaining: 0 }}
    />
  )

  expect(container).toBeEmptyDOMElement()
})

it('renders nothing while the breakdown is missing', () => {
  const { container } = render(<GiftCreditHint creditRemaining={1} />)

  expect(container).toBeEmptyDOMElement()
})
