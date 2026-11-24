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
import { describe, expect, it } from 'vitest'

import { StatRow, type StatRowItem } from '../stat-row'

const ITEMS: StatRowItem[] = [
  { key: 'credit', label: 'Credit remaining', value: '$10', valueText: '$10' },
  { key: 'requests', label: 'Requests', value: '42', valueText: '42' },
]

describe('StatRow', () => {
  it('renders each metric as a label followed by its value', () => {
    const { container } = render(<StatRow columns={2} items={ITEMS} />)

    const label = screen.getByText('Credit remaining')
    expect(label.tagName).toBe('DT')
    expect(label.nextElementSibling?.tagName).toBe('DD')
    expect(label.nextElementSibling).toHaveTextContent('$10')
    expect(container.querySelectorAll('dt')).toHaveLength(2)
    expect(container.querySelectorAll('dd')).toHaveLength(2)
  })

  it('keeps the wide-screen column count and the analysis value scale', () => {
    const { container } = render(
      <StatRow columns={4} size='analytics' items={ITEMS} />
    )

    const row = container.querySelector('dl')
    expect(row).toHaveClass('grid-cols-2', 'lg:grid-cols-4')
    // The value sits in a keyed span that fades in, so the typographic scale
    // is asserted on the cell that owns it.
    const value = screen.getByText('$10').closest('dd')
    expect(value).toHaveClass('text-2xl', 'lg:text-3xl', 'tabular-nums')
  })

  it('reserves the value slot with a skeleton while a metric loads', () => {
    render(<StatRow columns={2} items={[{ ...ITEMS[0], loading: true }]} />)

    const value = screen.getByText('Credit remaining').nextElementSibling
    expect(value?.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
    expect(value).not.toHaveAttribute('aria-label')
  })

  it('stacks a three-metric row into two phone columns instead of one cramped row', () => {
    const { container } = render(<StatRow columns={3} items={ITEMS} />)

    const row = container.querySelector('dl')
    expect(row).toHaveClass('grid-cols-2', 'sm:grid-cols-3')
    expect(row).not.toHaveClass('grid-cols-3')
  })

  it('drops the rule gutter of the metric that starts a wrapped phone row', () => {
    const four: StatRowItem[] = [
      ...ITEMS,
      { key: 'usage', label: 'Total usage', value: '$20', valueText: '$20' },
      { key: 'calls', label: 'API requests', value: '7', valueText: '7' },
    ]
    const { container } = render(<StatRow columns={4} items={four} />)

    const cells = [...container.querySelectorAll('dl > div')]
    expect(cells[0]).not.toHaveClass('ps-4')
    expect(cells[1]).toHaveClass('ps-4')
    // The third metric opens the second phone row: no left gutter until the
    // row fits on one line again.
    expect(cells[2]).toHaveClass('max-lg:ps-0', 'lg:ps-4')
  })

  it('keeps a long amount on one line instead of breaking inside the digits', () => {
    render(<StatRow columns={2} items={ITEMS} />)

    const value = screen.getByText('$10').closest('dd')
    expect(value).toHaveClass('whitespace-nowrap')
    expect(value?.className).not.toContain('overflow-wrap')
  })

  it('exposes the plain-text value to assistive tech when the value is composed', () => {
    render(
      <StatRow
        columns={2}
        items={[
          {
            key: 'usage',
            label: 'Usage',
            value: <span>$10</span>,
            valueText: '$10',
          },
        ]}
      />
    )

    const value = screen.getByText('Usage').nextElementSibling
    expect(value).toHaveAttribute('aria-label', '$10')
    expect(within(value as HTMLElement).getByText('$10')).toBeVisible()
  })

  it('renders the hint below the value on an analysis page', () => {
    render(
      <StatRow
        columns={2}
        size='analytics'
        items={[
          {
            ...ITEMS[0],
            hint: <span>Gift used $4</span>,
          },
        ]}
      />
    )

    const value = screen.getByText('Credit remaining').nextElementSibling
    expect(value).toHaveTextContent('$10')
    expect(value).not.toContainElement(screen.getByText('Gift used $4'))
    expect(screen.getByText('Credit remaining').parentElement).toContainElement(
      screen.getByText('Gift used $4')
    )
  })

  it('leaves the hint out on a list page, whose values have no second line', () => {
    render(
      <StatRow
        columns={2}
        items={[{ ...ITEMS[0], hint: <span>Gift used $4</span> }]}
      />
    )

    expect(screen.queryByText('Gift used $4')).not.toBeInTheDocument()
  })
})
