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
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'

import { DataTableFetchingMask } from '../data-table-fetching-mask'

function Fixture(props: { active: boolean }) {
  return (
    <DataTableFetchingMask active={props.active}>
      <p>previous-page-row</p>
    </DataTableFetchingMask>
  )
}

it('marks the list busy and shows a spinner while a page is being read', () => {
  render(<Fixture active />)
  // The rows of the previous page stay underneath, so the busy state has to be
  // stated explicitly instead of only dimming them a little.
  expect(screen.getByText('previous-page-row')).toBeInTheDocument()
  const busy = document.querySelector('[aria-busy="true"]')
  expect(busy).not.toBeNull()
  expect(busy).toHaveClass('opacity-30')
  expect(screen.getByText('Loading...')).toBeInTheDocument()
})

it('leaves the list clear and interactive once the new page has arrived', () => {
  render(<Fixture active={false} />)
  expect(screen.getByText('previous-page-row')).toBeInTheDocument()
  expect(document.querySelector('[aria-busy="true"]')).toBeNull()
  expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
})
