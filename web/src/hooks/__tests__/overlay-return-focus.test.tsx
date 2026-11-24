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
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useOverlayReturnFocus } from '@/hooks/use-overlay-return-focus'

const OVERLAY_ID = 'overlay-under-test'

/**
 * Minimal stand-in for a dialog opened from state (no trigger element): the
 * overlay is a sibling of the button and unmounts when `open` turns false.
 */
function Harness(props: { open: boolean }) {
  const { handleOpenChange } = useOverlayReturnFocus()
  return (
    <>
      <button type='button' onClick={() => handleOpenChange(true)}>
        Create channel
      </button>
      {props.open ? (
        <div data-slot='dialog-content' id={OVERLAY_ID}>
          <input aria-label='name' />
        </div>
      ) : null}
      <button type='button' onClick={() => handleOpenChange(false)}>
        Close
      </button>
    </>
  )
}

/**
 * Same idea, but the overlay is driven by the `open` prop like `Dialog` and
 * `Sheet` do for state-driven overlays.
 */
function ControlledHarness(props: { open: boolean; onClose: () => void }) {
  const { handleOpenChange } = useOverlayReturnFocus(props.open)
  return (
    <>
      <button type='button' onClick={() => props.onClose()}>
        Create code
      </button>
      {props.open ? (
        <div data-slot='sheet-content'>
          <input aria-label='code' />
          <button
            type='button'
            onClick={() => {
              handleOpenChange(false)
              props.onClose()
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

it('returns focus to the button that opened a state-driven dialog', () => {
  const { rerender } = render(<Harness open={false} />)

  const trigger = screen.getByRole('button', { name: 'Create channel' })
  // Browsers focus a button on click; jsdom does not, so the test says so.
  trigger.focus()
  fireEvent.click(trigger)
  rerender(<Harness open />)
  screen.getByLabelText('name').focus()
  expect(document.activeElement).toBe(screen.getByLabelText('name'))

  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  rerender(<Harness open={false} />)
  act(() => {
    vi.advanceTimersByTime(300)
  })

  expect(document.activeElement).toBe(trigger)
})

it('leaves focus alone while another layer is still open', () => {
  const { rerender } = render(<Harness open={false} />)

  const trigger = screen.getByRole('button', { name: 'Create channel' })
  // Browsers focus a button on click; jsdom does not, so the test says so.
  trigger.focus()
  fireEvent.click(trigger)
  rerender(<Harness open />)
  screen.getByLabelText('name').focus()

  // A second overlay keeps the user inside a layer; focus must not be pulled
  // back to the page while it is visible.
  const nested = document.createElement('div')
  nested.setAttribute('data-slot', 'dialog-content')
  document.body.append(nested)

  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  rerender(<Harness open={false} />)
  act(() => {
    vi.advanceTimersByTime(1200)
  })

  expect(document.activeElement).not.toBe(trigger)
  nested.remove()
})

it('returns focus for a controlled overlay closed from inside the layer', () => {
  const { rerender } = render(
    <ControlledHarness open={false} onClose={vi.fn()} />
  )

  const opener = screen.getByRole('button', { name: 'Create code' })
  opener.focus()
  fireEvent.pointerDown(opener)

  rerender(<ControlledHarness open onClose={vi.fn()} />)
  screen.getByLabelText('code').focus()
  expect(document.activeElement).toBe(screen.getByLabelText('code'))

  rerender(<ControlledHarness open onClose={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  rerender(<ControlledHarness open={false} onClose={vi.fn()} />)
  act(() => {
    vi.advanceTimersByTime(300)
  })

  expect(document.activeElement).toBe(opener)
})

it('does not steal focus back from a control the user moved to', () => {
  const { rerender } = render(<Harness open={false} />)

  const trigger = screen.getByRole('button', { name: 'Create channel' })
  // Browsers focus a button on click; jsdom does not, so the test says so.
  trigger.focus()
  fireEvent.click(trigger)
  rerender(<Harness open />)

  const elsewhere = screen.getByRole('button', { name: 'Close' })
  elsewhere.focus()
  fireEvent.click(elsewhere)
  rerender(<Harness open={false} />)
  act(() => {
    vi.advanceTimersByTime(300)
  })

  expect(document.activeElement).toBe(elsewhere)
})
