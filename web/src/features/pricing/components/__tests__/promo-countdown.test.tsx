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
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

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

it('counts down and says when the offer is over', () => {
  render(<PromoCountdown endsAt={NOW / SECOND + 2 * 86400 + 3 * 3600} />)
  expect(screen.getByText(/Limited time · 2d 3h left/)).toBeTruthy()
  cleanup()

  render(<PromoCountdown endsAt={NOW / SECOND + 90} />)
  expect(screen.getByText(/Limited time · 2m left/)).toBeTruthy()
  act(() => {
    vi.advanceTimersByTime(120 * SECOND)
  })
  expect(screen.getByText('Offer ended')).toBeTruthy()
})
