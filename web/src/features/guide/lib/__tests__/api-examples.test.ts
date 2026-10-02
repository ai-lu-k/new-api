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

import type { SetupModel } from '../agents'
import {
  API_LANGUAGES,
  apiBaseUrl,
  apiStyleOf,
  buildApiExample,
  callableModels,
} from '../api-examples'

const chat: SetupModel = {
  id: 'deepseek/deepseek-v4.1-flash',
  protocols: ['openai-completions', 'anthropic-messages'],
}
const messagesOnly: SetupModel = {
  id: 'claude-sonnet-5-5',
  protocols: ['anthropic-messages'],
}
const responsesOnly: SetupModel = {
  id: 'codex-only',
  protocols: ['openai-responses'],
}

describe('which format a model is shown in', () => {
  it('is the OpenAI-compatible one wherever the model is served on it', () => {
    expect(apiStyleOf(chat)).toBe('openai')
    expect(apiStyleOf(messagesOnly)).toBe('anthropic')
  })

  it('leaves out models neither format can call', () => {
    expect(callableModels([chat, messagesOnly, responsesOnly])).toEqual([
      chat,
      messagesOnly,
    ])
  })

  it('points each kind of SDK at the base URL it expects', () => {
    expect(apiBaseUrl('openai', 'https://ai.example.test/')).toBe(
      'https://ai.example.test/v1'
    )
    // The Anthropic SDKs add /v1/messages themselves.
    expect(apiBaseUrl('anthropic', 'https://ai.example.test/')).toBe(
      'https://ai.example.test'
    )
  })
})

describe('call examples', () => {
  const example = (
    language: (typeof API_LANGUAGES)[number]['id'],
    style: 'openai' | 'anthropic'
  ) =>
    buildApiExample({
      language,
      style,
      address: 'https://ai.example.test/',
      apiKey: 'sk-test',
      model: style === 'openai' ? chat.id : messagesOnly.id,
    })

  it('are given for every language in both formats, with the key and the model', () => {
    for (const { id } of API_LANGUAGES) {
      expect(example(id, 'openai')).toContain('sk-test')
      expect(example(id, 'openai')).toContain(chat.id)
      expect(example(id, 'anthropic')).toContain('sk-test')
      expect(example(id, 'anthropic')).toContain(messagesOnly.id)
    }
  })

  it('send raw requests to the endpoint of the format, with its headers', () => {
    for (const language of ['curl', 'go', 'java'] as const) {
      const openai = example(language, 'openai')
      expect(openai).toContain('https://ai.example.test/v1/chat/completions')
      expect(openai).toContain('Bearer sk-test')

      const anthropic = example(language, 'anthropic')
      expect(anthropic).toContain('https://ai.example.test/v1/messages')
      expect(anthropic).toContain('x-api-key')
      expect(anthropic).toContain('anthropic-version')
      expect(anthropic).toContain('max_tokens')
    }
  })

  it('point the SDKs at the gateway instead of the vendor', () => {
    expect(example('python', 'openai')).toContain(
      'base_url="https://ai.example.test/v1"'
    )
    expect(example('node', 'openai')).toContain(
      'baseURL: "https://ai.example.test/v1"'
    )
    expect(example('python', 'anthropic')).toContain(
      'base_url="https://ai.example.test"'
    )
    expect(example('node', 'anthropic')).toContain(
      'baseURL: "https://ai.example.test"'
    )
  })

  it('carry a request body that is valid JSON', () => {
    for (const style of ['openai', 'anthropic'] as const) {
      const body = example('curl', style).split("-d '")[1].replace(/'$/, '')
      expect(JSON.parse(body)).toMatchObject({
        model: style === 'openai' ? chat.id : messagesOnly.id,
        messages: [{ role: 'user', content: 'Hello!' }],
      })
    }
  })
})
