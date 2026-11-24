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
import { afterEach, expect, it } from 'vitest'

import type { PricingModel } from '../../types'
import { ModelFreeBadge } from '../model-free-badge'
import { ModelTags } from '../model-tags'
import { PriceTierBadge } from '../price-tier-badge'
import { PricingMark } from '../pricing-mark'

afterEach(cleanup)

const model = (modelName: string): PricingModel =>
  ({
    id: 1,
    model_name: modelName,
    quota_type: 0,
    model_ratio: 1,
  }) as PricingModel

it('squares off the touching end of a joined pair', () => {
  const { container } = render(
    <>
      <PricingMark label='a' join='start' />
      <PricingMark label='b' join='end' />
    </>
  )

  const [start, end] = container.querySelectorAll("[data-slot='status-badge']")
  expect(start.className).toContain('rounded-r-none')
  expect(end.className).toContain('rounded-l-none')
})

it('keeps a lone mark rounded on both ends and centres its label', () => {
  const { container } = render(<PricingMark label='a' />)

  const mark = container.querySelector("[data-slot='status-badge']")
  expect(mark?.className).toContain('rounded-md')
  expect(mark?.className).toContain('justify-center')
})

it('joins the two marks a free model carries into one block', () => {
  const { container } = render(<ModelFreeBadge model={model('hy4-free')} />)

  const marks = [...container.querySelectorAll("[data-slot='status-badge']")]
  expect(marks.map((mark) => mark.textContent)).toEqual([
    'Free',
    'Limited quota',
  ])
  // The ink half is the offer, the muted half its condition; the pair touches,
  // with no gap and no rule between them.
  expect(marks[0].className).toContain('bg-foreground')
  expect(marks[1].className).toContain('bg-muted')
  expect(marks[0].parentElement?.className).not.toContain('gap')
})

it('says nothing about a paid model', () => {
  const { container } = render(<ModelFreeBadge model={model('hy4')} />)

  expect(container.innerHTML).toBe('')
})

it('reads the free mark only at the end of a name', () => {
  render(<ModelFreeBadge model={model('free-tier-preview')} />)

  expect(screen.queryByText('Free')).toBeNull()
})

it('marks a free tier as well as a free model', () => {
  render(<ModelFreeBadge model={model('nemotron-3.5-lightning:free')} />)

  expect(screen.getByText('Free')).toBeVisible()
})

it('marks a price tier on a tint of its own colour', () => {
  const { container } = render(<PriceTierBadge multiplier={0.5} />)

  const mark = container.querySelector("[data-slot='status-badge']")
  expect(mark?.textContent).toContain('50')
  expect(mark?.className).toContain('bg-success/12')
  expect(mark?.className).toContain('text-success')
  // One width for every tier: the column of marks lines up whatever the figure.
  expect(mark?.className).toContain('min-w-14')
})

it('marks nothing for a model sold at its official price', () => {
  const { container } = render(<PriceTierBadge multiplier={undefined} />)

  expect(container.innerHTML).toBe('')
})

it('writes each catalog tag on the muted surface', () => {
  const { container } = render(<ModelTags tags='画质优先,按次计费' />)

  const marks = [...container.querySelectorAll("[data-slot='status-badge']")]
  expect(marks.map((mark) => mark.textContent)).toEqual([
    '画质优先',
    '按次计费',
  ])
  expect(marks.every((mark) => mark.className.includes('bg-muted'))).toBe(true)
})

it('leaves out a tag every model in the list already carries', () => {
  const { container } = render(
    <ModelTags tags='生图,速度优先' omit={['生图']} />
  )

  expect(
    [...container.querySelectorAll("[data-slot='status-badge']")].map(
      (mark) => mark.textContent
    )
  ).toEqual(['速度优先'])
})

it('says nothing when a model has no tag of its own', () => {
  const { container } = render(<ModelTags tags='生图' omit={['生图']} />)

  expect(container.innerHTML).toBe('')
})

it('gives a known tag its own mark and leaves an unknown one plain', () => {
  const { container } = render(<ModelTags tags='画质优先,某个新标签' />)

  const marks = [...container.querySelectorAll("[data-slot='status-badge']")]
  expect(marks[0].querySelector('svg')).not.toBeNull()
  expect(marks[1].querySelector('svg')).toBeNull()
})
