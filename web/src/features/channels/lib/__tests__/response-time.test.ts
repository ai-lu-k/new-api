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
import { describe, expect, it } from 'vitest'

import { RESPONSE_TIME_ABNORMAL_MS } from '../../constants'
import { getResponseTimeConfig } from '../channel-utils'

describe('channel response time severity', () => {
  it('treats slow but answered channels as neutral', () => {
    // 7.78 s used to be painted as a fault; it is only a slow answer.
    expect(getResponseTimeConfig(7780).variant).toBe('neutral')
    expect(getResponseTimeConfig(2450).variant).toBe('neutral')
    expect(getResponseTimeConfig(9999).variant).toBe('neutral')
  })

  it('raises the single alarm at ten seconds', () => {
    expect(RESPONSE_TIME_ABNORMAL_MS).toBe(10_000)
    expect(getResponseTimeConfig(10_000).variant).toBe('danger')
    expect(getResponseTimeConfig(29_650).variant).toBe('danger')
  })

  it('keeps an untested channel distinct from a fast one', () => {
    expect(getResponseTimeConfig(0).label).toBe('Not tested')
    expect(getResponseTimeConfig(0).variant).toBe('neutral')
  })
})
