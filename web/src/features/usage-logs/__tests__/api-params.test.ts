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
import { describe, expect, it } from 'vitest'

import { buildApiParams } from '../lib/utils'

describe('buildApiParams', () => {
  it('omits the all-types sentinel so "All Types" asks for no type filter', () => {
    const params = buildApiParams({
      page: 1,
      pageSize: 100,
      searchParams: { type: ['0'] },
      columnFilters: [{ id: 'created_at', value: ['0'] }],
      isAdmin: true,
    })

    expect(params).not.toHaveProperty('type')
  })

  it('keeps a concrete log type filter', () => {
    const params = buildApiParams({
      page: 2,
      pageSize: 50,
      searchParams: { type: ['2'] },
      columnFilters: [{ id: 'created_at', value: ['2'] }],
      isAdmin: false,
    })

    expect(params.type).toBe(2)
    expect(params.p).toBe(2)
    expect(params.page_size).toBe(50)
  })
})
