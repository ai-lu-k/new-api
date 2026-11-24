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
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { formatTimestampToDate } from '@/lib/format'

import { promoTimeLeft } from '../../lib/model-helpers'
import { PromoCountdown } from '../promo-countdown'

const NOW = Date.UTC(2026, 9, 5, 8, 0, 0)
const SECOND = 1000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('breaks the time left into the units worth showing', () => {
  const at = (seconds: number) => promoTimeLeft(NOW / SECOND + seconds, NOW)
  expect(at(2 * 86400 + 3 * 3600 + 20 * 60)).toEqual({
    days: 2,
    hours: 3,
    minutes: 20,
  })
  expect(at(59)).toEqual({ days: 0, hours: 0, minutes: 1 })
  expect(at(0)).toBeNull()
  expect(at(-5)).toBeNull()
})

it('shows nothing for a model without an offer', () => {
  const { container } = render(<PromoCountdown endsAt={undefined} />)
  expect(container.textContent).toBe('')
})

it('keeps the badge short while the remaining time stays in its label', () => {
  render(<PromoCountdown endsAt={NOW / SECOND + 2 * 86400 + 3 * 3600} />)

  expect(screen.getByLabelText(/Limited time · 2d 3h left/)).toBeTruthy()
  expect(screen.getByText('Limited time')).toBeTruthy()
  expect(screen.queryByText(/2d 3h left/)).toBeNull()
})

it('reveals the remaining time and end date on hover', async () => {
  // Real timers: the tooltip's open transition does not run on fake ones.
  vi.useRealTimers()
  const user = userEvent.setup()
  const endsAt = Math.floor(Date.now() / SECOND) + 90
  render(<PromoCountdown endsAt={endsAt} />)

  await user.hover(screen.getByLabelText(/Limited time · 2m left/))

  expect(await screen.findByText('2m left')).toBeTruthy()
  expect(
    screen.getByText(formatTimestampToDate(endsAt), { exact: false })
  ).toBeTruthy()
})

it('counts down and says when the offer is over', () => {
  render(<PromoCountdown endsAt={NOW / SECOND + 90} />)
  expect(screen.getByLabelText(/Limited time · 2m left/)).toBeTruthy()
  act(() => {
    vi.advanceTimersByTime(120 * SECOND)
  })
  expect(screen.getByText('Offer ended')).toBeTruthy()
  expect(screen.getByLabelText('Offer ended')).toBeTruthy()
})
