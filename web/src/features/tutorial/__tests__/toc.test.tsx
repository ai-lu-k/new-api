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
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { renderTutorial } from './render-tutorial'

beforeEach(() => {
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: { success: true, data: url === '/api/notice' ? '' : {} },
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('points each contents entry at the section it names', async () => {
  const user = userEvent.setup()
  await renderTutorial()

  const contents = screen.getByRole('navigation', { name: 'Tutorial contents' })
  const entry = within(contents).getByRole('link', {
    name: /For agents and scripts/,
  })

  expect(entry).toHaveAttribute('href', '#step-agent')
  expect(document.querySelector('#step-agent')).not.toBeNull()

  await user.click(entry)

  expect(document.querySelector('#step-agent')).toBeInTheDocument()
})

it('marks the section the observer reports as the one being read', async () => {
  const callbacks: IntersectionObserverCallback[] = []
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        callbacks.push(callback)
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  )

  await renderTutorial()

  const target = document.querySelector('#step-call')
  expect(target).not.toBeNull()
  expect(callbacks).toHaveLength(1)

  act(() => {
    callbacks[0](
      [
        {
          target,
          isIntersecting: true,
          boundingClientRect: { top: 64 },
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver
    )
  })

  const contents = screen.getByRole('navigation', { name: 'Tutorial contents' })
  const entry = within(contents).getByRole('link', {
    name: /Make one request/,
  })
  expect(entry).toHaveAttribute('aria-current', 'true')
})

it('marks the contents with one square for the whole list, not one per entry', async () => {
  const callbacks: IntersectionObserverCallback[] = []
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        callbacks.push(callback)
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  )

  await renderTutorial()

  const contents = screen.getByRole('navigation', { name: 'Tutorial contents' })
  const marks = () =>
    contents.querySelectorAll("[data-slot='tutorial-toc-indicator']")
  expect(marks()).toHaveLength(1)

  // Moving the reader to another section moves the same single mark; it does
  // not add a second one, and no entry paints a square of its own.
  act(() => {
    callbacks[0](
      [
        {
          target: document.querySelector('#step-agent'),
          isIntersecting: true,
          boundingClientRect: { top: 64 },
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver
    )
  })

  expect(marks()).toHaveLength(1)
  expect(marks()[0]).toHaveAttribute('aria-hidden', 'true')
})
