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
import { afterEach, describe, expect, it } from 'vitest'

import { buildCCSwitchURL } from '../cc-switch'

describe('CC Switch import link', () => {
  afterEach(() => {
    window.localStorage.removeItem('status')
  })

  it('hands each application the address form it expects', () => {
    window.localStorage.setItem(
      'status',
      JSON.stringify({ server_address: 'https://ai.example.test' })
    )
    const link = (app: Parameters<typeof buildCCSwitchURL>[0]) =>
      new URL(buildCCSwitchURL(app, 'LUK', { model: 'some-model' }, 'sk-abc'))

    const claude = link('claude')
    expect(claude.protocol).toBe('ccswitch:')
    expect(Object.fromEntries(claude.searchParams)).toEqual({
      resource: 'provider',
      app: 'claude',
      name: 'LUK',
      endpoint: 'https://ai.example.test',
      apiKey: 'sk-abc',
      model: 'some-model',
      homepage: 'https://ai.example.test',
      enabled: 'true',
    })
    expect(link('gemini').searchParams.get('endpoint')).toBe(
      'https://ai.example.test'
    )
    for (const app of ['codex', 'opencode', 'openclaw'] as const) {
      expect(link(app).searchParams.get('app')).toBe(app)
      expect(link(app).searchParams.get('endpoint')).toBe(
        'https://ai.example.test/v1'
      )
    }
  })
})
