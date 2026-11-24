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

import { renderAuditContent, truncateMiddle } from '../format'

const t = (key: string, options?: Record<string, unknown>) =>
  key.replaceAll(/{{(\w+)}}/g, (_match, name: string) =>
    options && options[name] != null ? String(options[name]) : `{{${name}}}`
  )

describe('renderAuditContent', () => {
  it('names the HTTP call for a generic operation instead of leaving placeholders', () => {
    const text = renderAuditContent(
      {
        op: { action: 'generic', params: {} },
        audit_info: {
          method: 'POST',
          route: '/api/option/',
          success: true,
        },
      },
      t
    )

    expect(text).toBe('POST /api/option/')
    expect(text).not.toContain('{{')
  })

  it('returns null for a generic operation without a recorded request', () => {
    expect(
      renderAuditContent({ op: { action: 'generic', params: {} } }, t)
    ).toBeNull()
  })
})

describe('truncateMiddle', () => {
  it('keeps the shared head and the distinguishing tail of a long name', () => {
    const short = truncateMiddle('deepseek-v4.1-flash-x0.15', 16, 5)

    expect(short).toBe('deepseek-v…x0.15')
    expect(short.length).toBe(16)
  })

  it('leaves a name that already fits untouched', () => {
    expect(truncateMiddle('team-codex-sync', 20)).toBe('team-codex-sync')
  })
})
