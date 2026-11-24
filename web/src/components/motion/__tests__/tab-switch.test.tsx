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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { TabSwitch, type TabSwitchItem } from '../tab-switch'

const TABS: TabSwitchItem[] = [
  { value: 'keys', label: 'Keys', content: <p>key list</p> },
  { value: 'usage', label: 'Usage', content: <p>usage panel</p> },
]

function Harness(props: { onValueChange?: (value: string) => void }) {
  const [value, setValue] = useState('keys')

  return (
    <TabSwitch
      value={value}
      onValueChange={(next) => {
        setValue(next)
        props.onValueChange?.(next)
      }}
      ariaLabel='Key detail'
      tabs={TABS}
    />
  )
}

describe('TabSwitch', () => {
  it('keeps the tab list an accessible, named tablist with one selected tab', () => {
    render(<Harness />)

    const list = screen.getByRole('tablist', { name: 'Key detail' })
    expect(list).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Keys' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('tab', { name: 'Usage' })).toHaveAttribute(
      'aria-selected',
      'false'
    )
  })

  it('reports the chosen value and reveals that panel', async () => {
    const onValueChange = vi.fn()
    render(<Harness onValueChange={onValueChange} />)

    expect(screen.getByText('key list')).toBeVisible()
    await userEvent.click(screen.getByRole('tab', { name: 'Usage' }))

    expect(onValueChange).toHaveBeenCalledWith('usage')
    expect(screen.getByText('usage panel')).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Usage' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  it('renders the sliding indicator as one element instead of a per-tab mark', () => {
    const { container } = render(<Harness />)

    expect(
      container.querySelectorAll('[data-slot="tabs-indicator"]')
    ).toHaveLength(1)
    // The per-tab underline is suppressed so the mark travels.
    expect(
      screen
        .getByRole('tab', { name: 'Keys' })
        .className.includes('after:hidden')
    ).toBe(true)
  })
})
