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
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { RewardLadderCard } from '../components/reward-ladder-card'
import type { ReferralLadderStep } from '../types'

let shouldReduceMotion = true
const listeners = new Set<() => void>()
const reducedMotionMediaQuery = {
  get matches() {
    return shouldReduceMotion
  },
  media: '(prefers-reduced-motion: reduce)',
  onchange: null,
  addEventListener: (_type: string, listener: () => void) => {
    listeners.add(listener)
  },
  removeEventListener: (_type: string, listener: () => void) => {
    listeners.delete(listener)
  },
  addListener: (listener: () => void) => {
    listeners.add(listener)
  },
  removeListener: (listener: () => void) => {
    listeners.delete(listener)
  },
  dispatchEvent: () => false,
}

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: () => reducedMotionMediaQuery,
})

/** Flip the OS switch before rendering: motion only learns about it by event. */
function setReducedMotion(value: boolean) {
  shouldReduceMotion = value
  for (const listener of listeners) listener()
}

const LADDER: ReferralLadderStep[] = [
  { ordinal: 1, reward_yuan: 1, reached: true, current: false },
  { ordinal: 2, reward_yuan: 3, reached: false, current: true },
  { ordinal: 3, reward_yuan: 5, reached: false, current: false },
]

function entranceStyles(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('[style]')]
    .map((element) => element.getAttribute('style') ?? '')
    .filter((style) => style.includes('opacity'))
}

afterEach(() => {
  setReducedMotion(true)
})

describe('the reward ladder entrance', () => {
  it('moves each step in when motion is allowed', () => {
    setReducedMotion(false)
    const { container } = render(
      <RewardLadderCard
        ladder={LADDER}
        inviteeRewardYuan={3}
        nextRewardYuan={1}
      />
    )

    // The entrance starts at a partial opacity; a still page would not.
    expect(entranceStyles(container).length).toBeGreaterThan(0)
  })

  it('renders the steps still when the reader asked for less motion', () => {
    setReducedMotion(true)
    const { container } = render(
      <RewardLadderCard
        ladder={LADDER}
        inviteeRewardYuan={3}
        nextRewardYuan={1}
      />
    )

    expect(entranceStyles(container)).toHaveLength(0)
  })
})
