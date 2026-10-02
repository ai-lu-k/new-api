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
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { ensureAgentKey } from '../agent-key'

type Row = Record<string, unknown>

const unrestricted: Row = {
  id: 11,
  name: 'Codex',
  key: 'abcd**********wxyz',
  status: 1,
  group: 'auto',
  unlimited_quota: true,
  expired_time: -1,
  model_limits_enabled: false,
  allow_ips: '',
}

let rows: Row[]
let created: Row[]
let createResult: Row

beforeEach(() => {
  rows = []
  created = []
  createResult = { success: true, message: '' }
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (!String(url).startsWith('/api/token/search?keyword=Codex')) {
      throw new Error(`Unexpected request: ${url}`)
    }
    return { data: { success: true, data: { items: rows } } }
  })
  vi.spyOn(api, 'post').mockImplementation(async (url, body) => {
    if (url === '/api/token/') {
      created.push(body as Row)
      if (createResult.success) rows = [...rows, { ...unrestricted, id: 12 }]
      return { data: createResult }
    }
    const reveal = /^\/api\/token\/(\d+)\/key$/.exec(String(url))
    if (reveal) {
      return { data: { success: true, data: { key: `full-key-${reveal[1]}` } } }
    }
    throw new Error(`Unexpected request: ${url}`)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

it('hands back the key the account already has for the client', async () => {
  rows = [unrestricted]

  await expect(ensureAgentKey('Codex')).resolves.toBe('sk-full-key-11')
  expect(created).toEqual([])
})

it('creates an unrestricted key in the Auto group when there is none', async () => {
  await expect(ensureAgentKey('Codex')).resolves.toBe('sk-full-key-12')

  expect(created).toEqual([
    {
      name: 'Codex',
      remain_quota: 0,
      expired_time: -1,
      unlimited_quota: true,
      model_limits_enabled: false,
      model_limits: '',
      allow_ips: '',
      group: 'auto',
      auto_groups: [],
      cross_group_retry: true,
    },
  ])
})

it.each([
  ['disabled', { status: 2 }],
  ['tied to one group', { group: 'GPT' }],
  ['limited to some models', { model_limits_enabled: true }],
  ['limited to some addresses', { allow_ips: '10.0.0.1' }],
  ['expiring', { expired_time: 1790000000 }],
  ['capped', { unlimited_quota: false }],
  ['named differently', { name: 'Codex 2' }],
])('makes a new key rather than use one that is %s', async (_, change) => {
  rows = [{ ...unrestricted, ...change }]

  await expect(ensureAgentKey('Codex')).resolves.toBe('sk-full-key-12')
  expect(created).toHaveLength(1)
})

it('passes on why the server would not create a key', async () => {
  createResult = { success: false, message: 'API key limit reached' }

  await expect(ensureAgentKey('Codex')).rejects.toThrow('API key limit reached')
})
