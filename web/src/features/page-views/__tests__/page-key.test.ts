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

import { resolvePageKey } from '../lib/page-key'

const known = [
  '/dashboard/overview',
  '/dashboard/models',
  '/keys',
  '/usage-logs/common',
  '/usage-logs/audit',
  '/system-settings/site',
]

describe('resolvePageKey', () => {
  it('returns the navigation entry a nested path belongs to', () => {
    expect(resolvePageKey('/keys', known)).toBe('/keys')
    expect(resolvePageKey('/usage-logs/common', known)).toBe(
      '/usage-logs/common'
    )
    expect(resolvePageKey('/system-settings/site/brand', known)).toBe(
      '/system-settings/site'
    )
  })

  it('ignores a trailing slash so both spellings count as one page', () => {
    expect(resolvePageKey('/keys/', known)).toBe('/keys')
    expect(resolvePageKey('/usage-logs/common/', known)).toBe(
      '/usage-logs/common'
    )
  })

  it('returns null for paths outside the navigation', () => {
    expect(resolvePageKey('/sign-in', known)).toBeNull()
    expect(resolvePageKey('/chat/9f3c', known)).toBeNull()
    expect(resolvePageKey('/unknown', known)).toBeNull()
  })

  it('prefers the longest matching entry instead of a shorter prefix', () => {
    expect(
      resolvePageKey('/usage-logs/audit', ['/usage-logs', '/usage-logs/audit'])
    ).toBe('/usage-logs/audit')
    expect(resolvePageKey('/usage-logs/audit', ['/usage-logs'])).toBe(
      '/usage-logs'
    )
  })

  it('does not match a sibling path that merely shares a prefix', () => {
    expect(resolvePageKey('/keys-old', known)).toBeNull()
    expect(resolvePageKey('/dashboard', known)).toBeNull()
  })
})
