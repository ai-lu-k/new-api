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
import { act, render, waitFor } from '@testing-library/react'
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  type ListDiffTransitionHandle,
  useListDiffTransition,
} from '../use-list-diff-transition'

// The list handoff is switched off in the shipped build (2026-11-05, see
// `PAGE_TRANSITIONS_ENABLED` in `lib/motion.ts`). These cases guard the behaviour
// that comes back when the switch is turned on again, so the flag is overridden
// here; `list-diff-transition-disabled.test.tsx` covers the shipped state.
vi.mock('@/lib/motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/motion')>()
  return { ...actual, PAGE_TRANSITIONS_ENABLED: true }
})

type Item = { key: string; top: number }

type FakeAnimation = {
  target: Element
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  listeners: Map<string, Array<() => void>>
  addEventListener: (type: string, listener: () => void) => void
  finish: () => void
  cancel: () => void
}

/**
 * jsdom has neither `Element.animate` nor geometry, so both browser boundaries
 * are stubbed here: boxes come from `data-test-top`/`data-test-height`, and
 * every `animate` call is recorded so the assertions can read the keyframes the
 * handoff actually asked for.
 */
let animations: FakeAnimation[] = []

function installAnimationStub(): void {
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: function animate(
      this: Element,
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions
    ) {
      const emit = (type: string) => {
        for (const listener of record.listeners.get(type) ?? []) listener()
      }
      const record: FakeAnimation = {
        target: this,
        keyframes,
        options,
        listeners: new Map(),
        addEventListener: (type: string, listener: () => void) => {
          const registered = record.listeners.get(type) ?? []
          registered.push(listener)
          record.listeners.set(type, registered)
        },
        finish: () => emit('finish'),
        cancel: () => emit('cancel'),
      }
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

function KeyedList(props: {
  items: Item[]
  signature: string
  onReady?: (handle: ListDiffTransitionHandle) => void
}) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const handle = useListDiffTransition(listRef, props.signature)

  React.useEffect(() => {
    props.onReady?.(handle)
  }, [handle, props])

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

function animationsFor(key: string): FakeAnimation[] {
  return animations.filter(
    (animation) => (animation.target as HTMLElement).dataset.diffKey === key
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

describe('useListDiffTransition', () => {
  it('does not animate the first mount', () => {
    render(<KeyedList items={PAGE_ONE} signature='page-1' />)

    expect(animations).toHaveLength(0)
    expect(document.querySelectorAll('[data-motion-ghost]')).toHaveLength(0)
  })

  it('moves a retained item with a transform-only FLIP instead of re-entering it', () => {
    const { rerender } = render(
      <KeyedList items={PAGE_ONE} signature='page-1' />
    )

    // The same three rows, re-ordered: `a` and `b` swap places, `c` stays put.
    rerender(
      <KeyedList
        items={[
          { key: 'b', top: 0 },
          { key: 'a', top: 40 },
          { key: 'c', top: 80 },
        ]}
        signature='sort-asc'
      />
    )

    const flipped = animationsFor('a')
    expect(flipped).toHaveLength(1)
    expect(flipped[0].keyframes).toEqual([
      { transform: 'translate3d(0px, -40px, 0) scale(1, 1)' },
      { transform: 'none' },
    ])
    // No opacity anywhere: the row never left, so it must not fade.
    expect(flipped[0].keyframes.some((frame) => 'opacity' in frame)).toBe(false)
    expect(flipped[0].options).toMatchObject({
      duration: 320,
      easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
    })

    // A retained item that did not move is left alone.
    expect(animationsFor('c')).toHaveLength(0)
  })

  it('drops a ghost of every item that left and removes it when the exit ends', async () => {
    const { rerender } = render(
      <KeyedList items={PAGE_ONE} signature='page-1' />
    )

    rerender(<KeyedList items={[PAGE_ONE[0]]} signature='filter-one' />)

    const ghosts = [
      ...document.querySelectorAll<HTMLElement>('[data-motion-ghost]'),
    ]
    expect(ghosts).toHaveLength(2)
    // Out of the flow, over the old box, so the surviving row closes the gap.
    expect(ghosts[0].style.position).toBe('fixed')
    expect(ghosts.map((ghost) => ghost.style.top)).toEqual(['40px', '80px'])
    expect(ghosts[0].getAttribute('aria-hidden')).toBe('true')

    act(() => {
      for (const animation of animations) animation.finish()
    })

    await waitFor(() => {
      expect(document.querySelectorAll('[data-motion-ghost]')).toHaveLength(0)
    })
  })

  it('rises every new item in at most four 20 ms rungs', () => {
    const { rerender } = render(
      <KeyedList items={[{ key: 'a', top: 0 }]} signature='page-1' />
    )

    rerender(
      <KeyedList
        items={[
          { key: 'a', top: 0 },
          { key: 'd', top: 40 },
          { key: 'e', top: 80 },
          { key: 'f', top: 120 },
          { key: 'g', top: 160 },
        ]}
        signature='page-2'
      />
    )

    const delays = ['d', 'e', 'f', 'g'].map((key) => {
      const entering = animationsFor(key)
      expect(entering).toHaveLength(1)
      expect(entering[0].keyframes).toEqual([
        { opacity: 0.6, transform: 'translate3d(0, -8px, 0)' },
        { opacity: 1, transform: 'none' },
      ])
      expect(entering[0].options).toMatchObject({
        duration: 220,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'backwards',
      })
      return entering[0].options.delay
    })

    expect(delays).toEqual([0, 20, 40, 60])
  })

  it('animates nothing under reduced motion but still updates the list', () => {
    setReducedMotion(true)
    const { rerender, container } = render(
      <KeyedList items={PAGE_ONE} signature='page-1' />
    )

    rerender(<KeyedList items={[PAGE_ONE[1]]} signature='page-2' />)

    expect(animations).toHaveLength(0)
    expect(document.querySelectorAll('[data-motion-ghost]')).toHaveLength(0)
    expect(
      [...container.querySelectorAll('[data-diff-key]')].map((node) =>
        node.getAttribute('data-diff-key')
      )
    ).toEqual(['b'])
  })

  it('updates the list without ghosts when the platform cannot animate', () => {
    delete (Element.prototype as { animate?: unknown }).animate
    const { container, rerender } = render(
      <KeyedList items={PAGE_ONE} signature='page-1' />
    )

    rerender(<KeyedList items={[PAGE_ONE[0]]} signature='page-2' />)

    expect(animations).toHaveLength(0)
    expect(document.querySelectorAll('[data-motion-ghost]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-diff-key]')).toHaveLength(1)
  })

  it('keeps the list still when the signature did not change', () => {
    const { rerender } = render(
      <KeyedList items={PAGE_ONE} signature='page-1' />
    )

    // Same result set, rows re-ordered by a non-result change (selection, a
    // drawer opening): no handoff may replay.
    rerender(
      <KeyedList
        items={[
          { key: 'b', top: 0 },
          { key: 'a', top: 40 },
          { key: 'c', top: 80 },
        ]}
        signature='page-1'
      />
    )

    expect(animations).toHaveLength(0)
  })

  it('skips the next handoff on request', () => {
    let handle: ListDiffTransitionHandle | null = null
    const { rerender } = render(
      <KeyedList
        items={PAGE_ONE}
        signature='page-1'
        onReady={(ready) => {
          handle = ready
        }}
      />
    )

    act(() => {
      handle?.skipNext()
    })
    rerender(<KeyedList items={[PAGE_ONE[0]]} signature='page-2' />)

    expect(animations).toHaveLength(0)
    expect(document.querySelectorAll('[data-motion-ghost]')).toHaveLength(0)
  })
})
