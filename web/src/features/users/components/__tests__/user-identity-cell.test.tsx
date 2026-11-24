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
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import type { User } from '../../types'
import { UserIdentityCell } from '../user-identity-cell'

const USER: User = {
  id: 62,
  username: 'user-062',
  display_name: '黎舟',
  role: 1,
  status: 1,
  quota: 46.93,
  used_quota: 20.92,
  request_count: 0,
  group: 'default',
  created_at: 1760000000,
  last_login_at: 1793700000,
}

afterEach(cleanup)

it('keeps the display name and both timestamps on one secondary line', () => {
  render(<UserIdentityCell user={USER} />)

  const displayName = screen.getByText('黎舟')
  const created = screen.getByText('Created')
  const lastLogin = screen.getByText('Last Login')

  expect(created.parentElement).toContainElement(displayName)
  expect(created.parentElement).toContainElement(lastLogin)
  // The account name is the only primary line; everything else is muted meta.
  expect(screen.getByText('user-062')).toBeVisible()
})

it('falls back to dashes when the account never logged in', () => {
  render(<UserIdentityCell user={{ ...USER, last_login_at: 0 }} />)

  // One dash for the missing last login, and the labels stay in place.
  expect(screen.getAllByText('-')).toHaveLength(1)
  expect(screen.getByText('Last Login')).toBeVisible()
})
