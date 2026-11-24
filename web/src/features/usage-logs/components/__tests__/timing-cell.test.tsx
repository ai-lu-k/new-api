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
import { afterEach, describe, expect, it } from 'vitest'

import { TimingMetricsCell } from '../timing-metrics-cell'

afterEach(cleanup)

describe('TimingMetricsCell', () => {
  it('drops the first-token line in the compact card when no timing was recorded', () => {
    render(
      <TimingMetricsCell
        useTimeSec={3}
        completionTokens={120}
        isStream
        compact
        indicator='dot'
      />
    )

    expect(screen.queryByText('First token')).toBeNull()
    expect(screen.getByText('Duration')).toBeTruthy()
  })

  it('keeps the first-token line in the desktop cell even without a value', () => {
    render(<TimingMetricsCell useTimeSec={3} completionTokens={120} isStream />)

    expect(screen.getByText('First token')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('prints the recorded first-token time in seconds', () => {
    render(
      <TimingMetricsCell
        useTimeSec={3}
        completionTokens={120}
        frtMs={450}
        isStream
      />
    )

    expect(screen.getByText('Duration')).toBeTruthy()
    expect(screen.queryByText('—')).toBeNull()
  })
})
