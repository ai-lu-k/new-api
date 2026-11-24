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
import { beforeEach, describe, expect, test } from 'vitest'

import { STORAGE_KEYS } from '../../../constants'
import type { Message } from '../../../types'
import { loadMessages, saveMessages } from '../storage'

const imageMessage: Message = {
  key: 'assistant-image',
  from: 'assistant',
  versions: [{ id: 'v1', content: 'Generated 1 image' }],
  status: 'complete',
  images: ['data:image/png;base64,QUJD'],
}

const inlineImageMessage: Message = {
  key: 'assistant-chat-image',
  from: 'assistant',
  versions: [
    {
      id: 'v1',
      content: `![image](data:image/jpeg;base64,${'A'.repeat(2048)})`,
    },
  ],
  status: 'complete',
}

beforeEach(() => {
  localStorage.clear()
})

describe('playground message storage', () => {
  test('keeps the image summary but drops the image payloads', () => {
    saveMessages([imageMessage])

    const stored = localStorage.getItem(STORAGE_KEYS.MESSAGES) ?? ''
    expect(stored).toContain('Generated 1 image')
    expect(stored).not.toContain('data:image/png;base64')
    expect(stored).not.toContain('"images"')
  })

  test('reloads an image message as a summary-only message', () => {
    saveMessages([imageMessage])

    const [loaded] = loadMessages() ?? []

    expect(loaded?.versions[0].content).toBe('Generated 1 image')
    expect(loaded?.images).toBeUndefined()
  })

  test('stores a chat-image answer without its base64 payload', () => {
    saveMessages([inlineImageMessage])

    const stored = localStorage.getItem(STORAGE_KEYS.MESSAGES) ?? ''
    expect(stored).not.toContain('base64')
    expect(stored).toContain('[image]')
  })

  test('reloads a chat-image answer with the placeholder text', () => {
    saveMessages([inlineImageMessage])

    const [loaded] = loadMessages() ?? []

    expect(loaded?.versions[0].content).toBe('[image]')
  })
})
