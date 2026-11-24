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
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useListDiffTransition } from '../use-list-diff-transition'

type Item = { key: string; top: number }

type FakeAnimation = {
  target: Element
}

/**
 * The shipped state: `PAGE_TRANSITIONS_ENABLED` is false, so a result-set change
 * must render the new rows and nothing else — no FLIP, no ghost, no entrance.
 * `Element.animate` is stubbed so a stray call would be visible, and motion is
 * left allowed (`prefers-reduced-motion` off) so the switch is the only reason
 * for the silence.
 */
let animations: FakeAnimation[] = []

function installAnimationStub(): void {
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: function animate(this: Element) {
      const record: FakeAnimation = { target: this }
      animations.push(record)
      return record as unknown as Animation
    },
  })

  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function boundingClientRect(this: Element) {
      const top = Number(this.getAttribute('data-test-top') ?? 0)
      const height = Number(this.getAttribute('data-test-height') ?? 0)
      return {
        x: 0,
        y: top,
        top,
        left: 0,
        width: 200,
        height,
        right: 200,
        bottom: top + height,
        toJSON: () => ({}),
      } as DOMRect
    }
  )
}

function setReducedMotion(reduced: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

function KeyedList(props: { items: Item[]; signature: string }) {
  const listRef = React.useRef<HTMLDivElement>(null)
  useListDiffTransition(listRef, props.signature)

  return (
    <div ref={listRef}>
      {props.items.map((item) => (
        <div
          key={item.key}
          data-diff-key={item.key}
          data-test-top={String(item.top)}
          data-test-height='40'
        />
      ))}
    </div>
  )
}

const PAGE_ONE: Item[] = [
  { key: 'a', top: 0 },
  { key: 'b', top: 40 },
  { key: 'c', top: 80 },
]

beforeEach(() => {
  animations = []
  installAnimationStub()
  setReducedMotion(false)
})

afterEach(() => {
  delete (Element.prototype as { animate?: unknown }).animate
  document.body.innerHTML = ''
})

describe('useListDiffTransition with the handoff switched off', () => {
  it('renders the new result set without a FLIP, a ghost or an entrance', () => {
    const { rerender, container } = render(
      <KeyedList items={PAGE_ONE} signature='page-1' />
    )

    rerender(<KeyedList items={[PAGE_ONE[0]]} signature='page-2' />)

    expect(animations).toHaveLength(0)
    expect(document.querySelectorAll('[data-motion-ghost]')).toHaveLength(0)
    expect(
      [...container.querySelectorAll('[data-diff-key]')].map((node) =>
        node.getAttribute('data-diff-key')
      )
    ).toEqual(['a'])
  })

  it('keeps the rows still and un-transformed after a same-size page change', () => {
    const { rerender, container } = render(
      <KeyedList items={PAGE_ONE} signature='page-1' />
    )

    // A server-side page of the same length: every row is new, none may rise in.
    rerender(
      <KeyedList
        items={[
          { key: 'd', top: 0 },
          { key: 'e', top: 40 },
          { key: 'f', top: 80 },
        ]}
        signature='page-2'
      />
    )

    expect(animations).toHaveLength(0)
    expect(document.querySelectorAll('[data-motion-ghost]')).toHaveLength(0)
    const rows = [...container.querySelectorAll<HTMLElement>('[data-diff-key]')]
    expect(rows.map((row) => row.dataset.diffKey)).toEqual(['d', 'e', 'f'])
    for (const row of rows) {
      expect(row.getAttribute('style')).toBeNull()
    }
  })
})
