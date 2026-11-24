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
import { describe, expect, it } from 'vitest'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

function renderModelTabs() {
  return render(
    <Tabs defaultValue='models'>
      <TabsList aria-label='Usage analysis'>
        <TabsTrigger value='models'>Usage</TabsTrigger>
        <TabsTrigger value='flow'>Flow</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

describe('tabs selection styling', () => {
  it('keeps the selected label inverted under hover by guarding the hover colour', () => {
    renderModelTabs()

    const selected = screen.getByRole('tab', { name: 'Usage' })

    expect(selected).toHaveAttribute('data-active')
    expect(selected).toHaveClass('not-data-[active]:hover:text-foreground')
    expect(selected).not.toHaveClass('hover:text-foreground')
  })

  it('moves the guard with the selection so the newly selected tab is covered', async () => {
    renderModelTabs()

    await userEvent.click(screen.getByRole('tab', { name: 'Flow' }))

    const flow = screen.getByRole('tab', { name: 'Flow' })
    const models = screen.getByRole('tab', { name: 'Usage' })

    expect(flow).toHaveAttribute('data-active')
    expect(flow).toHaveAttribute('aria-selected', 'true')
    expect(models).not.toHaveAttribute('data-active')
    expect(models).toHaveAttribute('aria-selected', 'false')
  })

  it('renders a single travelling block instead of one block per tab', () => {
    const { container } = renderModelTabs()

    expect(
      container.querySelectorAll('[data-slot=tabs-indicator]')
    ).toHaveLength(1)
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.className).toContain('data-active:bg-transparent')
    }
  })
})
