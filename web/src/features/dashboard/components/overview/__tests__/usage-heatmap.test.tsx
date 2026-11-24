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
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { UsageHeatmap } from '../usage-heatmap'

const props = {
  start: Date.parse('2026-10-01T00:00:00+08:00') / 1000,
  end: Date.parse('2026-10-25T12:00:00+08:00') / 1000,
  data: [
    { date: '2026-10-24', token_used: 1200, quota: 100_000 },
    { date: '2026-10-25', token_used: 400, quota: 50_000 },
  ],
  loading: false,
  error: false,
  onRetry: vi.fn(),
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-25T12:00:00+08:00'))
})

afterEach(() => vi.restoreAllMocks())

it('shows hovered daily usage in a tooltip while keeping period totals fixed', async () => {
  const user = userEvent.setup()
  render(<UsageHeatmap {...props} />)
  const details = screen.getByRole('status')
  expect(details).toHaveTextContent('Total 1.6K Tokens')
  const yesterday = screen.getByRole('button', { name: /: 1,200 Tokens$/ })
  await user.hover(yesterday)
  expect(await screen.findByRole('tooltip')).toHaveTextContent('1.2K Tokens')
  expect(details).toHaveTextContent('Total 1.6K Tokens')
  expect(yesterday).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('tooltip')).toHaveTextContent('Oct 24, 2026')
  await user.unhover(yesterday)
  await waitFor(() =>
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  )
  expect(details).toHaveTextContent('Total 1.6K Tokens')
})

it('keeps a focused tooltip after pointer exit and closes it when focus leaves', async () => {
  const user = userEvent.setup()
  render(<UsageHeatmap {...props} />)
  const yesterday = screen.getByRole('button', { name: /: 1,200 Tokens$/ })
  await user.hover(yesterday)
  act(() => yesterday.focus())
  await user.unhover(yesterday)
  expect(await screen.findByRole('tooltip')).toHaveTextContent('1.2K Tokens')
  await user.tab()
  await waitFor(() =>
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  )
  expect(screen.getByRole('status')).toHaveTextContent('Total 1.6K Tokens')
})

it('uses one calendar tab stop and arrow keys to inspect adjacent days including zero usage', async () => {
  const user = userEvent.setup()
  render(<UsageHeatmap {...props} />)
  const today = screen.getByRole('button', { name: /: 400 Tokens$/ })
  expect(today).toHaveAttribute('tabindex', '0')
  expect(
    screen.getByRole('button', { name: /: 1,200 Tokens$/ })
  ).toHaveAttribute('tabindex', '-1')
  await user.click(today)
  await user.keyboard('{ArrowUp}')
  expect(await screen.findByRole('tooltip')).toHaveTextContent('1.2K Tokens')
  await user.keyboard('{ArrowUp}')
  expect(await screen.findByRole('tooltip')).toHaveTextContent('0 Tokens')
  await user.keyboard('{Escape}')
  await waitFor(() =>
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  )
  expect(screen.getByRole('status')).toHaveTextContent('Total 1.6K Tokens')
})

it('retains a touched date across metric changes and resets after a tap outside the calendar', async () => {
  const user = userEvent.setup()
  render(<UsageHeatmap {...props} />)
  const yesterday = screen.getByRole('button', { name: /: 1,200 Tokens$/ })
  await user.pointer([
    { keys: '[TouchA>]', target: yesterday },
    { keys: '[/TouchA]' },
  ])
  expect(await screen.findByRole('tooltip')).toHaveTextContent('1.2K Tokens')
  fireEvent.click(screen.getByRole('tab', { name: 'Quota usage' }))
  expect(await screen.findByRole('tooltip')).toHaveTextContent('$0.2')
  expect(screen.getByRole('status')).toHaveTextContent('Total $0.3')
  fireEvent.pointerDown(document.body, { pointerType: 'touch' })
  await waitFor(() =>
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  )
  expect(screen.getByRole('status')).toHaveTextContent('Total $0.3')
})

it('keeps valid history during background refresh or failure and provides retry', async () => {
  const user = userEvent.setup()
  const { rerender } = render(<UsageHeatmap {...props} />)
  rerender(<UsageHeatmap {...props} loading />)
  expect(screen.getByRole('table')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Total 1.6K Tokens')
  rerender(<UsageHeatmap {...props} error />)
  expect(screen.getByRole('table')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  expect(props.onRetry).toHaveBeenCalledOnce()
  rerender(<UsageHeatmap {...props} error loading />)
  expect(
    screen.queryByRole('button', { name: 'Retry' })
  ).not.toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Refreshing...' })).toBeInTheDocument()
})

it('draws the days as one ribbon of weeks and keeps it scrollable on a narrow card', () => {
  render(<UsageHeatmap {...props} />)
  const card = screen.getByRole('region', { name: 'Daily activity' })
  // The strip is one row, so the card sizes to its content instead of 240px.
  expect(card).toHaveClass('h-auto', '@container/heatmap')
  expect(
    within(card).getByRole('heading').closest('[data-slot="section-heading"]')
  ).toHaveClass('@max-[400px]/heatmap:flex-col')
  const today = screen.getByRole('button', { name: /: 400 Tokens$/ })
  const strip = today.parentElement as HTMLElement
  expect(strip.style.gridTemplateColumns).toMatch(
    /^repeat\(\d+, minmax\(0, 1fr\)\)$/
  )
  expect(strip.style.gridTemplateRows).toBe(
    'repeat(7, var(--heatmap-cell-size))'
  )
  expect(within(card).getByText('Mon')).toBeVisible()
  expect(today.closest('.overflow-x-auto')).toBeInTheDocument()
})

it('closes the tooltip after a mouse-clicked cell loses both hover and focus', async () => {
  const user = userEvent.setup()
  render(<UsageHeatmap {...props} />)
  await user.click(screen.getByRole('button', { name: /: 1,200 Tokens$/ }))
  expect(await screen.findByRole('tooltip')).toHaveTextContent('1.2K Tokens')
  await user.click(screen.getByRole('heading', { name: 'Daily activity' }))
  await waitFor(() =>
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  )
  expect(screen.getByRole('status')).toHaveTextContent('Total 1.6K Tokens')
})

it('keeps the requested range so every quiet day keeps its own empty cell', () => {
  render(
    <UsageHeatmap
      {...props}
      start={Date.parse('2026-08-01T00:00:00+08:00') / 1000}
      data={[{ date: '2026-10-18', token_used: 1000, quota: 1000 }]}
    />
  )
  // One recorded day does not shrink the calendar: the asked-for months stay.
  expect(screen.getByTitle('Aug 1 – Oct 25 · Beijing time')).toBeVisible()
  const cells = screen.getAllByRole('button', { name: /Tokens$/ })
  expect(cells.length).toBeGreaterThan(80)
  expect(cells.length).toBeLessThan(90)
})

it('keeps the full canvas and skips the range panel when records span many weeks', () => {
  render(
    <UsageHeatmap
      {...props}
      start={Date.parse('2026-01-01T00:00:00+08:00') / 1000}
      data={[
        { date: '2026-04-01', token_used: 500, quota: 500 },
        { date: '2026-10-25', token_used: 400, quota: 50_000 },
      ]}
    />
  )
  expect(screen.getByTitle('Jan 1 – Oct 25 · Beijing time')).toBeVisible()
  expect(screen.queryByText('Date range')).not.toBeInTheDocument()
  expect(
    screen.getAllByRole('button', { name: /Tokens$/ }).length
  ).toBeGreaterThan(200)
})

it('distinguishes first loading, no records and failure without displaying fabricated zero usage', () => {
  const { rerender } = render(<UsageHeatmap {...props} data={[]} loading />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading...')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  rerender(<UsageHeatmap {...props} data={[]} />)
  expect(screen.getByRole('status')).toHaveTextContent('No activity yet')
  rerender(<UsageHeatmap {...props} data={[]} error />)
  expect(screen.getByRole('status')).toHaveTextContent('Failed to load')
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  expect(screen.getByRole('status')).not.toHaveTextContent('0 Tokens')
})

it('sums only the displayed period and counts days with usage independently of the selected metric', async () => {
  const user = userEvent.setup()
  render(
    <UsageHeatmap
      {...props}
      data={[
        ...props.data,
        { date: '2026-09-30', token_used: 9999, quota: 500_000 },
        { date: '2026-10-23', token_used: 0, quota: 0 },
        { date: '2026-10-22', token_used: 0, quota: 50_000 },
      ]}
    />
  )
  const summary = screen.getByRole('status')
  expect(summary).toHaveTextContent('Active days · 3')
  expect(summary).toHaveTextContent('Total 1.6K Tokens')
  await user.click(screen.getByRole('tab', { name: 'Quota usage' }))
  expect(summary).toHaveTextContent('Active days · 3')
  expect(summary).toHaveTextContent('Total $0.4')
})

it.each([
  ['zhCN', '3.12亿', '周日'],
  ['zhTW', '3.12億', '週日'],
  ['en', '312.35M', 'Sun'],
  ['fr', '312,35 M', 'dim.'],
  ['ja', '3.12億', '日'],
  ['ru', '312,35 млн', 'вс'],
  ['vi', '312,35 Tr', 'CN'],
  ['bad_locale', '312.35M', 'Sun'],
])(
  'unitizes token totals and tooltip values for %s and responds to language changes',
  async (language, value, sunday) => {
    const user = userEvent.setup()
    await act(async () => {
      await i18next.changeLanguage(language)
    })
    try {
      render(
        <UsageHeatmap
          {...props}
          data={[{ date: '2026-10-25', token_used: 312345678, quota: 0 }]}
        />
      )
      expect(screen.getByRole('status')).toHaveTextContent(value)
      await user.hover(
        screen.getByRole('button', { name: /312.*345.*678 Tokens$/ })
      )
      expect(await screen.findByRole('tooltip')).toHaveTextContent(value)
      expect(screen.getByRole('tooltip')).toHaveTextContent(sunday)
      await act(async () => {
        await i18next.changeLanguage('en')
      })
      expect(screen.getByRole('status')).toHaveTextContent('312.35M')
    } finally {
      await act(async () => {
        await i18next.changeLanguage('en')
      })
    }
  }
)

it('keeps recent days visible after shrinking the calendar and preserves a manually scrolled position on later resizes', () => {
  // The card and the sliding tab marker both observe their box, so every
  // callback has to fire; taking only the last one would test the marker.
  const resizes: (() => void)[] = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resizes.push(callback)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const resize = () => {
    for (const callback of resizes) callback()
  }
  try {
    render(<UsageHeatmap {...props} />)
    const cell = screen.getByRole('button', { name: /: 400 Tokens$/ })
    const scroll = cell.closest('.overflow-x-auto') as HTMLDivElement
    Object.defineProperty(scroll, 'scrollWidth', {
      configurable: true,
      value: 600,
    })
    Object.defineProperty(scroll, 'clientWidth', {
      configurable: true,
      value: 300,
    })
    act(() => resize())
    expect(scroll.scrollLeft).toBe(600)
    scroll.scrollLeft = 80
    fireEvent.scroll(scroll)
    Object.defineProperty(scroll, 'clientWidth', {
      configurable: true,
      value: 200,
    })
    act(() => resize())
    expect(scroll.scrollLeft).toBe(80)
  } finally {
    vi.unstubAllGlobals()
  }
})

it('keeps every day on one row height and stretches it to its week column', () => {
  render(<UsageHeatmap {...props} />)
  const today = screen.getByRole('button', { name: /: 400 Tokens$/ })
  expect(today).toHaveClass('h-[var(--heatmap-cell-size)]', 'w-full')
})
