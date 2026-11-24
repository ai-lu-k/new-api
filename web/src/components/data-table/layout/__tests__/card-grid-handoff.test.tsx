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
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DataTableCardGrid } from '../card-grid'

// The handoff ships switched off (2026-11-05, `PAGE_TRANSITIONS_ENABLED` in
// `lib/motion.ts`). The moving-path case below restores it; the last case keeps
// the shipped state honest, so the switch is read live instead of baked in.
const motionSwitch = vi.hoisted(() => ({ pageTransitions: true }))

vi.mock('@/lib/motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/motion')>()
  return {
    ...actual,
    get PAGE_TRANSITIONS_ENABLED() {
      return motionSwitch.pageTransitions
    },
  }
})

type Key = { id: number; name: string }

const COLUMNS: ColumnDef<Key, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
]

type StubAnimation = {
  target: Element
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
}

let cardTops = new Map<string, number>()
let animations: StubAnimation[] = []

function allowMotion(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
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

function installBrowserStubs(): void {
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: function animate(
      this: Element,
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions
    ) {
      animations.push({ target: this, keyframes, options })
      return {
        // Exits are covered by the primitive's own tests.
        addEventListener: () => undefined,
        finish: () => undefined,
        cancel: () => undefined,
      } as unknown as Animation
    },
  })

  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function boundingClientRect(this: Element) {
      const key = this.getAttribute('data-diff-key')
      const top = key ? (cardTops.get(key) ?? 0) : 0
      const height = key ? 120 : 0
      return {
        x: 0,
        y: top,
        top,
        left: 0,
        width: 320,
        height,
        right: 320,
        bottom: top + height,
        toJSON: () => ({}),
      } as DOMRect
    }
  )
}

function KeyGrid(props: { keys: Key[] }) {
  const table = useReactTable({
    data: props.keys,
    columns: COLUMNS,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row: Key) => String(row.id),
  })

  return (
    <DataTableCardGrid
      table={table}
      getRowKey={(row) => String(row.original.id)}
      renderCard={(row) => <span>{row.original.name}</span>}
    />
  )
}

function animationsFor(key: string): StubAnimation[] {
  return animations.filter(
    (animation) => (animation.target as HTMLElement).dataset.diffKey === key
  )
}

beforeEach(() => {
  animations = []
  cardTops = new Map()
  motionSwitch.pageTransitions = true
  allowMotion()
  installBrowserStubs()
})

afterEach(() => {
  delete (Element.prototype as { animate?: unknown }).animate
  document.body.innerHTML = ''
})

describe('DataTableCardGrid handoff', () => {
  it('moves the one card a filter keeps and drops the other two', () => {
    cardTops = new Map([
      ['1', 0],
      ['2', 132],
      ['3', 264],
    ])
    const { rerender } = render(
      <KeyGrid
        keys={[
          { id: 1, name: 'alpha' },
          { id: 2, name: 'beta' },
          { id: 3, name: 'gamma' },
        ]}
      />
    )
    expect(animations).toHaveLength(0)

    // Only the middle card survives the filter; it moves up into the gap.
    cardTops = new Map([['2', 0]])
    rerender(<KeyGrid keys={[{ id: 2, name: 'beta' }]} />)

    const moved = animationsFor('2')
    expect(moved).toHaveLength(1)
    expect(moved[0].keyframes).toEqual([
      { transform: 'translate3d(0px, 132px, 0) scale(1, 1)' },
      { transform: 'none' },
    ])
    // A kept card travels; it never replays an entrance.
    expect(moved[0].keyframes.some((frame) => 'opacity' in frame)).toBe(false)

    const ghosts = [
      ...document.querySelectorAll<HTMLElement>('[data-motion-ghost]'),
    ]
    expect(ghosts.map((ghost) => ghost.style.top)).toEqual(['0px', '264px'])
  })

  it('renders the filtered grid without moving or dropping a card when the switch is off', () => {
    motionSwitch.pageTransitions = false
    cardTops = new Map([
      ['1', 0],
      ['2', 132],
      ['3', 264],
    ])
    const { container, rerender } = render(
      <KeyGrid
        keys={[
          { id: 1, name: 'alpha' },
          { id: 2, name: 'beta' },
          { id: 3, name: 'gamma' },
        ]}
      />
    )

    cardTops = new Map([['2', 0]])
    rerender(<KeyGrid keys={[{ id: 2, name: 'beta' }]} />)

    expect(animations).toHaveLength(0)
    expect(document.querySelectorAll('[data-motion-ghost]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-diff-key]')).toHaveLength(1)
  })
})
