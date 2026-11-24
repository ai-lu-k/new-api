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
import { getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LogsFilterToolbar } from '../logs-filter-toolbar'

function ToolbarFixture(props: { extra?: boolean; onSearch?: () => void }) {
  const table = useReactTable({
    data: [],
    columns: [{ id: 'created_at', header: 'Time' }],
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <LogsFilterToolbar
      table={table}
      primaryFilters={<input aria-label='Date Range' />}
      desktopSecondaryFilters={<input aria-label='Request ID' />}
      desktopExtraFilters={
        props.extra ? <input aria-label='Username filter' /> : undefined
      }
      hasActiveFilters={false}
      onReset={vi.fn()}
      onSearch={props.onSearch ?? vi.fn()}
    />
  )
}

afterEach(cleanup)

describe('LogsFilterToolbar desktop rows', () => {
  it('keeps the block title row to the title and the column menu', async () => {
    render(<ToolbarFixture extra />)

    const heading = screen.getByRole('heading', { name: 'Request records' })
    const row = heading.parentElement as HTMLElement

    expect(within(row).getByText('Request records')).toBeTruthy()
    // Admin conditions belong to the filter grid, never beside the title.
    expect(within(row).queryByRole('textbox')).toBeNull()
  })

  it('puts secondary and admin-only conditions on their own grid rows', () => {
    render(<ToolbarFixture extra />)

    const requestId = screen.getByRole('textbox', { name: 'Request ID' })
    const username = screen.getByRole('textbox', { name: 'Username filter' })
    const heading = screen.getByRole('heading', { name: 'Request records' })

    expect(requestId.closest('.grid')).not.toBe(username.closest('.grid'))
    expect(heading.closest('.grid')).toBeNull()
  })

  it('omits the admin row when the view has no admin-only conditions', () => {
    render(<ToolbarFixture />)

    expect(
      screen.queryByRole('textbox', { name: 'Username filter' })
    ).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Request ID' })).toBeTruthy()
  })

  it('reports a search from the single toolbar button', async () => {
    const onSearch = vi.fn()
    render(<ToolbarFixture onSearch={onSearch} />)

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(onSearch).toHaveBeenCalledTimes(1)
  })
})
