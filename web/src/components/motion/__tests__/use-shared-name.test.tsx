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
import { describe, expect, it } from 'vitest'

import { sharedElementName, useSharedName } from '../use-shared-name'

function Claim(props: { name: string | undefined; testId: string }) {
  const shared = useSharedName(props.name)

  return (
    <div data-testid={props.testId} {...shared}>
      {props.testId}
    </div>
  )
}

describe('sharedElementName', () => {
  it('builds one name both sides of a list-to-detail handoff can agree on', () => {
    expect(sharedElementName('card', 42)).toBe('card-42')
  })

  it('turns characters a transition name cannot hold into dashes', () => {
    expect(sharedElementName('card', 'sk-1.2/ab')).toBe('card-sk-1-2-ab')
  })
})

describe('useSharedName', () => {
  it('gives a single claimant the transition name', () => {
    const { container } = render(<Claim name='card-1' testId='only' />)
    const element = container.querySelector('[data-vt-name="card-1"]')

    expect(element).not.toBeNull()
    expect(
      (element as HTMLElement).style.getPropertyValue('view-transition-name')
    ).toBe('card-1')
  })

  it('keeps the first claimant and neutralises a duplicate', () => {
    const { container } = render(
      <>
        <Claim name='card-1' testId='first' />
        <Claim name='card-1' testId='second' />
      </>
    )
    const elements = [
      ...container.querySelectorAll<HTMLElement>('[data-vt-name="card-1"]'),
    ]

    expect(elements).toHaveLength(2)
    expect(elements[0].style.getPropertyValue('view-transition-name')).toBe(
      'card-1'
    )
    expect(elements[1].style.getPropertyValue('view-transition-name')).toBe(
      'none'
    )
  })

  it('takes no part in the transition when no name is claimed', () => {
    const { container } = render(<Claim name={undefined} testId='plain' />)

    expect(container.querySelector('[data-vt-name]')).toBeNull()
  })
})
