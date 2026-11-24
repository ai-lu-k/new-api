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
import { describe, expect, test } from 'vitest'

import { DEFAULT_CONFIG, DEFAULT_PARAMETER_ENABLED } from '../../../constants'
import type { Message, PlaygroundConfig } from '../../../types'
import { buildChatCompletionPayload } from '../payload-builder'

const INLINE_IMAGE = `![image](data:image/jpeg;base64,${'A'.repeat(64)})`

function configWith(overrides: Partial<PlaygroundConfig>): PlaygroundConfig {
  return { ...DEFAULT_CONFIG, ...overrides }
}

function userMessage(key: string, content: string): Message {
  return {
    key,
    from: 'user',
    versions: [{ id: 'v1', content }],
  }
}

describe('buildChatCompletionPayload streaming', () => {
  test('forces a non-streaming request for a chat-image model', () => {
    const payload = buildChatCompletionPayload(
      [userMessage('user-1', 'draw a cat')],
      configWith({ stream: true }),
      DEFAULT_PARAMETER_ENABLED,
      'chat-image'
    )

    expect(payload.stream).toBe(false)
  })

  test('keeps the configured streaming flag for a text model', () => {
    const payload = buildChatCompletionPayload(
      [userMessage('user-1', 'hello')],
      configWith({ stream: true }),
      DEFAULT_PARAMETER_ENABLED,
      'text'
    )

    expect(payload.stream).toBe(true)
  })
})

describe('buildChatCompletionPayload history redaction', () => {
  test('replaces an inline base64 image in the history with a placeholder', () => {
    const payload = buildChatCompletionPayload(
      [
        userMessage('user-1', 'draw a cat'),
        userMessage('user-2', INLINE_IMAGE),
      ],
      configWith({ model: 'gemini-3.1-flash-image' }),
      DEFAULT_PARAMETER_ENABLED,
      'chat-image'
    )

    const serialized = JSON.stringify(payload.messages)
    expect(serialized).not.toContain('base64')
    expect(payload.messages.at(-1)?.content).toBe('[image]')
  })

  test('keeps ordinary text and remote image urls intact', () => {
    const content = 'look at ![a](https://example.com/a.png) and say hi'
    const payload = buildChatCompletionPayload(
      [userMessage('user-1', content)],
      configWith({}),
      DEFAULT_PARAMETER_ENABLED,
      'text'
    )

    expect(payload.messages[0].content).toBe(content)
  })
})
