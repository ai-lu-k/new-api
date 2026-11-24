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

import { DataTableView } from '../data-table-view'
import { getListEntranceSignature } from '../list-signature'

// The page handoff ships switched off (2026-11-05, `PAGE_TRANSITIONS_ENABLED` in
// `lib/motion.ts`); the table's own row hand-off does not go through it. The
// switch is read live here so both states stay honest.
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

type Person = { id: number; name: string }

const PAGE_ONE: Person[] = [
  { id: 1, name: 'one' },
  { id: 2, name: 'two' },
  { id: 3, name: 'three' },
]

const COLUMNS: ColumnDef<Person, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
]

type StubAnimation = {
  target: Element
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  addEventListener: (type: string, listener: () => void) => void
}

/** Row boxes follow the entity id, exactly as a rendered page would lay out. */
let rowTops = new Map<string, number>()
let animations: StubAnimation[] = []

/**
 * `src/test-setup.ts` reports reduced motion for the whole suite, and the
 * handoff is instant under it. These cases are about the moving path.
 */
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
      const record: StubAnimation = {
        target: this,
        keyframes,
        options,
        // Exits are covered by the primitive's own tests.
        addEventListener: () => undefined,
      }
      animations.push(record)
      return {
        ...record,
        finish: () => undefined,
        cancel: () => undefined,
      } as unknown as Animation
    },
  })

  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function boundingClientRect(this: Element) {
      const key = this.getAttribute('data-diff-key')
      const top = key ? (rowTops.get(key) ?? 0) : 0
      const height = key ? 40 : 0
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

function PeopleTable(props: {
  data: Person[]
  withRowId?: boolean
  isLoading?: boolean
}) {
  const table = useReactTable({
    data: props.data,
    columns: COLUMNS,
    getCoreRowModel: getCoreRowModel(),
    // Without an explicit row id TanStack falls back to the row index, which is
    // the case the entity-id fallback exists for.
    getRowId:
      props.withRowId === false ? undefined : (row: Person) => String(row.id),
  })

  return <DataTableView table={table} isLoading={props.isLoading} />
}

function rowKeys(container: HTMLElement): string[] {
  return [...container.querySelectorAll('tbody [data-diff-key]')].map(
    (row) => row.getAttribute('data-diff-key') ?? ''
  )
}

function animationsFor(key: string): StubAnimation[] {
  return animations.filter(
    (animation) => (animation.target as HTMLElement).dataset.diffKey === key
  )
}

function ghostAnimations(): StubAnimation[] {
  return animations.filter((animation) =>
    (animation.target as HTMLElement).hasAttribute('data-motion-ghost')
  )
}

beforeEach(() => {
  animations = []
  rowTops = new Map()
  motionSwitch.pageTransitions = true
  allowMotion()
  installBrowserStubs()
})

afterEach(() => {
  delete (Element.prototype as { animate?: unknown }).animate
  document.body.innerHTML = ''
})

describe('DataTableView row identity', () => {
  it('gives every body row a diff key taken from the row id', () => {
    const { container } = render(<PeopleTable data={PAGE_ONE} />)

    expect(rowKeys(container)).toEqual(['1', '2', '3'])
  })

  it('falls back to the entity id when the table declares no row id', () => {
    const { container } = render(
      <PeopleTable
        data={[
          { id: 41, name: 'kept' },
          { id: 42, name: 'other' },
        ]}
        withRowId={false}
      />
    )

    // Row ids are 0/1 here; the keys must not be, or page 2 would look like
    // page 1 and the handoff would move nothing.
    expect(rowKeys(container)).toEqual(['41', '42'])
  })
})

describe('getListEntranceSignature', () => {
  const keyed = (id: string, index: number, original: unknown) => ({
    id,
    index,
    original,
  })

  it('changes when an index-keyed table swaps the entities behind the rows', () => {
    const pageOne = [keyed('0', 0, { id: 41 }), keyed('1', 1, { id: 42 })]
    const pageTwo = [keyed('0', 0, { id: 43 }), keyed('1', 1, { id: 44 })]

    expect(getListEntranceSignature(pageOne, undefined)).not.toBe(
      getListEntranceSignature(pageTwo, undefined)
    )
  })

  it('stays the same when only selection or column visibility moves', () => {
    const rows = [keyed('0', 0, { id: 41 })]

    expect(
      getListEntranceSignature(rows, {
        pagination: { pageIndex: 0, pageSize: 20 },
      })
    ).toBe(
      getListEntranceSignature(rows, {
        pagination: { pageIndex: 0, pageSize: 20 },
        rowSelection: { 0: true },
        columnVisibility: { name: false },
      })
    )
  })
})

describe('DataTableView row hand-off', () => {
  it('raises the arriving rows and fades the ones that left', () => {
    rowTops = new Map([
      ['1', 0],
      ['2', 40],
      ['3', 80],
    ])
    const { container, rerender } = render(<PeopleTable data={PAGE_ONE} />)
    expect(animations).toHaveLength(0)

    // Page two keeps row 3 and brings a new row 4.
    rowTops = new Map([
      ['3', 0],
      ['4', 40],
    ])
    rerender(
      <PeopleTable
        data={[
          { id: 3, name: 'three' },
          { id: 4, name: 'four' },
        ]}
      />
    )

    expect(rowKeys(container)).toEqual(['3', '4'])

    // The kept row travels from 80px to 0 and does not fade: it never left
    // the table, it only changed place.
    const kept = animationsFor('3')
    expect(kept).toHaveLength(1)
    expect(kept[0].keyframes).toEqual([
      { transform: 'translate3d(0px, 80px, 0)' },
      { transform: 'none' },
    ])
    expect(kept[0].keyframes.some((frame) => 'opacity' in frame)).toBe(false)

    // The arriving row rises a micro step while it fades in.
    const arriving = animationsFor('4')
    expect(arriving).toHaveLength(1)
    expect(arriving[0].keyframes).toEqual([
      { opacity: 0, transform: 'translate3d(0, 4px, 0)' },
      { opacity: 1, transform: 'none' },
    ])
    expect(arriving[0].options).toMatchObject({ duration: 220, delay: 0 })

    // The two rows that left fade out as ghosts, outside the table layout —
    // and they keep the content they had, not the content of the row that
    // replaced them.
    const ghosts = [
      ...document.querySelectorAll<HTMLElement>('[data-motion-ghost]'),
    ]
    expect(ghosts).toHaveLength(2)
    expect(ghosts.map((ghost) => ghost.textContent)).toEqual(['one', 'two'])
    expect(ghostAnimations()).toHaveLength(2)
    expect(ghostAnimations()[0].keyframes).toEqual([
      { opacity: 1 },
      { opacity: 0 },
    ])
    expect(ghostAnimations()[0].options).toMatchObject({ duration: 140 })
  })

  it('washes a row whose content was replaced in place', () => {
    const { rerender } = render(<PeopleTable data={PAGE_ONE} />)
    animations = []

    // Same identity, new name: the row stays put and only its fill pulses.
    rerender(
      <PeopleTable
        data={[{ id: 1, name: 'renamed' }, PAGE_ONE[1], PAGE_ONE[2]]}
      />
    )

    const pulsed = animationsFor('1')
    expect(pulsed).toHaveLength(1)
    const frames = pulsed[0].keyframes
    expect(frames).toHaveLength(2)
    expect(Object.keys(frames[0])).toEqual(['backgroundColor'])
    expect(Object.keys(frames[1])).toEqual(['backgroundColor'])
    expect(frames.some((frame) => 'transform' in frame)).toBe(false)
    expect(pulsed[0].options).toMatchObject({ duration: 140 })
  })

  it('travels the rows that survived a re-order instead of washing them', () => {
    rowTops = new Map([
      ['1', 0],
      ['2', 40],
      ['3', 80],
    ])
    const { rerender } = render(<PeopleTable data={PAGE_ONE} />)
    animations = []

    // Same three rows, reversed by a sort: nothing arrived or left.
    rowTops = new Map([
      ['1', 80],
      ['2', 40],
      ['3', 0],
    ])
    rerender(<PeopleTable data={[PAGE_ONE[2], PAGE_ONE[1], PAGE_ONE[0]]} />)

    const moved = animationsFor('1')
    expect(moved).toHaveLength(1)
    expect(moved[0].keyframes).toEqual([
      { transform: 'translate3d(0px, -80px, 0)' },
      { transform: 'none' },
    ])
    expect(moved[0].keyframes.some((frame) => 'opacity' in frame)).toBe(false)
    expect(moved[0].options).toMatchObject({ duration: 220 })

    // A row that did not move is not animated at all.
    expect(animationsFor('2')).toHaveLength(0)
    expect(document.querySelectorAll('[data-motion-ghost]')).toHaveLength(0)
  })

  it('crosses from the skeleton rows to the content rows', () => {
    rowTops = new Map()
    const { container, rerender } = render(<PeopleTable data={[]} isLoading />)
    const skeletonKeys = rowKeys(container)
    expect(skeletonKeys.length).toBeGreaterThan(0)

    rerender(<PeopleTable data={PAGE_ONE} />)

    // The placeholder rows leave as ghosts and the real rows rise in, so the
    // table is never empty for a frame.
    expect(document.querySelectorAll('[data-motion-ghost]')).toHaveLength(
      skeletonKeys.length
    )
    expect(animationsFor('1')).toHaveLength(1)
    expect(animationsFor('1')[0].keyframes).toEqual([
      { opacity: 0, transform: 'translate3d(0, 4px, 0)' },
      { opacity: 1, transform: 'none' },
    ])
  })

  it('hands rows over even though the page handoff switch is off', () => {
    motionSwitch.pageTransitions = false
    rowTops = new Map([
      ['1', 0],
      ['2', 40],
      ['3', 80],
    ])
    const { container, rerender } = render(<PeopleTable data={PAGE_ONE} />)

    rowTops = new Map([
      ['3', 0],
      ['4', 40],
    ])
    rerender(
      <PeopleTable
        data={[
          { id: 3, name: 'three' },
          { id: 4, name: 'four' },
        ]}
      />
    )

    // The table reports its own result changes; the route-level switch only
    // governs the page handoff.
    expect(rowKeys(container)).toEqual(['3', '4'])
    expect(animationsFor('4')).toHaveLength(1)
    expect(document.querySelectorAll('[data-motion-ghost]')).toHaveLength(2)
  })
})
